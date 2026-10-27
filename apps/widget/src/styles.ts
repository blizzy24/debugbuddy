// All widget CSS. Lives inside the shadow root, so nothing here can reach the
// host page and nothing on the host page can reach in (`all: initial` on :host
// also stops inherited properties like font and colour leaking through).

export const styles = /* css */ `
:host {
  all: initial;
  --db-ink: #16181d;
  --db-ink-2: #3b3f47;
  --db-muted: #6b6f78;
  --db-line: #e6e3dd;
  --db-line-2: #d9d5cd;
  --db-surface: #fbfaf7;
  --db-raised: #ffffff;
  --db-sunken: #f2f0eb;
  --db-accent: #0f766e;
  --db-accent-ink: #0b5650;
  --db-accent-soft: #e5f2f0;
  --db-danger: #a8402f;
  --db-danger-soft: #fbefec;
  --db-radius: 16px;
  --db-shadow: 0 1px 2px rgba(22, 24, 29, .06), 0 12px 32px -8px rgba(22, 24, 29, .22), 0 32px 64px -24px rgba(22, 24, 29, .18);
  --db-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif;
  --db-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

*, *::before, *::after { box-sizing: border-box; }

.root {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483000;
  font-family: var(--db-font);
  font-size: 14px;
  line-height: 1.5;
  color: var(--db-ink);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible, textarea:focus-visible {
  outline: 2px solid var(--db-accent);
  outline-offset: 2px;
}

/* ---------- Launcher ---------- */

.launcher {
  position: relative;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border: 0;
  border-radius: 50%;
  background: var(--db-ink);
  color: #fff;
  box-shadow: 0 6px 20px -4px rgba(22, 24, 29, .45), inset 0 0 0 1px rgba(255, 255, 255, .06);
  transition: transform .18s ease, box-shadow .18s ease, background-color .18s ease;
}
.launcher:hover { transform: translateY(-1px); box-shadow: 0 10px 26px -6px rgba(22, 24, 29, .5), inset 0 0 0 1px rgba(255,255,255,.08); }
.launcher:active { transform: translateY(0); }
.launcher svg { width: 24px; height: 24px; transition: transform .2s ease, opacity .2s ease; }
.launcher .icon-close { position: absolute; opacity: 0; transform: rotate(-45deg) scale(.8); }
.root[data-open="true"] .launcher .icon-chat { opacity: 0; transform: rotate(45deg) scale(.8); }
.root[data-open="true"] .launcher .icon-close { opacity: 1; transform: none; }
.launcher-dot {
  position: absolute;
  top: 11px;
  right: 11px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #34d3c2;
  box-shadow: 0 0 0 2px var(--db-ink);
  transition: opacity .2s ease;
}
.root[data-open="true"] .launcher-dot { opacity: 0; }

/* ---------- Panel ---------- */

.panel {
  position: absolute;
  right: 0;
  bottom: 72px;
  width: 384px;
  height: min(640px, calc(100vh - 112px));
  display: flex;
  flex-direction: column;
  background: var(--db-surface);
  border: 1px solid var(--db-line);
  border-radius: var(--db-radius);
  box-shadow: var(--db-shadow);
  overflow: hidden;
  transform-origin: bottom right;
  opacity: 0;
  transform: translateY(8px) scale(.98);
  visibility: hidden;
  pointer-events: none;
  transition: opacity .2s ease, transform .2s cubic-bezier(.2, .8, .2, 1), visibility 0s linear .2s;
}
.root[data-open="true"] .panel {
  opacity: 1;
  transform: none;
  visibility: visible;
  pointer-events: auto;
  transition: opacity .2s ease, transform .24s cubic-bezier(.2, .8, .2, 1), visibility 0s;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px 14px 20px;
  border-bottom: 1px solid var(--db-line);
  background: var(--db-raised);
}
.mark {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--db-ink);
  color: #fff;
}
.mark svg { width: 17px; height: 17px; }
.titles { flex: 1; min-width: 0; }
.title { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -.01em; line-height: 1.25; }
.subtitle { margin: 1px 0 0; font-size: 12.5px; color: var(--db-muted); line-height: 1.35; }
.close {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--db-muted);
  transition: background-color .15s ease, color .15s ease;
}
.close:hover { background: var(--db-sunken); color: var(--db-ink); }
.close svg { width: 18px; height: 18px; }

/* ---------- Thread ---------- */

.thread {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 20px 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scroll-behavior: smooth;
}
.thread::-webkit-scrollbar { width: 10px; }
.thread::-webkit-scrollbar-thumb { background: var(--db-line-2); border-radius: 10px; border: 3px solid var(--db-surface); }

.msg { display: flex; max-width: 100%; animation: db-in .22s ease both; }
.msg-user { justify-content: flex-end; }
.bubble {
  max-width: 86%;
  padding: 10px 14px;
  border-radius: 14px;
  overflow-wrap: anywhere;
}
.msg-user .bubble {
  background: var(--db-ink);
  color: #f6f5f2;
  border-bottom-right-radius: 5px;
  white-space: pre-wrap;
}
.msg-assistant .bubble {
  background: var(--db-raised);
  border: 1px solid var(--db-line);
  border-bottom-left-radius: 5px;
  color: var(--db-ink-2);
}

/* ---------- Report card ---------- */

.msg-report { display: block; }
.report {
  background: var(--db-raised);
  border: 1px solid var(--db-line);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(22, 24, 29, .04), 0 8px 24px -12px rgba(15, 118, 110, .35);
}
.report-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--db-accent);
  color: #fff;
}
.report-head svg { flex: none; width: 18px; height: 18px; }
.report-label { flex: 1; font-size: 12px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; }
.report-score {
  font-family: var(--db-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .16);
}
.meter { height: 3px; background: var(--db-accent-soft); }
.meter > span { display: block; height: 100%; background: #34d3c2; }
.report-body { padding: 4px 16px 14px; color: var(--db-ink-2); }
.report-body .md-h1:first-child { display: none; } /* the card header already says it */
.report-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--db-line);
  background: var(--db-sunken);
  font-size: 12.5px;
  color: var(--db-muted);
}
.report-foot svg { flex: none; width: 14px; height: 14px; color: var(--db-accent); }

/* Quiet footer actions: copy / download / print */
.report-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px 10px;
  border-top: 1px solid var(--db-line);
}
.report-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--db-muted);
  font-size: 12.5px;
  font-weight: 500;
  transition: background-color .15s ease, color .15s ease;
}
.report-action:hover { background: var(--db-sunken); color: var(--db-ink); }
.report-action svg { width: 14px; height: 14px; }

/* ---------- Rendered markdown ---------- */

.md > :first-child { margin-top: 0; }
.md > :last-child { margin-bottom: 0; }
.md-p { margin: 0 0 8px; }
.md-h1 { margin: 12px 0 8px; font-size: 16px; font-weight: 680; letter-spacing: -.01em; color: var(--db-ink); }
.md-h2 {
  margin: 16px 0 6px;
  font-size: 11.5px;
  font-weight: 680;
  letter-spacing: .07em;
  text-transform: uppercase;
  color: var(--db-ink);
}
.md-ul, .md-ol { margin: 0 0 8px; padding-left: 20px; }
.md-ul li, .md-ol li { margin: 3px 0; padding-left: 2px; }
.md-ul li::marker { color: var(--db-muted); }
.md-ol li::marker { color: var(--db-muted); font-variant-numeric: tabular-nums; font-size: .92em; }
.md-checklist { list-style: none; margin: 0 0 8px; padding: 0; }
.md-check { display: flex; gap: 10px; align-items: flex-start; margin: 5px 0; }
.md-box {
  flex: none;
  width: 15px;
  height: 15px;
  margin-top: 3px;
  border: 1.5px solid var(--db-line-2);
  border-radius: 4px;
  background: var(--db-raised);
}
.md-box-checked { background: var(--db-accent); border-color: var(--db-accent); }
.md-hr { border: 0; border-top: 1px solid var(--db-line); margin: 14px 0; }
.md strong { font-weight: 650; color: var(--db-ink); }
.md em { font-style: italic; }
.md-sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

/* ---------- Typing / status ---------- */

.typing {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--db-raised);
  border: 1px solid var(--db-line);
  border-radius: 14px;
  border-bottom-left-radius: 5px;
}
.dots { display: inline-flex; gap: 4px; }
.dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--db-muted);
  animation: db-bounce 1.2s infinite ease-in-out;
}
.dots span:nth-child(2) { animation-delay: .15s; }
.dots span:nth-child(3) { animation-delay: .3s; }
.typing-text { font-size: 12.5px; color: var(--db-muted); }

/* ---------- Error ---------- */

.error {
  max-width: 92%;
  padding: 10px 14px;
  border: 1px solid #efd2ca;
  background: var(--db-danger-soft);
  color: var(--db-danger);
  border-radius: 12px;
  font-size: 13.5px;
}
.error-actions { margin-top: 8px; }
.retry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid #e5beb3;
  border-radius: 8px;
  background: #fff;
  color: var(--db-danger);
  font-size: 12.5px;
  font-weight: 600;
}
.retry:hover { background: #fff7f5; }
.retry svg { width: 13px; height: 13px; }

/* ---------- Composer ---------- */

.composer {
  padding: 12px 12px 10px;
  border-top: 1px solid var(--db-line);
  background: var(--db-raised);
}
.context { margin: 0 0 8px; font-size: 12px; color: var(--db-muted); }
.context[hidden], .context-preview[hidden] { display: none; }
.context-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.context-toggle, .context-decline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  margin: 0 -4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.context-toggle:hover { color: var(--db-ink); }
.context-toggle svg { width: 12px; height: 12px; flex: none; transition: transform .15s ease; }
.context-toggle[aria-expanded="true"] svg { transform: rotate(90deg); }
.context-decline { text-decoration: underline; text-underline-offset: 2px; }
.context-decline:hover { color: var(--db-ink); }
.context-preview {
  margin: 6px 0 0;
  max-height: 160px;
  overflow: auto;
  padding: 8px 10px;
  border: 1px solid var(--db-line);
  border-radius: 8px;
  background: var(--db-sunken);
  font-family: var(--db-mono);
  font-size: 11px;
  line-height: 1.45;
  color: var(--db-ink-2);
  white-space: pre-wrap;
  word-break: break-word;
}
@media (prefers-reduced-motion: reduce) { .context-toggle svg { transition: none; } }
.field {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 6px 6px 6px 14px;
  border: 1px solid var(--db-line-2);
  border-radius: 12px;
  background: var(--db-surface);
  transition: border-color .15s ease, box-shadow .15s ease;
}
.field:focus-within { border-color: var(--db-accent); box-shadow: 0 0 0 3px var(--db-accent-soft); }
textarea {
  flex: 1;
  min-height: 24px;
  max-height: 132px;
  margin: 5px 0;
  padding: 0;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  color: var(--db-ink);
}
textarea:focus-visible { outline: none; }
textarea::placeholder { color: #9a9da4; }
.send {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 9px;
  background: var(--db-accent);
  color: #fff;
  transition: background-color .15s ease, opacity .15s ease;
}
.send:hover:not(:disabled) { background: var(--db-accent-ink); }
.send:disabled { opacity: .35; cursor: default; }
.send svg { width: 16px; height: 16px; }
.hint {
  display: flex;
  justify-content: space-between;
  margin: 7px 4px 0;
  font-size: 11.5px;
  color: #9a9da4;
}
.hint kbd {
  font-family: var(--db-mono);
  font-size: 10.5px;
  padding: 0 4px;
  border: 1px solid var(--db-line-2);
  border-bottom-width: 2px;
  border-radius: 4px;
  color: var(--db-muted);
}

/* ---------- Mobile ---------- */

@media (max-width: 480px) {
  .root { right: 16px; bottom: 16px; }
  .panel {
    position: fixed;
    inset: 0;
    width: auto;
    height: auto;
    border-radius: 0;
    border: 0;
    transform: translateY(16px);
  }
  .root[data-open="true"] .launcher { opacity: 0; pointer-events: none; }
  .header { padding-top: max(14px, env(safe-area-inset-top)); }
  .composer { padding-bottom: max(10px, env(safe-area-inset-bottom)); }
  textarea { font-size: 16px; } /* stops iOS zooming on focus */
  .bubble { max-width: 90%; }
  .hint-keys { display: none; }
}

/* ---------- Print ---------- */
/* Printing the host page normally leaves the widget out entirely. Printing a
   report (root.print-mode) shows only that report, black on white. The host
   page itself is hidden by a temporary print-only style in reportActions.ts. */

@media print {
  .root:not(.print-mode) { display: none !important; }

  .print-mode.root { position: static !important; font-size: 11pt; color: #000; }
  .print-mode .launcher,
  .print-mode .header,
  .print-mode .composer,
  .print-mode .msg:not(.printing),
  .print-mode .meter,
  .print-mode .report-actions,
  .print-mode .report-foot { display: none !important; }

  .print-mode .panel {
    position: static !important;
    inset: auto !important;
    width: auto !important;
    height: auto !important;
    opacity: 1 !important;
    visibility: visible !important;
    transform: none !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: #fff !important;
    overflow: visible !important;
  }
  .print-mode .thread { overflow: visible !important; padding: 0 !important; }
  .print-mode .msg { animation: none !important; }

  .print-mode .printing *,
  .print-mode .printing *::before,
  .print-mode .printing *::after {
    color: #000 !important;
    background: transparent !important;
    box-shadow: none !important;
  }
  .print-mode .report { border: 0; border-radius: 0; overflow: visible; }
  /* The report's own "# Engineering Report" heading is the printed title; the card header would repeat it. */
  .print-mode .report-head { display: none !important; }
  .print-mode .report-body { padding: 0; }
  .print-mode .report-body .md-h1:first-child { display: block; font-size: 16pt; margin: 0 0 10pt; padding-bottom: 6pt; border-bottom: 1.5pt solid #000; }
  .print-mode .md-h2 { break-after: avoid; }
  .print-mode .md-ul li, .print-mode .md-ol li, .print-mode .md-check { break-inside: avoid; }
  .print-mode .md-box { border-color: #000 !important; }
  /* Outranks the transparent-background rule above, so done items still print filled. */
  .print-mode .printing .md-box.md-box-checked { background: #000 !important; }
  .print-mode .md-hr { border-top-color: #000; }
}

/* ---------- Motion ---------- */

@keyframes db-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes db-bounce { 0%, 80%, 100% { transform: translateY(0); opacity: .45; } 40% { transform: translateY(-3px); opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
    scroll-behavior: auto !important;
  }
  .dots span { opacity: .7; transform: none; }
}
`;
