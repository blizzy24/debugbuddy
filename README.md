# DebugBuddy

DebugBuddy turns vague bug reports into engineering reports.

A visitor on your website opens a small chat widget and describes a bug in plain
language ("checkout doesn't work sometimes??"). DebugBuddy asks targeted
follow-up questions until it has enough to go on, then produces a structured
engineering report: severity, observed facts, a working hypothesis, recommended
first checks, and an investigation checklist.

You read the reports in a dashboard. You can copy, download or print them, and
send them to **Jira** as issues, by hand or automatically.

The AI pipeline is an existing **n8n workflow** reached over a webhook. This
repository does not build, run or modify it; it treats it as an external service.

---

## Architecture: two trust levels

```
                       UNTRUSTED                                  TRUSTED (server)
  ┌────────────────────────────┐   x-api-key    ┌──────────────────────────┐   webhook   ┌──────────────┐
  │ Widget  (customer website) │ ─────────────▶ │ API  apps/api            │ ──────────▶ │ n8n pipeline │
  │ shadow DOM, public key     │ ◀───────────── │                          │ ◀────────── │ (external)   │
  └────────────────────────────┘   reply        │  service role key        │             └──────────────┘
                                                │  (bypasses RLS)          │  REST v3    ┌──────────────┐
  ┌────────────────────────────┐  Bearer token  │                          │ ──────────▶ │ Jira Cloud   │
  │ Dashboard  apps/dashboard  │ ─────────────▶ │  Jira endpoints only     │             │ (customer's) │
  │ signed-in customer         │                └────────────┬─────────────┘             └──────────────┘
  │                            │                             │
  │                            │  anon key + JWT, under RLS  ▼
  │                            │ ─────────────▶ ┌──────────────────────────┐
  └────────────────────────────┘  direct CRUD   │ Supabase Postgres        │
                                                │ projects · api_keys      │
                                                │ sessions · reports       │
                                                │ usage_events             │
                                                │ jira_configs  🔒 API only │
                                                └──────────────────────────┘
```

| | Widget → API → n8n | Dashboard → Supabase | Dashboard → API (Jira) |
|---|---|---|---|
| Runs on | Any third-party site (untrusted origin) | Your own app (first party) | Your own app |
| Credential | Public, project-scoped API key | Supabase session of a signed-in user | Same session, sent as a Bearer token |
| Database access | None. Only the API touches the DB | Direct, every query under Row Level Security | None directly; the API reads `jira_configs` |
| Can do | Send chat messages for one project | Manage the user's projects, keys and reports | Configure Jira, create issues |

The widget never sees Supabase. The dashboard does almost all of its work directly
against Supabase, protected by RLS policies in `supabase/schema.sql` that scope every
row to a project whose `owner_id = auth.uid()`.

**Jira config is the one thing the dashboard cannot read from Supabase.** The
`jira_configs` table holds each project's Jira API token, encrypted with
AES-256-GCM. RLS is enabled on it with **no policies at all**, and table privileges
are revoked from `anon` and `authenticated`, so the browser cannot read it, not even
the owner's own row. A token you can't read can't leak through a careless `select *`,
a future policy, or a compromised browser session. Only the API, using the service
role, reads the row. It decrypts the token in memory just long enough to call Jira,
and it returns the config to the dashboard **without** the token. That's why
these few endpoints exist when everything else is direct CRUD.

**API keys** have the form `db_live_` followed by 32 hex characters. They are generated in the
browser. Only `sha256(key)` and the first 12 characters are stored, and keys are
compared with `timingSafeEqual`. The raw key is shown once and can never be retrieved.

### Two auth paths into the API, kept apart

| Path | Routes | Credential | Proves |
|---|---|---|---|
| Widget | `POST /api/chat` | `x-api-key: db_live_…` | "this request is for project X" |
| Dashboard | `/api/projects/:id/jira…`, `/api/reports/:id/jira` | `Authorization: Bearer <Supabase access token>` | "this is user U", then each route checks that U owns the project |

The two paths are separate on purpose. An API key is **public**: it ships in the HTML
of a customer's site, so anyone can copy it. It must never unlock anything beyond
sending chat messages. A bearer token is **secret** and identifies a person. No route
accepts both, so a scraped widget key can't reach Jira settings, and a user's session
token is never needed on a third-party site. The dashboard routes verify the token
with `supabase.auth.getUser(token)`. They return `401` for a missing or invalid
token, and `403` when the project belongs to someone else.

---

## Repository layout

```
.
├── supabase/
│   ├── schema.sql                     full schema for a fresh install (idempotent)
│   └── migrations/002_jira_and_export.sql   upgrade for databases created before Jira
├── packages/markdown     escape-first markdown → HTML (widget, dashboard) + separate markdown → Jira ADF (toAdf.ts)
├── apps/api              Express API: /api/chat (widget), Jira endpoints (dashboard), /health
├── apps/widget           embeddable chat widget → dist/widget.js (+ demo.html)
├── apps/dashboard        React dashboard: auth, projects, keys, reports, Jira
└── n8n/                  exported n8n workflows (reference only; not used by the build)
```

npm workspaces; Node 20+.

---

## Setup from scratch

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and run it.
   It is idempotent, and it already includes everything in `supabase/migrations/`.
3. Open **Project Settings → API** and note three values:
   - Project URL
   - `anon` key (for the dashboard)
   - `service_role` key (for the API only, never in a browser)
4. Optional, for local testing: **Authentication → Sign In / Providers → Email**,
   turn off **Confirm email**.

**Upgrading an existing database:** don't re-run `schema.sql`. Run each file in
`supabase/migrations/` you haven't run yet, in order. Each file is safe to run more than once.

| Migration | Adds |
|---|---|
| `002_jira_and_export.sql` | `jira_configs` table (locked to the service role); `jira_issue_key`, `jira_issue_url`, `jira_synced_at`, `jira_sync_error` on `reports` |

### 2. n8n

You need the production webhook URL of the DebugBuddy workflow. The API sends:

```json
{ "action": "sendMessage", "chatInput": "<visitor message>", "sessionId": "<uuid>" }
```

and accepts `{ "output": "..." }` or `[{ "output": "..." }]` back. For the Chat Trigger
workflow in `n8n/DebugBuddy-n8n-workflow.json`, the URL is
`https://<your-n8n-host>/webhook/debugbuddy-chat/chat`, and the workflow must be **active**.

### 3. Environment variables

```bash
cp apps/api/.env.example       apps/api/.env
cp apps/dashboard/.env.example apps/dashboard/.env
```

`apps/api/.env`

| Variable | Value |
|---|---|
| `PORT` | `8787` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key |
| `N8N_WEBHOOK_URL` | n8n production webhook URL |
| `ENCRYPTION_KEY` | **required**: 64 hex chars (32 bytes) used to encrypt Jira tokens, see below |
| `N8N_WEBHOOK_AUTH_HEADER` / `N8N_WEBHOOK_AUTH_VALUE` | optional, if the webhook uses Header Auth |
| `DASHBOARD_ORIGINS` | optional, comma-separated dashboard origins allowed to call the Jira endpoints |

`apps/dashboard/.env`

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `anon` key |
| `VITE_API_URL` | the API, `http://localhost:8787` (used for the embed snippet and the Jira endpoints) |
| `VITE_WIDGET_URL` | where `widget.js` is served, `http://localhost:5174/dist/widget.js` |

#### `ENCRYPTION_KEY`

Jira API tokens are encrypted at rest with AES-256-GCM. Each ciphertext is bound to its
project id, so copying one project's encrypted token into another project's row makes it
fail to decrypt. Generate a key once:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the 64-character output into `apps/api/.env` as `ENCRYPTION_KEY=…`. The API
**refuses to start** if the key is missing or isn't exactly 64 hex characters. There is no
default.

Treat it like a password: keep it out of git, and store it in your host's secret manager in
production. Keep it **stable**. If it changes, stored tokens can no longer be decrypted, and
each project has to re-enter its Jira token. Nothing else breaks.

### 4. Install, build, test

```bash
npm install
npm run build     # markdown, api, widget, dashboard
npm run test:adf  # markdown → Jira ADF assertions against a real report
```

### 5. Run (three terminals)

```bash
npm run dev:api         # API         → http://localhost:8787
npm run dev:dashboard   # dashboard   → http://localhost:5173
npm run dev:widget      # widget demo → http://localhost:5174/demo.html
```

---

## Embedding the widget

In the dashboard, open a project and create an API key. The key dialog shows a snippet
with the key filled in. Paste it before `</body>`:

```html
<script
  src="https://your-cdn.example.com/widget.js"
  data-debugbuddy-key="db_live_0123456789abcdef0123456789abcdef"
  data-api-url="https://api.your-domain.example.com"
  defer
></script>
```

- `data-debugbuddy-key` (required): the project's public API key.
- `data-api-url` (optional): defaults to the origin `widget.js` was served from.

The widget renders inside a shadow root, so your CSS can't affect it and its CSS can't leak
out. When a report arrives, the visitor can **Copy** it as markdown, **Download** it as
`debugbuddy-report-<date>.md`, or **Print** it: only the report prints, black on white,
without the launcher or your page. If someone prints your page normally, the widget is left
out.

To restrict which sites can use a key, add origins under **Allowed origins** on the project
page. When the list is empty, any origin is allowed.

---

## Connecting Jira

From the project page in the dashboard:

1. **Create an API token** at
   [id.atlassian.com → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
   (**Create API token**, give it a label, copy it). The token acts as the Atlassian account
   that created it. Use an account that can create issues in the target project; a dedicated
   service account works well.
2. In the **Jira** card, click **Connect Jira** and fill in:
   - **Site URL**: `https://your-company.atlassian.net` (Atlassian Cloud only)
   - **Account email**: the email of the account that made the token
   - **API token**: encrypted on the server; it never comes back to the browser
   - **Project key**: the prefix on issue keys, for example `BUG` in `BUG-123`
   - **Issue type**: `Bug` by default; must exist in that project
3. Click **Test connection**. You should see *Connected as &lt;your name&gt;*, or the
   specific reason it failed. Then **Connect**.
4. Open any report and click **Create Jira issue**. The issue key appears as a link.
   Creating it again returns the same issue rather than a duplicate.
5. Optional: turn on **Create issues automatically**. Every *future* report on this
   project becomes an issue as soon as it's produced. If Jira is down or rejects the issue,
   the visitor still gets their report. The report page shows that auto-create failed and
   offers the manual button.

To change settings later, click **Edit**. Leave the token field empty to keep the stored
token. **Disconnect** deletes the stored credentials. Issues already created stay in Jira,
and reports keep their links.

What the issue contains:

| Jira field | From the report |
|---|---|
| Summary | first sentence of the Executive Summary, trimmed to 250 characters |
| Description | the full report, converted to Atlassian Document Format (headings, lists, checklists, bold, italic, code) |
| Labels | `debugbuddy`, plus the report's category |
| Priority | severity mapped critical → Highest, high → High, medium → Medium, low → Low. Many projects hide or restrict Priority; if Jira rejects it, the issue is created without it |

---

## API contract

All errors are `{ "error": { "code": "…", "message": "…" } }`. No stack traces, and no raw
Atlassian responses.

### `GET /health`

`200 { "status": "ok" }`. Accepts requests from any origin.

### `POST /api/chat` (widget, `x-api-key`)

Unchanged by the Jira work.

```
content-type: application/json
x-api-key: db_live_…
```

```json
{ "message": "string, 1–5000 chars", "sessionId": "optional uuid from a previous reply" }
```

`200 { "sessionId": "uuid", "type": "questions" | "report", "content": "markdown" }`

1. Verifies the key. Unknown or revoked keys get `401`.
2. With no `sessionId`, creates an `open` session with `original_report = message`. With a
   `sessionId`, the session must belong to the key's project (`403` if not). A session
   that has already completed starts a fresh one.
3. Calls n8n, with a 60-second timeout.
4. Classifies the reply. An explicit `type` (or `status`) field in n8n's response wins.
   Otherwise, text starting with `# Engineering Report` is a report.
5. For a report: inserts into `reports`, parsing `Readiness: NN/100`, severity and category,
   and marks the session `completed`. For questions: increments `iteration`.
6. Records a `usage_events` row (`chat_message`) and responds.
7. **After responding**, if the project has Jira auto-create on, creates the issue. Failures
   are logged and saved to `reports.jira_sync_error`; they never affect the response.

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_request`, `invalid_json` | body fails validation |
| 401 | `invalid_api_key` | missing, malformed, unknown or revoked key |
| 403 | `session_forbidden` | session belongs to another project or doesn't exist |
| 403 | `origin_not_allowed` | origin not in the project's `allowed_origins` |
| 502 | `pipeline_unreachable`, `pipeline_timeout`, `pipeline_error`, `pipeline_bad_response` | n8n is down, slow, returned non-2xx, or sent a malformed reply |
| 500 | `internal_error` | anything else |

### Jira endpoints (dashboard, `Authorization: Bearer <Supabase access token>`)

Every route verifies the token, then checks that the caller owns the project.

| Method & path | Body | Success |
|---|---|---|
| `GET /api/projects/:id/jira` | | `{ "configured": false }` or `{ "configured": true, "siteUrl", "email", "jiraProjectKey", "issueType", "autoCreate", "hasToken", "createdAt", "updatedAt" }`. Never includes the token |
| `PUT /api/projects/:id/jira` | `{ siteUrl?, email?, apiToken?, jiraProjectKey?, issueType?, autoCreate? }` | the saved config, same shape as GET. First save needs `siteUrl`, `email`, `apiToken` and `jiraProjectKey`. Later saves are partial, and an empty or missing `apiToken` keeps the stored one |
| `DELETE /api/projects/:id/jira` | | `{ "configured": false }` |
| `POST /api/projects/:id/jira/test` | optional `{ siteUrl?, email?, apiToken? }`; anything missing falls back to the stored config | `{ "ok": true, "displayName": "Ada Lovelace" }`, via Jira's `/rest/api/3/myself` |
| `POST /api/reports/:id/jira` | | `201 { "issueKey", "issueUrl", "syncedAt", "alreadySynced": false }`, or `200 { …, "alreadySynced": true }` if the report already had an issue. No duplicate is created |

`siteUrl` must be an Atlassian Cloud address (`https://<name>.atlassian.net`). The server
sends credentials to that host, so it refuses arbitrary hosts.

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_request` | validation failed, or required fields missing on first save |
| 401 | `not_authenticated`, `invalid_session` | no bearer token, or Supabase rejected it |
| 403 | `project_forbidden` | the project belongs to another user |
| 404 | `project_not_found`, `report_not_found` | no such project or report |
| 409 | `jira_not_configured` | creating an issue for a project without Jira |
| 422 | `jira_bad_credentials` | Jira returned 401: wrong email or token |
| 422 | `jira_site_not_found` | Jira returned 404 or a redirect: wrong site URL |
| 422 | `jira_unknown_project` | Jira rejected `project`: unknown key, or no permission |
| 422 | `jira_bad_issue_type` | Jira rejected `issuetype` |
| 422 | `jira_forbidden`, `jira_rejected`, `jira_token_unreadable` | Jira returned 403; Jira rejected other fields (names listed, not Jira's text); the stored token can't be decrypted (re-enter it) |
| 502 | `jira_unreachable`, `jira_timeout`, `jira_unavailable`, `jira_rate_limited` | Jira is down, slow, returned 5xx, or returned 429 |

Jira failures use `422`/`502`, never `401`. A `401` from these endpoints always means *your
DebugBuddy session* expired, never that Jira rejected something.

### CORS

`/health` is open. `/api/chat` reflects the caller's origin when the project's
`allowed_origins` is empty or contains it. Otherwise the request is rejected with `403` and
no `Access-Control-Allow-Origin` header. The Jira endpoints reflect any origin, or only
`DASHBOARD_ORIGINS` when it's set. They need a bearer token rather than cookies, so a
foreign page can't use them without the user's token.
