import { decrypt, DecryptionError } from './crypto';
import { ApiError } from './errors';
import { createIssue } from './jira';
import { supabase } from './supabase';

/**
 * Report → Jira issue. Shared by the manual endpoint and auto-create.
 * Reads jira_configs with the service role; the decrypted token never leaves
 * this module's call stack.
 */

export interface JiraConfigRow {
  id: string;
  project_id: string;
  site_url: string;
  email: string;
  api_token_encrypted: string;
  jira_project_key: string;
  issue_type: string;
  auto_create: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncResult {
  issueKey: string;
  issueUrl: string;
  syncedAt: string;
  alreadySynced: boolean;
}

interface ReportRow {
  id: string;
  content: string;
  severity: string | null;
  category: string | null;
  jira_issue_key: string | null;
  jira_issue_url: string | null;
  jira_synced_at: string | null;
  sessions: { project_id: string; original_report: string | null } | null;
}

export async function loadJiraConfig(projectId: string): Promise<JiraConfigRow | null> {
  const { data, error } = await supabase.from('jira_configs').select('*').eq('project_id', projectId).maybeSingle<JiraConfigRow>();
  if (error) throw error;
  return data;
}

export function decryptToken(config: Pick<JiraConfigRow, 'api_token_encrypted' | 'project_id'>): string {
  try {
    return decrypt(config.api_token_encrypted, config.project_id);
  } catch (err) {
    if (err instanceof DecryptionError) {
      console.error(`[jira] stored token for project ${config.project_id} could not be decrypted (was ENCRYPTION_KEY changed?)`);
      throw new ApiError(422, 'jira_token_unreadable', 'The saved Jira API token can’t be used any more. Edit the Jira settings and enter the token again.');
    }
    throw err;
  }
}

/** The project a report belongs to, or null if the report doesn't exist. */
export async function reportProjectId(reportId: string): Promise<string | null> {
  const { data, error } = await supabase.from('reports').select('sessions(project_id)').eq('id', reportId).maybeSingle();
  if (error) throw error;
  const sessions = (data as { sessions: { project_id: string } | null } | null)?.sessions;
  return sessions?.project_id ?? null;
}

// Two clicks, or a click racing auto-create, must not create two issues. One
// API process serialises per report; the jira_issue_key check covers the rest.
const inFlight = new Map<string, Promise<SyncResult>>();

export function syncReportToJira(reportId: string): Promise<SyncResult> {
  const existing = inFlight.get(reportId);
  if (existing) return existing;
  const run = doSync(reportId).finally(() => inFlight.delete(reportId));
  inFlight.set(reportId, run);
  return run;
}

async function doSync(reportId: string): Promise<SyncResult> {
  const { data, error } = await supabase
    .from('reports')
    .select('id, content, severity, category, jira_issue_key, jira_issue_url, jira_synced_at, sessions(project_id, original_report)')
    .eq('id', reportId)
    .maybeSingle();
  if (error) throw error;
  const report = data as ReportRow | null;
  if (!report?.sessions) throw new ApiError(404, 'report_not_found', 'Report not found.');

  if (report.jira_issue_key) {
    return {
      issueKey: report.jira_issue_key,
      issueUrl: report.jira_issue_url ?? '',
      syncedAt: report.jira_synced_at ?? '',
      alreadySynced: true,
    };
  }

  const config = await loadJiraConfig(report.sessions.project_id);
  if (!config) throw new ApiError(409, 'jira_not_configured', 'Connect Jira to this project first.');

  const issue = await createIssue(
    { siteUrl: config.site_url, email: config.email, apiToken: decryptToken(config) },
    { projectKey: config.jira_project_key, issueType: config.issue_type },
    {
      content: report.content,
      severity: report.severity,
      category: report.category,
      originalReport: report.sessions.original_report,
    },
  );

  const syncedAt = new Date().toISOString();
  const update = { jira_issue_key: issue.key, jira_issue_url: issue.url, jira_synced_at: syncedAt, jira_sync_error: null };
  let { error: saveError } = await supabase.from('reports').update(update).eq('id', report.id);
  if (saveError) ({ error: saveError } = await supabase.from('reports').update(update).eq('id', report.id));
  if (saveError) {
    // The issue exists in Jira; failing here would invite a duplicate on retry. Report success, log loudly.
    console.error(`[jira] created ${issue.key} for report ${report.id} but could not record it: ${saveError.message}`);
  }

  return { issueKey: issue.key, issueUrl: issue.url, syncedAt, alreadySynced: false };
}

/**
 * Auto-create after a report lands. Never throws: a Jira problem must not
 * affect the visitor's chat. Failures are logged and recorded on the report so
 * the dashboard can offer the manual button.
 */
export async function autoCreateJiraIssueForSession(projectId: string, sessionId: string): Promise<void> {
  let reportId: string | null = null;
  try {
    const config = await loadJiraConfig(projectId);
    if (!config?.auto_create) return;

    // The chat handler stays as it was, so look up the report it just inserted.
    const { data, error } = await supabase
      .from('reports')
      .select('id')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (error) throw error;
    if (!data) return;
    reportId = data.id;

    const result = await syncReportToJira(reportId);
    console.log(`[jira] auto-created ${result.issueKey} for report ${reportId}`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Something went wrong creating the Jira issue.';
    // ApiError messages are ours; database/network errors carry no secrets. Neither includes the token.
    const detail = err instanceof ApiError ? err.code : ((err as { message?: string } | null)?.message ?? String(err));
    console.error(`[jira] auto-create failed for session ${sessionId}${reportId ? ` / report ${reportId}` : ''}: ${detail}`);
    if (!reportId) return;
    try {
      await supabase.from('reports').update({ jira_sync_error: message }).eq('id', reportId);
    } catch {
      // Nothing else to do; already logged.
    }
  }
}
