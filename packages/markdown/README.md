# @debugbuddy/markdown

Shared by the widget, the dashboard and the API.

| File | Does | Used by |
|---|---|---|
| `src/index.ts` | `renderMarkdown(md)`: escape-first markdown → HTML string | widget, dashboard |
| `src/toAdf.ts` | `markdownToAdf(md)`: markdown → Atlassian Document Format; `executiveSummary(md)` | API (Jira issues) |

The two paths are independent on purpose. The HTML renderer was frozen while the Jira
work was added, so `toAdf.ts` has its own small parser, and some duplication between the
files is expected. A later cleanup could share one parser (markdown → node tree) and
render the tree to both HTML and ADF.

Both handle the subset the DebugBuddy pipeline emits: `#`/`##` headings (the ADF side keeps
level 3; deeper levels are clamped to 3), unordered and ordered lists, `- [ ]` / `- [x]`
checklist items, `**bold**`, `*italic*` / `_italic_`, horizontal rules, and paragraphs. The
ADF side also handles `` `inline code` ``.

```ts
import { renderMarkdown, markdownToAdf } from '@debugbuddy/markdown';

el.innerHTML = renderMarkdown(text);      // escaped: safe for innerHTML
const description = markdownToAdf(text);  // { version: 1, type: 'doc', content: [...] }
```

**Safety:** the HTML renderer escapes every line before adding a fixed set of tags with
`md-*` classes. Model output never reaches the DOM unescaped.

**Consumption:** Vite apps import the TypeScript source (the `import` condition). The API
requires the compiled CommonJS in `dist/` (the `require` condition). The API's `dev` and
`build` scripts build this package first.

```bash
npm run test:adf    # assertions against a real DebugBuddy report (test/fixtures/report.md)
```
