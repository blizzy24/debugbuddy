-- =====================================================================
-- Migration 002: Jira integration
--
-- Run ONCE against an existing DebugBuddy database (one that already ran
-- the original schema.sql), in the Supabase SQL editor. Safe to re-run:
-- every statement is IF NOT EXISTS / idempotent, and nothing existing is
-- dropped or rewritten. Fresh installs don't need this file; schema.sql
-- already includes it.
--
-- (Report download needs no schema change; "export" in the name refers to
-- exporting reports to Jira.)
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
