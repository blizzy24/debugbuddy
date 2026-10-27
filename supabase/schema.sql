-- =====================================================================
-- DebugBuddy schema
--
-- Run top to bottom in the Supabase SQL editor. Safe to re-run.
--
-- Two trust levels:
--   * The dashboard talks to these tables directly with the user's JWT,
--     so every table has RLS enabled and every row is scoped to a project
--     whose owner_id = auth.uid().
--   * The API (apps/api) connects with the SERVICE ROLE key and therefore
--     BYPASSES RLS by design. It is the only writer for widget traffic
--     (sessions, reports, usage_events) and authorises each request itself
--     by verifying a project-scoped API key. Never ship the service role
--     key to a browser.
--
-- Already ran an earlier version of this file? Don't re-run it to upgrade;
-- run the files in supabase/migrations/ that you haven't run yet.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users (id) on delete cascade,
  name            text not null,
  allowed_origins text[] not null default '{}',
  created_at      timestamptz not null default now()
);

create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  key_hash     text not null,
  key_prefix   text not null,
  name         text,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.sessions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  original_report text,
  iteration       int not null default 1,
  status          text not null default 'open' check (status in ('open', 'completed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  readiness_score int,
  severity        text,
  category        text,
  content         text not null,
  jira_issue_key  text,
  jira_issue_url  text,
  jira_synced_at  timestamptz,
  jira_sync_error text,
  created_at      timestamptz not null default now()
);

create table if not exists public.usage_events (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  event_type text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------

create index if not exists api_keys_key_prefix_idx   on public.api_keys (key_prefix);
create index if not exists sessions_project_id_idx   on public.sessions (project_id);
create index if not exists reports_session_id_idx    on public.reports (session_id);
create index if not exists projects_owner_id_idx     on public.projects (owner_id);
create index if not exists api_keys_project_id_idx   on public.api_keys (project_id);
create index if not exists usage_events_project_idx  on public.usage_events (project_id);

-- ---------------------------------------------------------------------
-- Keep sessions.updated_at honest even if a writer forgets to set it
-- ---------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sessions_touch_updated_at on public.sessions;
create trigger sessions_touch_updated_at
  before update on public.sessions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Row level security
-- A user may select / insert / update / delete rows that belong to a
-- project they own. Child tables prove ownership through the parent.
-- ---------------------------------------------------------------------

alter table public.projects     enable row level security;
alter table public.api_keys     enable row level security;
alter table public.sessions     enable row level security;
alter table public.reports      enable row level security;
alter table public.usage_events enable row level security;

-- projects: ownership is the row itself
drop policy if exists "projects: owner select" on public.projects;
drop policy if exists "projects: owner insert" on public.projects;
drop policy if exists "projects: owner update" on public.projects;
drop policy if exists "projects: owner delete" on public.projects;

create policy "projects: owner select" on public.projects
  for select to authenticated using (owner_id = auth.uid());
create policy "projects: owner insert" on public.projects
  for insert to authenticated with check (owner_id = auth.uid());
create policy "projects: owner update" on public.projects
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "projects: owner delete" on public.projects
  for delete to authenticated using (owner_id = auth.uid());

-- api_keys: via projects
drop policy if exists "api_keys: owner select" on public.api_keys;
drop policy if exists "api_keys: owner insert" on public.api_keys;
drop policy if exists "api_keys: owner update" on public.api_keys;
drop policy if exists "api_keys: owner delete" on public.api_keys;

create policy "api_keys: owner select" on public.api_keys
  for select to authenticated using (
    exists (select 1 from public.projects p where p.id = api_keys.project_id and p.owner_id = auth.uid()));
create policy "api_keys: owner insert" on public.api_keys
  for insert to authenticated with check (
    exists (select 1 from public.projects p where p.id = api_keys.project_id and p.owner_id = auth.uid()));
create policy "api_keys: owner update" on public.api_keys
  for update to authenticated
  using (exists (select 1 from public.projects p where p.id = api_keys.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = api_keys.project_id and p.owner_id = auth.uid()));
create policy "api_keys: owner delete" on public.api_keys
  for delete to authenticated using (
    exists (select 1 from public.projects p where p.id = api_keys.project_id and p.owner_id = auth.uid()));

-- sessions: via projects
drop policy if exists "sessions: owner select" on public.sessions;
drop policy if exists "sessions: owner insert" on public.sessions;
drop policy if exists "sessions: owner update" on public.sessions;
drop policy if exists "sessions: owner delete" on public.sessions;

create policy "sessions: owner select" on public.sessions
  for select to authenticated using (
    exists (select 1 from public.projects p where p.id = sessions.project_id and p.owner_id = auth.uid()));
create policy "sessions: owner insert" on public.sessions
  for insert to authenticated with check (
    exists (select 1 from public.projects p where p.id = sessions.project_id and p.owner_id = auth.uid()));
create policy "sessions: owner update" on public.sessions
  for update to authenticated
  using (exists (select 1 from public.projects p where p.id = sessions.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = sessions.project_id and p.owner_id = auth.uid()));
create policy "sessions: owner delete" on public.sessions
  for delete to authenticated using (
    exists (select 1 from public.projects p where p.id = sessions.project_id and p.owner_id = auth.uid()));

-- reports: via sessions -> projects
drop policy if exists "reports: owner select" on public.reports;
drop policy if exists "reports: owner insert" on public.reports;
drop policy if exists "reports: owner update" on public.reports;
drop policy if exists "reports: owner delete" on public.reports;

create policy "reports: owner select" on public.reports
  for select to authenticated using (
    exists (select 1 from public.sessions s join public.projects p on p.id = s.project_id
            where s.id = reports.session_id and p.owner_id = auth.uid()));
create policy "reports: owner insert" on public.reports
  for insert to authenticated with check (
    exists (select 1 from public.sessions s join public.projects p on p.id = s.project_id
            where s.id = reports.session_id and p.owner_id = auth.uid()));
create policy "reports: owner update" on public.reports
  for update to authenticated
  using (exists (select 1 from public.sessions s join public.projects p on p.id = s.project_id
                 where s.id = reports.session_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.sessions s join public.projects p on p.id = s.project_id
                      where s.id = reports.session_id and p.owner_id = auth.uid()));
create policy "reports: owner delete" on public.reports
  for delete to authenticated using (
    exists (select 1 from public.sessions s join public.projects p on p.id = s.project_id
            where s.id = reports.session_id and p.owner_id = auth.uid()));

-- usage_events: via projects
drop policy if exists "usage_events: owner select" on public.usage_events;
drop policy if exists "usage_events: owner insert" on public.usage_events;
drop policy if exists "usage_events: owner update" on public.usage_events;
drop policy if exists "usage_events: owner delete" on public.usage_events;

create policy "usage_events: owner select" on public.usage_events
  for select to authenticated using (
    exists (select 1 from public.projects p where p.id = usage_events.project_id and p.owner_id = auth.uid()));
create policy "usage_events: owner insert" on public.usage_events
  for insert to authenticated with check (
    exists (select 1 from public.projects p where p.id = usage_events.project_id and p.owner_id = auth.uid()));
create policy "usage_events: owner update" on public.usage_events
  for update to authenticated
  using (exists (select 1 from public.projects p where p.id = usage_events.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = usage_events.project_id and p.owner_id = auth.uid()));
create policy "usage_events: owner delete" on public.usage_events
  for delete to authenticated using (
    exists (select 1 from public.projects p where p.id = usage_events.project_id and p.owner_id = auth.uid()));

-- =====================================================================
-- Jira integration (also shipped as supabase/migrations/002_jira_and_export.sql
-- for databases created before it existed)
-- =====================================================================

-- ---------------------------------------------------------------------
-- jira_configs: one Jira connection per project
--
-- SECURITY: this table holds an (encrypted) Jira API token. RLS is enabled
-- and there are deliberately NO policies for anon or authenticated — not
-- even "owner can select own row". With RLS on and no policy, PostgREST
-- returns nothing and rejects every write, so the browser cannot read this
-- table at all. We also revoke the table privileges outright, as a second
-- lock in case a policy is ever added by mistake.
--
-- Why not let owners read their own row? Because the browser never needs
-- the token, and the safest secret is one that is unreachable rather than
-- one filtered out by a column list someone might later change. The API
-- reaches this table with the service role key, decrypts the token in
-- memory only to call Jira, and returns the config to the dashboard
-- WITHOUT the token. All access goes through /api/projects/:id/jira.
-- ---------------------------------------------------------------------

create table if not exists public.jira_configs (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null unique references public.projects (id) on delete cascade,
  site_url            text not null,
  email               text not null,
  api_token_encrypted text not null,
  jira_project_key    text not null,
  issue_type          text not null default 'Bug',
  auto_create         boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.jira_configs enable row level security;
revoke all on table public.jira_configs from anon, authenticated;

drop trigger if exists jira_configs_touch_updated_at on public.jira_configs;
create trigger jira_configs_touch_updated_at
  before update on public.jira_configs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- reports: where a report went in Jira, or why it didn't get there
-- ---------------------------------------------------------------------

alter table public.reports add column if not exists jira_issue_key  text;
alter table public.reports add column if not exists jira_issue_url  text;
alter table public.reports add column if not exists jira_synced_at  timestamptz;
alter table public.reports add column if not exists jira_sync_error text;
