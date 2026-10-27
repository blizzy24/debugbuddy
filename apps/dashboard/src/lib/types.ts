export interface Project {
  id: string;
  owner_id: string;
  name: string;
  allowed_origins: string[];
  created_at: string;
}

export interface ApiKey {
  id: string;
  project_id: string;
  key_prefix: string;
  name: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export type SessionStatus = 'open' | 'completed';

export interface Report {
  id: string;
  session_id: string;
  readiness_score: number | null;
  severity: string | null;
  category: string | null;
  content: string;
  jira_issue_key: string | null;
  jira_issue_url: string | null;
  jira_synced_at: string | null;
  jira_sync_error: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  project_id: string;
  original_report: string | null;
  iteration: number;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
}

export type SessionWithReports = Session & { reports: Pick<Report, 'readiness_score' | 'severity' | 'category'>[] };
