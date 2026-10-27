import { renderMarkdown } from '@debugbuddy/markdown';
import { ChatError, describeError, sendChat } from './api';
import { copyText, downloadMarkdown, printReport } from './reportActions';
import { clearState, loadState, saveState, type StoredMessage } from './storage';
import { styles } from './styles';

export interface WidgetConfig {
  apiKey: string;
  apiUrl: string;
}

const MAX_LENGTH = 5000;
const SLOW_AFTER_MS = 8000;

const GREETING =
  "Hi — I'm DebugBuddy. Tell me about the bug you ran into, in your own words: what you were doing, and what went wrong. I'll ask a few follow-up questions, then write it up for the engineering team.";

// Static, trusted SVG markup only.
const ICONS = {
  chat: '<svg class="icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12.5a7.5 7.5 0 0 1-11.06 6.6L4 20l.9-4.94A7.5 7.5 0 1 1 20 12.5Z"/><path d="M9 11h6M9 14h3.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  closeLauncher: '<svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  bug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="8" width="10" height="12" rx="5"/><path d="M9.5 8V6.5a2.5 2.5 0 0 1 5 0V8M12 12v8M3.5 13H7M17 13h3.5M4.5 8.5 7 10M19.5 8.5 17 10M4.5 18.5 7 17M19.5 18.5 17 17"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>',
  report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 14l2 2 4-4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v6H7z"/></svg>',
  retry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function readiness(content: string): number | null {
  const m = /Readiness:?\**\s*:?\s*(\d{1,3})\s*\/\s*100/i.exec(content);
  if (!m?.[1]) return null;
  return Math.max(0, Math.min(100, Number(m[1])));
}

export class DebugBuddyWidget {
  private readonly shadow: ShadowRoot;
  private readonly root: HTMLDivElement;
  private readonly launcher: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly thread: HTMLDivElement;
  private readonly input: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly counter: HTMLSpanElement;

  private sessionId: string | null;
  private messages: StoredMessage[];
  private pending = false;
  private open = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly config: WidgetConfig,
  ) {
    const stored = loadState(config.apiKey);
    this.sessionId = stored.sessionId;
    this.messages = stored.messages;

    const shadow = host.attachShadow({ mode: 'open' });
    this.shadow = shadow;
    const style = el('style');
    style.textContent = styles;
    shadow.appendChild(style);

    this.root = el('div', 'root');
    this.root.dataset.open = 'false';

    // Panel
    this.panel = el('div', 'panel');
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'DebugBuddy bug report chat');
    this.panel.setAttribute('aria-hidden', 'true');

    const header = el('div', 'header');
    const mark = el('div', 'mark');
    mark.innerHTML = ICONS.bug;
    const titles = el('div', 'titles');
    titles.append(el('p', 'title', 'Report a bug'), el('p', 'subtitle', 'DebugBuddy turns it into something engineers can fix.'));
    const close = el('button', 'close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = ICONS.close;
    close.addEventListener('click', () => this.setOpen(false));
    header.append(mark, titles, close);

    this.thread = el('div', 'thread');
    this.thread.setAttribute('role', 'log');
    this.thread.setAttribute('aria-live', 'polite');

    const composer = el('form', 'composer');
    const field = el('div', 'field');
    this.input = el('textarea');
    this.input.rows = 1;
    this.input.maxLength = MAX_LENGTH;
    this.input.placeholder = 'Describe what went wrong…';
    this.input.setAttribute('aria-label', 'Message');
    this.sendButton = el('button', 'send');
    this.sendButton.type = 'submit';
    this.sendButton.setAttribute('aria-label', 'Send');
    this.sendButton.innerHTML = ICONS.send;
    this.sendButton.disabled = true;
    field.append(this.input, this.sendButton);

    const hint = el('div', 'hint');
    const keys = el('span', 'hint-keys');
    keys.append(el('kbd', undefined, 'Enter'), document.createTextNode(' to send · '), el('kbd', undefined, 'Shift'), document.createTextNode(' + '), el('kbd', undefined, 'Enter'), document.createTextNode(' for a new line'));
    this.counter = el('span');
    hint.append(keys, this.counter);
    composer.append(field, hint);

    composer.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.submit();
      }
    });
    this.input.addEventListener('input', () => this.syncComposer());

    this.panel.append(header, this.thread, composer);

    // Launcher
    this.launcher = el('button', 'launcher');
    this.launcher.type = 'button';
    this.launcher.setAttribute('aria-label', 'Report a bug');
    this.launcher.setAttribute('aria-expanded', 'false');
    this.launcher.innerHTML = ICONS.chat + ICONS.closeLauncher;
    this.launcher.appendChild(el('span', 'launcher-dot'));
    this.launcher.addEventListener('click', () => this.setOpen(!this.open));

    this.root.append(this.panel, this.launcher);
    shadow.appendChild(this.root);

    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) this.setOpen(false);
    });

    this.renderInitialThread();
  }

  // ---------- open / close ----------

  private setOpen(open: boolean) {
    this.open = open;
    this.root.dataset.open = String(open);
    this.launcher.setAttribute('aria-expanded', String(open));
    this.launcher.setAttribute('aria-label', open ? 'Close bug report chat' : 'Report a bug');
    this.panel.setAttribute('aria-hidden', String(!open));
    if (open) {
      requestAnimationFrame(() => {
        this.scrollToEnd();
        this.input.focus({ preventScroll: true });
      });
    } else {
      this.launcher.focus({ preventScroll: true });
    }
  }

  // ---------- thread ----------

  private renderInitialThread() {
    this.appendAssistant(GREETING, 'text', false);
    for (const m of this.messages) {
      if (m.role === 'user') this.appendUser(m.content, false);
      else this.appendAssistant(m.content, m.kind, false);
    }
  }

  private record(message: StoredMessage) {
    this.messages.push(message);
    saveState(this.config.apiKey, { sessionId: this.sessionId, messages: this.messages });
  }

  private appendUser(text: string, persist = true) {
    const row = el('div', 'msg msg-user');
    row.appendChild(el('div', 'bubble', text));
    this.thread.appendChild(row);
    if (persist) this.record({ role: 'user', kind: 'text', content: text });
    this.scrollToEnd();
  }

  private appendAssistant(content: string, kind: StoredMessage['kind'], persist = true) {
    const row = kind === 'report' ? this.buildReport(content) : this.buildBubble(content);
    this.thread.appendChild(row);
    if (persist) this.record({ role: 'assistant', kind, content });
    this.scrollToEnd();
  }

  private buildBubble(content: string): HTMLElement {
    const row = el('div', 'msg msg-assistant');
    const bubble = el('div', 'bubble md');
    bubble.innerHTML = renderMarkdown(content); // escaped by the renderer
    row.appendChild(bubble);
    return row;
  }

  private buildReport(content: string): HTMLElement {
    const row = el('div', 'msg msg-report');
    const card = el('article', 'report');
    card.setAttribute('aria-label', 'Engineering report');

    const head = el('div', 'report-head');
    head.innerHTML = ICONS.report;
    head.appendChild(el('span', 'report-label', 'Engineering report'));
    const score = readiness(content);
    if (score !== null) head.appendChild(el('span', 'report-score', `${score}/100`));
    card.appendChild(head);

    if (score !== null) {
      const meter = el('div', 'meter');
      meter.setAttribute('role', 'meter');
      meter.setAttribute('aria-label', 'Readiness');
      meter.setAttribute('aria-valuemin', '0');
      meter.setAttribute('aria-valuemax', '100');
      meter.setAttribute('aria-valuenow', String(score));
      const fill = el('span');
      fill.style.width = `${score}%`;
      meter.appendChild(fill);
      card.appendChild(meter);
    }

    const body = el('div', 'report-body md');
    body.innerHTML = renderMarkdown(content); // escaped by the renderer
    card.appendChild(body);

    card.appendChild(this.buildReportActions(row, content));

    const foot = el('div', 'report-foot');
    foot.innerHTML = ICONS.check;
    foot.appendChild(el('span', undefined, 'Sent to the team. Your next message starts a new report.'));
    card.appendChild(foot);

    row.appendChild(card);
    return row;
  }

  private buildReportActions(row: HTMLElement, content: string): HTMLElement {
    const bar = el('div', 'report-actions');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Report actions');

    const action = (icon: string, label: string, run: (button: HTMLButtonElement) => void) => {
      const button = el('button', 'report-action');
      button.type = 'button';
      button.innerHTML = icon;
      const text = el('span', undefined, label);
      button.appendChild(text);
      button.addEventListener('click', () => run(button));
      bar.appendChild(button);
      return text;
    };

    const flash = (label: HTMLElement, message: string, original: string) => {
      label.textContent = message;
      window.setTimeout(() => {
        label.textContent = original;
      }, 1600);
    };

    const copyLabel = action(ICONS.copy, 'Copy', () => {
      void copyText(content, this.shadow).then((ok) => flash(copyLabel, ok ? 'Copied' : 'Copy failed', 'Copy'));
    });
    action(ICONS.download, 'Download', () => downloadMarkdown(content, this.shadow));
    action(ICONS.print, 'Print', () => printReport(this.root, row));

    return bar;
  }

  private showTyping(): () => void {
    const row = el('div', 'msg msg-assistant');
    const box = el('div', 'typing');
    box.setAttribute('role', 'status');
    const dots = el('span', 'dots');
    dots.setAttribute('aria-hidden', 'true');
    dots.append(el('span'), el('span'), el('span'));
    const label = el('span', 'typing-text', 'Reading your report…');
    box.append(dots, label);
    row.appendChild(box);
    this.thread.appendChild(row);
    this.scrollToEnd();

    const slow = window.setTimeout(() => {
      label.textContent = 'Still working — this usually takes 10–30 seconds.';
    }, SLOW_AFTER_MS);

    return () => {
      window.clearTimeout(slow);
      row.remove();
    };
  }

  private showError(err: ChatError, retryText: string) {
    const { text, retryable } = describeError(err);
    const row = el('div', 'msg msg-assistant');
    const box = el('div', 'error');
    box.setAttribute('role', 'alert');
    box.appendChild(el('div', undefined, text));
    if (retryable) {
      const actions = el('div', 'error-actions');
      const retry = el('button', 'retry');
      retry.type = 'button';
      retry.innerHTML = ICONS.retry;
      retry.appendChild(document.createTextNode('Try again'));
      retry.addEventListener('click', () => {
        if (this.pending) return;
        row.remove();
        void this.exchange(retryText);
      });
      actions.appendChild(retry);
      box.appendChild(actions);
    }
    row.appendChild(box);
    this.thread.appendChild(row);
    this.scrollToEnd();
  }

  private scrollToEnd() {
    this.thread.scrollTop = this.thread.scrollHeight;
  }

  // ---------- composer ----------

  private syncComposer() {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(this.input.scrollHeight, 132)}px`;
    const length = this.input.value.length;
    this.counter.textContent = length > MAX_LENGTH * 0.8 ? `${length}/${MAX_LENGTH}` : '';
    this.sendButton.disabled = this.pending || !this.input.value.trim();
  }

  private submit() {
    const text = this.input.value.trim();
    if (!text || this.pending) return;
    this.input.value = '';
    this.syncComposer();
    this.appendUser(text);
    void this.exchange(text);
  }

  /** One round trip. Never throws; failures render in the thread. */
  private async exchange(text: string) {
    this.pending = true;
    this.syncComposer();
    const hideTyping = this.showTyping();

    try {
      const reply = await sendChat(this.config.apiUrl, this.config.apiKey, text, this.sessionId);
      hideTyping();
      this.sessionId = reply.sessionId;
      this.appendAssistant(reply.content, reply.type);
      if (reply.type === 'report') {
        // Conversation done: forget the session so the next message starts fresh.
        this.sessionId = null;
        this.messages = [];
        clearState(this.config.apiKey);
      }
    } catch (err) {
      hideTyping();
      const chatError = err instanceof ChatError ? err : new ChatError(0, 'unknown', String(err));
      if (chatError.code === 'session_forbidden') {
        this.sessionId = null;
        saveState(this.config.apiKey, { sessionId: null, messages: this.messages });
      }
      this.showError(chatError, text);
    } finally {
      this.pending = false;
      this.syncComposer();
      if (this.open) this.input.focus({ preventScroll: true });
    }
  }
}
