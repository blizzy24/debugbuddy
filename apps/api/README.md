# @debugbuddy/api

Express 4 + TypeScript. The relay between the widget and the n8n pipeline, the
only writer of widget traffic to Supabase, and the only reader of Jira credentials.

```bash
cp .env.example .env     # Supabase URL, service role key, n8n webhook URL, ENCRYPTION_KEY
npm run dev              # tsx watch, http://localhost:8787
npm run build && npm start
```

| File | Purpose |
|---|---|
| `src/index.ts` | app, CORS, JSON body parsing, error handler, startup |
| `src/routes/chat.ts` | `POST /api/chat` (widget, `x-api-key`), plus Jira auto-create after responding |
| `src/routes/jira.ts` | Jira config CRUD, connection test, create issue (dashboard, bearer token) |
| `src/lib/auth.ts` | widget path: API key generation, prefix lookup, `timingSafeEqual` verification |
| `src/lib/userAuth.ts` | dashboard path: `supabase.auth.getUser(token)`, project ownership checks |
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt for Jira tokens (project id bound as AAD) |
| `src/lib/jira.ts` | Jira Cloud client: test, create issue, readable error mapping, priority retry |
| `src/lib/jiraSync.ts` | report → issue, de-duplicated; never-throwing auto-create |
| `src/lib/n8n.ts` | webhook call (60s timeout) and reply normalisation |
| `src/lib/supabase.ts` | service-role client (**bypasses RLS by design**) |
| `src/lib/env.ts` | validated environment; exits with a clear message if something's missing (including `ENCRYPTION_KEY`) |

Reply classification in `src/lib/n8n.ts`: an explicit `type`/`status` field
from n8n wins. Otherwise a reply whose text starts with `# Engineering Report`
is a report. n8n can start sending `"type": "report"` later with no change here.

Jira tokens are never logged or returned. Jira failures are logged as status codes
and field names only.

`npm run dev` and `npm run build` build `packages/markdown` first, because the API
requires its compiled CommonJS output.

See the root README for the full API contract and error codes.
