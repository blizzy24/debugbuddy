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
| `src/capture.ts` | automatic browser context (errors, failed requests, page and browser details); imported first |
| `src/widget.ts` | UI: launcher, panel, thread, composer, typing, errors with retry |
| `src/reportActions.ts` | report Copy / Download (.md via Blob) / Print (only the report, black on white) |
| `src/api.ts` | `POST /api/chat` client and human-readable error copy |
| `src/storage.ts` | `sessionStorage` (session id + thread, keyed per API key), failure-tolerant |
| `src/styles.ts` | all CSS, scoped to the shadow root; mobile and reduced-motion rules |

Markdown comes from `@debugbuddy/markdown`, which escapes all HTML before adding markup.

## Automatic technical context

The first message of each session carries a block of browser context, appended
to the text the person typed. The backend sees one longer message, so the API
and the `/api/chat` contract are unchanged. The thread and `sessionStorage` keep
only what the person typed.

```
<what the person typed>

---
Technical context captured automatically by DebugBuddy:
- Page: https://shop.example.com/checkout?step=2&token=[redacted]
- Title, Referrer, Browser (e.g. "Chrome 141 on macOS"), User agent,
  Viewport, Screen, Language, Timezone, Online
- Console errors:
  - Uncaught TypeError: … (/assets/app.js:120)
- Failed network requests:
  - GET /api/cart 500
- Time: 2026-10-27T10:15:00.000Z
```

- **What's recorded:** `src/capture.ts` installs handlers when the script loads:
  - `window` `error` and `unhandledrejection` events
  - a `console.error` wrapper
  - `fetch` and `XMLHttpRequest` wrappers, which record any non-2xx response
    (except 304 and opaque `no-cors` responses), network failures and XHR timeouts

  It keeps the last 10 errors and the last 10 failed requests. Every wrapper
  calls the original and returns what it returned. Nothing is blocked,
  swallowed or `preventDefault`ed. The widget's own `/api/chat` calls aren't recorded.
- **Privacy:**
  - Never read: form fields, input contents, storage, cookies, and request or response bodies.
  - In every URL, including URLs inside error messages and `#fragment`
    parameters, the values of parameters whose names contain `token`, `key`,
    `secret`, `password`, `auth` or `session` become `[redacted]`.
- **Size:** the block is capped at 2000 characters; the oldest entries are
  dropped first. The API's limit is 5000 characters per message, so a long
  message leaves less room. If even the basic lines don't fit, nothing is
  attached rather than a cut-off block. Sections with nothing in them are
  left out, and an empty block is never sent.
- **Shown to the person:**
  - Before the first message of a session, a chip above the input says
    "Technical details will be attached".
  - Expanding the chip shows exactly what will be sent.
  - "Don't attach" turns it off for that session; "Attach" turns it back on.
    The next session starts with it on again.

**Known limitation:** the widget is loaded with `defer`, so it runs after the
page has been parsed. Errors, console errors and failed requests that happen
before that are missed. This is accepted, not worked around.

To try it, open `demo.html` and use the "Simulate problems" buttons before sending
the first message. The demo page's own `?key=…` is redacted in the Page line.
