import { config } from './config';
import { supabase } from './supabase';

/**
 * The dashboard's only backend calls: the Jira endpoints. Everything else goes
 * straight to Supabase under RLS. Jira config is the exception because it holds
 * a secret the browser must never be able to read.
 */

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: { method?: 'GET' | 'PUT' | 'POST' | 'DELETE'; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiRequestError(401, 'not_authenticated', 'Your session has expired. Sign in again.');

  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiRequestError(0, 'network_error', `Couldn’t reach the DebugBuddy API at ${config.apiUrl}. Is it running?`);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // empty or non-JSON body
  }

  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiRequestError(res.status, err?.code ?? 'http_error', err?.message ?? `Request failed (${res.status}).`);
  }
  return body as T;
}

// ------------------------------------------------------------------ Jira

export type JiraConfig =
  | { configured: false }
  | {
      configured: true;
      siteUrl: string;
      email: string;
      jiraProjectKey: string;
      issueType: string;
      autoCreate: boolean;
      hasToken: boolean;
      createdAt: string;
      updatedAt: string;
    };

export interface JiraConfigInput {
  siteUrl?: string;
  email?: string;
  apiToken?: string;
  jiraProjectKey?: string;
  issueType?: string;
  autoCreate?: boolean;
}

export interface JiraSyncResult {
  issueKey: string;
  issueUrl: string;
  syncedAt: string;
  alreadySynced: boolean;
}

export const jiraApi = {
  get: (projectId: string) => apiFetch<JiraConfig>(`/api/projects/${projectId}/jira`),
  save: (projectId: string, input: JiraConfigInput) => apiFetch<JiraConfig>(`/api/projects/${projectId}/jira`, { method: 'PUT', body: input }),
  remove: (projectId: string) => apiFetch<JiraConfig>(`/api/projects/${projectId}/jira`, { method: 'DELETE' }),
  test: (projectId: string, input: JiraConfigInput) =>
    apiFetch<{ ok: true; displayName: string }>(`/api/projects/${projectId}/jira/test`, { method: 'POST', body: input }),
  createIssue: (reportId: string) => apiFetch<JiraSyncResult>(`/api/reports/${reportId}/jira`, { method: 'POST' }),
};

export const ATLASSIAN_TOKEN_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';
