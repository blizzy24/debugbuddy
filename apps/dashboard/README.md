# @debugbuddy/dashboard

React 18 + Vite + Tailwind 3. The customer-facing dashboard. It talks **directly to
Supabase** with the anon key and the signed-in user's session; every query runs
under RLS, so there is no backend for CRUD.

The one exception is Jira (`src/lib/api.ts`): its config holds an encrypted API token
the browser is never allowed to read, so those calls go to the API with the user's
Supabase access token as a Bearer header.

```bash
cp .env.example .env    # Supabase URL + anon key, API URL and widget URL for the snippet
npm run dev             # http://localhost:5173
npm run build
```

| Route | Page |
|---|---|
| `/login` | sign in / sign up (email + password) |
| `/projects` | your projects, create a project |
| `/projects/:id` | embed snippet, API keys (create / revoke), Jira connection, allowed origins, reports |
| `/sessions/:id` | original report, rendered report with Copy / Download / Print / Copy link, Jira issue, severity, readiness, iterations |

API keys are generated in the browser (`src/lib/keys.ts`): `crypto.getRandomValues`
produces the key and `crypto.subtle` computes the SHA-256 hash. Only the hash and
prefix are inserted. The raw key is shown once in a dialog and is never stored.

Report markdown is rendered by the shared `@debugbuddy/markdown` package, the same
renderer the widget uses.
