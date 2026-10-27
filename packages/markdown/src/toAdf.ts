/**
 * Markdown → Atlassian Document Format (ADF), for Jira issue descriptions.
 *
 * Deliberately independent of the HTML renderer in index.ts: that path is
 * frozen, so this file has its own small line parser. The duplication is
 * intentional. NOTE for later: once the demo is behind us, both could share
 * one parser that produces a node tree, with HTML and ADF as two renderers.
 *
 * Handles the subset the DebugBuddy pipeline emits: headings 1–3 (deeper are
 * clamped to 3), paragraphs, bullet lists, ordered lists, "- [ ]" / "- [x]"
 * task lists, **strong**, *em* / _em_, `inline code`, and rules.
 * https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
 */

type Mark = { type: 'strong' } | { type: 'em' } | { type: 'code' };
type InlineNode = { type: 'text'; text: string; marks?: Mark[] } | { type: 'hardBreak' };

export type AdfNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[] | InlineNode[];
  text?: string;
  marks?: Mark[];
};

export interface AdfDocument {
  version: 1;
  type: 'doc';
  content: AdfNode[];
}

// ------------------------------------------------------------------ inline

const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);
const isWord = (ch: string | undefined) => ch !== undefined && /\w/.test(ch);

function findEmClose(src: string, delim: '*' | '_', from: number): number {
  for (let j = from; j < src.length; j++) {
    if (src[j] !== delim || isSpace(src[j - 1])) continue;
    const next = src[j + 1];
    if (isWord(next)) continue;
    if (delim === '*' && next === '*') {
      j++;
      continue;
    }
    return j;
  }
  return -1;
}

function addMark(marks: Mark[], mark: Mark): Mark[] {
  return marks.some((m) => m.type === mark.type) ? marks : [...marks, mark];
}

function inline(src: string, marks: Mark[] = []): InlineNode[] {
  const out: InlineNode[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push(marks.length ? { type: 'text', text, marks } : { type: 'text', text });
    text = '';
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    const next = src[i + 1];

    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        // ADF does not allow `code` alongside strong/em, so it always stands alone.
        out.push({ type: 'text', text: src.slice(i + 1, end), marks: [{ type: 'code' }] });
        i = end + 1;
        continue;
      }
    }

    if ((ch === '*' || ch === '_') && next === ch && !isSpace(src[i + 2])) {
      const end = src.indexOf(ch + ch, i + 3);
      if (end !== -1) {
        flush();
        out.push(...inline(src.slice(i + 2, end), addMark(marks, { type: 'strong' })));
        i = end + 2;
        continue;
      }
    }

    if ((ch === '*' || ch === '_') && next !== ch && !isSpace(next)) {
      const prev = src[i - 1];
      const opens = ch === '*' ? !(isWord(prev) || prev === '*') : !isWord(prev);
      const end = opens ? findEmClose(src, ch, i + 2) : -1;
      if (end !== -1) {
        flush();
        out.push(...inline(src.slice(i + 1, end), addMark(marks, { type: 'em' })));
        i = end + 1;
        continue;
      }
    }

    text += ch;
    i++;
  }
  flush();
  return out;
}

// ------------------------------------------------------------------ blocks

const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TASK = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const CONTINUATION = /^\s{2,}\S/;

type ListKind = 'bulletList' | 'orderedList' | 'taskList';

export function markdownToAdf(markdown: string): AdfDocument {
  const content: AdfNode[] = [];
  let paragraph: string[] = [];
  let list: { kind: ListKind; start: number; items: { text: string; checked: boolean }[] } | null = null;
  let taskLists = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const nodes: InlineNode[] = [];
    paragraph.forEach((line, n) => {
      if (n > 0) nodes.push({ type: 'hardBreak' });
      nodes.push(...inline(line));
    });
    content.push({ type: 'paragraph', content: nodes });
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    if (list.kind === 'taskList') {
      const id = ++taskLists;
      content.push({
        type: 'taskList',
        // localIds only need to be unique within the document; deterministic keeps output testable.
        attrs: { localId: `debugbuddy-tasklist-${id}` },
        content: list.items.map((item, n) => ({
          type: 'taskItem',
          attrs: { localId: `debugbuddy-task-${id}-${n + 1}`, state: item.checked ? 'DONE' : 'TODO' },
          content: inline(item.text),
        })),
      });
    } else {
      const items = list.items.map((item) => ({ type: 'listItem', content: [{ type: 'paragraph', content: inline(item.text) }] }));
      if (list.kind === 'orderedList' && list.start !== 1) {
        content.push({ type: 'orderedList', attrs: { order: list.start }, content: items });
      } else {
        content.push({ type: list.kind, content: items });
      }
    }
    list = null;
  };

  const flush = () => {
    flushParagraph();
    flushList();
  };

  const pushItem = (kind: ListKind, text: string, checked = false, start = 1) => {
    flushParagraph();
    if (!list || list.kind !== kind) {
      flushList();
      list = { kind, start, items: [] };
    }
    list.items.push({ text, checked });
  };

  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      flush();
      continue;
    }

    let m: RegExpExecArray | null;

    if (HR.test(line)) {
      flush();
      content.push({ type: 'rule' });
    } else if ((m = HEADING.exec(line))) {
      flush();
      content.push({ type: 'heading', attrs: { level: Math.min(3, m[1]!.length) }, content: inline(m[2] ?? '') });
    } else if ((m = TASK.exec(line))) {
      pushItem('taskList', m[2] ?? '', m[1] !== ' ');
    } else if ((m = BULLET.exec(line))) {
      pushItem('bulletList', m[1] ?? '');
    } else if ((m = ORDERED.exec(line))) {
      pushItem('orderedList', m[2] ?? '', false, Number(m[1]));
    } else if (list && CONTINUATION.test(raw)) {
      const items: { text: string }[] = (list as { items: { text: string }[] }).items;
      const last = items[items.length - 1];
      if (last) last.text += ` ${line.trim()}`;
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }

  flush();
  return { version: 1, type: 'doc', content };
}

/**
 * Plain text of the first paragraph under "## Executive Summary", with markdown
 * markers removed, or null. Used for the Jira issue summary.
 */
export function executiveSummary(markdown: string): string | null {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^#{1,6}\s+executive summary\s*$/i.test(l.trim()));
  if (start === -1) return null;

  const paragraph: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const t = line.trim();
    if (/^#{1,6}\s/.test(t)) break;
    if (!t) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(t);
  }
  const text = paragraph
    .join(' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(?=\S)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)(.+?)\*(?![\w*])/g, '$1$2')
    .replace(/(^|[^\w])_(?=\S)(.+?)_(?!\w)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}
