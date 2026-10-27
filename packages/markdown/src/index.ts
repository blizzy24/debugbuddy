/**
 * Escape-first renderer for the markdown subset the DebugBuddy pipeline emits:
 * h1, h2, unordered lists, ordered lists, "- [ ]" checklist items, bold,
 * italic, horizontal rules, paragraphs.
 *
 * Every line is HTML-escaped before any markup is introduced, and the only
 * markup introduced is the fixed set of tags below, so the result is safe to
 * assign to innerHTML.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

/** Inline formatting on an already-escaped string. */
function inline(escaped: string): string {
  return escaped
    .replace(/\*\*(?=\S)(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*(?=\S)(.+?)\*(?![\w*])/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?=\S)(.+?)_(?!\w)/g, '$1<em>$2</em>');
}

type ListKind = 'ul' | 'ol' | 'check';

const H1 = /^#\s+(.*)$/;
const H2 = /^##\s+(.*)$/;
const H3_PLUS = /^#{3,6}\s+(.*)$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const CHECK = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const UL = /^\s*[-*+]\s+(.*)$/;
const OL = /^\s*(\d{1,9})[.)]\s+(.*)$/;

export function renderMarkdown(source: string): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: { kind: ListKind; items: string[] } | null = null;
  let olStart = 1;

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p class="md-p">${paragraph.join('<br>')}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (!list) return;
    const items = list.items.join('');
    if (list.kind === 'ol') {
      const start = olStart !== 1 ? ` start="${olStart}"` : '';
      out.push(`<ol class="md-ol"${start}>${items}</ol>`);
    } else if (list.kind === 'check') {
      out.push(`<ul class="md-checklist">${items}</ul>`);
    } else {
      out.push(`<ul class="md-ul">${items}</ul>`);
    }
    list = null;
  };

  const flush = () => {
    flushParagraph();
    flushList();
  };

  const pushItem = (kind: ListKind, html: string, start = 1) => {
    flushParagraph();
    if (!list || list.kind !== kind) {
      flushList();
      list = { kind, items: [] };
      olStart = start;
    }
    list.items.push(html);
  };

  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    if (!line.trim()) {
      flush();
      continue;
    }

    let m: RegExpExecArray | null;

    if (HR.test(line)) {
      flush();
      out.push('<hr class="md-hr">');
    } else if ((m = H1.exec(line))) {
      flush();
      out.push(`<h1 class="md-h1">${inline(escapeHtml(m[1] ?? ''))}</h1>`);
    } else if ((m = H2.exec(line))) {
      flush();
      out.push(`<h2 class="md-h2">${inline(escapeHtml(m[1] ?? ''))}</h2>`);
    } else if ((m = H3_PLUS.exec(line))) {
      // Not emitted by the pipeline today; degrade to an h2-styled heading rather than raw hashes.
      flush();
      out.push(`<h2 class="md-h2 md-h3">${inline(escapeHtml(m[1] ?? ''))}</h2>`);
    } else if ((m = CHECK.exec(line))) {
      const checked = m[1] !== ' ';
      const box = `<span class="md-box${checked ? ' md-box-checked' : ''}" aria-hidden="true"></span>`;
      const label = checked ? 'Done: ' : 'To do: ';
      pushItem(
        'check',
        `<li class="md-check${checked ? ' md-checked' : ''}">${box}<span class="md-sr">${label}</span><span>${inline(escapeHtml(m[2] ?? ''))}</span></li>`,
      );
    } else if ((m = UL.exec(line))) {
      pushItem('ul', `<li>${inline(escapeHtml(m[1] ?? ''))}</li>`);
    } else if ((m = OL.exec(line))) {
      pushItem('ol', `<li>${inline(escapeHtml(m[2] ?? ''))}</li>`, Number(m[1]));
    } else if (list && /^\s{2,}\S/.test(raw)) {
      // Indented continuation of the previous list item.
      const current: { kind: ListKind; items: string[] } = list;
      const last = current.items.pop() ?? '';
      const addition = ` ${inline(escapeHtml(line.trim()))}`;
      current.items.push(last.replace(/(<\/span>)?<\/li>$/, (_all, span: string | undefined) => `${addition}${span ?? ''}</li>`));
    } else {
      flushList();
      paragraph.push(inline(escapeHtml(line.trim())));
    }
  }

  flush();
  return out.join('\n');
}

// Added for the Jira integration. Independent of the HTML path above.
export { markdownToAdf, executiveSummary } from './toAdf';
export type { AdfDocument, AdfNode } from './toAdf';
