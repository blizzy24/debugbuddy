# @debugbuddy/widget

The embeddable chat widget. Vanilla TypeScript, no runtime dependencies, built
with Vite library mode into one self-contained file, `dist/widget.js` (~8 kB gzipped).

```html
<script src=".../widget.js" data-debugbuddy-key="db_live_…" data-api-url="https://api.example.com" defer></script>
```

```bash
npm run build    # → dist/widget.js
npm run demo     # build, then serve demo.html at http://localhost:5174/demo.html
npm run watch    # rebuild on change (reload demo.html to pick it up)
```

`demo.html` reads `?key=…&api=…` from the URL, so you can paste a key into the
form on the page instead of editing the file. Its host CSS is deliberately loud,
which demonstrates that the shadow root isolates the widget.

| File | Purpose |
|---|---|
| `src/index.ts` | finds its own script tag, reads the `data-*` attributes, mounts once |
| `src/widget.ts` | UI: launcher, panel, thread, composer, typing, errors with retry |
| `src/reportActions.ts` | report Copy / Download (.md via Blob) / Print (only the report, black on white) |
| `src/api.ts` | `POST /api/chat` client and human-readable error copy |
| `src/storage.ts` | `sessionStorage` (session id + thread, keyed per API key), failure-tolerant |
| `src/styles.ts` | all CSS, scoped to the shadow root; mobile and reduced-motion rules |

Markdown comes from `@debugbuddy/markdown`, which escapes all HTML before adding markup.
