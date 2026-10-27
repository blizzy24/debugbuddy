// Run: npm run test:adf
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { executiveSummary, markdownToAdf, renderMarkdown, type AdfDocument } from '../src/index';

const report = readFileSync(join(__dirname, 'fixtures', 'report.md'), 'utf8');
const adf = markdownToAdf(report);

const t = (text: string) => ({ type: 'text', text });
const strong = (text: string) => ({ type: 'text', text, marks: [{ type: 'strong' }] });
const em = (text: string) => ({ type: 'text', text, marks: [{ type: 'em' }] });
const code = (text: string) => ({ type: 'text', text, marks: [{ type: 'code' }] });
const h = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const p = (...content: object[]) => ({ type: 'paragraph', content });
const li = (...content: object[]) => ({ type: 'listItem', content: [p(...content)] });

const expected = {
  version: 1,
  type: 'doc',
  content: [
    h(1, 'Engineering Report'),
    h(2, 'Executive Summary'),
    p(t('Checkout fails silently on Safari 17 when a saved card is selected. The submit request is never sent, so no order is created.')),
    p(
      strong('Severity:'), t(' High  ·  '),
      strong('Likely subsystem:'), t(' payments  ·  '),
      strong('Category:'), t(' functional  ·  '),
      strong('Readiness:'), t(' 78/100'),
    ),
    h(2, 'Observed Facts'),
    {
      type: 'bulletList',
      content: [
        li(t('Clicking '), strong('Pay now'), t(' does nothing on Safari 17.2 (macOS)')),
        li(t('Works in Chrome with the same account')),
        li(t('No error message is shown to the user')),
      ],
    },
    h(2, 'Working Hypothesis'),
    p(em('This is a hypothesis, not a confirmed cause.')),
    p(t('A promise rejection in the '), code('onSubmit'), t(' handler is swallowed when the saved-card token is '), em('stale'), t('.')),
    h(2, 'Recommended First Checks'),
    {
      type: 'orderedList',
      content: [li(t('Reproduce on Safari 17 with a saved card')), li(t('Check the network tab for a '), code('POST /api/checkout'), t(' request'))],
    },
    h(2, 'Investigation Checklist'),
    {
      type: 'taskList',
      attrs: { localId: 'debugbuddy-tasklist-1' },
      content: [
        { type: 'taskItem', attrs: { localId: 'debugbuddy-task-1-1', state: 'TODO' }, content: [t('Add logging around the saved-card branch')] },
        { type: 'taskItem', attrs: { localId: 'debugbuddy-task-1-2', state: 'DONE' }, content: [t('Confirm the issue is Safari-only')] },
      ],
    },
    h(2, 'Still Missing'),
    { type: 'bulletList', content: [li(t('Exact Safari build number'))] },
    h(2, 'Next Best Question'),
    p(t('Does the problem also happen with a newly added card?')),
    { type: 'rule' },
    p(em('Produced after 3 rounds of questions without reaching the readiness threshold (score 78/100). The gaps above are still open.')),
  ],
};

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('ADF');

check('full report matches the expected document', () => {
  assert.deepEqual(adf, expected);
});

check('is wrapped as { version: 1, type: "doc" }', () => {
  assert.equal(adf.version, 1);
  assert.equal(adf.type, 'doc');
  assert.ok(Array.isArray(adf.content));
});

check('heading levels 1–3, deeper levels clamped to 3', () => {
  const doc = markdownToAdf('# One\n## Two\n### Three\n#### Four');
  assert.deepEqual(
    doc.content.map((b) => (b.type === 'heading' ? b.attrs?.level : null)),
    [1, 2, 3, 3],
  );
});

check('ordered list keeps a non-1 start as attrs.order', () => {
  const doc = markdownToAdf('3. three\n4. four');
  assert.deepEqual(doc.content[0], { type: 'orderedList', attrs: { order: 3 }, content: [li(t('three')), li(t('four'))] });
});

check('nested strong + em become one text node with both marks', () => {
  const doc = markdownToAdf('**bold _and italic_**');
  assert.deepEqual(doc.content[0], p(strong('bold '), { type: 'text', text: 'and italic', marks: [{ type: 'strong' }, { type: 'em' }] }));
});

check('code mark never combines with other marks', () => {
  const doc = markdownToAdf('**see `x` here**');
  assert.deepEqual(doc.content[0], p(strong('see '), code('x'), strong(' here')));
});

check('multi-line paragraph uses hardBreak', () => {
  const doc = markdownToAdf('line one\nline two');
  assert.deepEqual(doc.content[0], p(t('line one'), { type: 'hardBreak' }, t('line two')));
});

check('snake_case words are not italicised', () => {
  const doc = markdownToAdf('call user_profile_id now');
  assert.deepEqual(doc.content[0], p(t('call user_profile_id now')));
});

check('no empty text nodes anywhere (Jira rejects them)', () => {
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      const n = node as { type?: string; text?: string };
      if (n.type === 'text') assert.ok(n.text && n.text.length > 0, 'empty text node');
      Object.values(node).forEach(walk);
    }
  };
  walk(adf satisfies AdfDocument);
});

check('output is plain JSON (survives a round trip unchanged)', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(adf)), adf);
});

check('executive summary extraction (used for the Jira summary)', () => {
  assert.equal(
    executiveSummary(report),
    'Checkout fails silently on Safari 17 when a saved card is selected. The submit request is never sent, so no order is created.',
  );
  assert.equal(executiveSummary('# Engineering Report\n\nNo summary here'), null);
});

check('HTML path untouched: still renders the report as before', () => {
  const html = renderMarkdown(report);
  assert.ok(html.startsWith('<h1 class="md-h1">Engineering Report</h1>'));
  assert.ok(html.includes('<li class="md-check md-checked">'));
  assert.ok(html.includes('&lt;') === false);
});

console.log(`\n${passed} passed`);
