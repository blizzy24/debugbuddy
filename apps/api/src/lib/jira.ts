import { executiveSummary, markdownToAdf } from '@debugbuddy/markdown';
import { ApiError } from './errors';

/**
 * Minimal Jira Cloud REST v3 client.
 *
 * Secrets: the API token only ever lives in memory here, inside the
 * Authorization header. It is never logged, never put in an error, and never
 * returned. Errors from Atlassian are mapped to short readable messages; the
 * raw response body is never passed through to the browser.
 */

export interface JiraCredentials {
  siteUrl: string; // normalised: https://<host>, no trailing slash
  email: string;
  apiToken: string;
}

export interface JiraTarget {
  projectKey: string;
  issueType: string;
}

const TIMEOUT_MS = 20_000;
const SUMMARY_MAX = 250;

const PRIORITY_BY_SEVERITY: Record<string, string> = {
  critical: 'Highest',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

// ------------------------------------------------------------------ site URL

const ALLOWED_HOST = /^[a-z0-9][a-z0-9-]*\.(atlassian\.net|jira\.com)$/i;

/**
 * Accepts "acme.atlassian.net", "https://acme.atlassian.net/jira/…" etc. and
 * returns "https://acme.atlassian.net", or null.
 *
 * Restricted to Atlassian Cloud hosts on purpose: the server makes requests to
 * this URL with the user's credentials, so it must not be pointable at
 * arbitrary hosts (internal services, metadata endpoints). REST v3 is a Cloud API anyway.
 */
export function normaliseSiteUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  if (!ALLOWED_HOST.test(url.hostname)) return null;
  return `https://${url.hostname.toLowerCase()}`;
}

// ------------------------------------------------------------------ transport

interface JiraResponse {
  status: number;
  body: unknown;
}

async function jiraRequest(creds: JiraCredentials, path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<JiraResponse> {
  const authorization = `Basic ${Buffer.from(`${creds.email}:${creds.apiToken}`, 'utf8').toString('base64')}`;
  let res: Response;
  try {
    res = await fetch(`${creds.siteUrl}${path}`, {
      method: init.method,
      headers: {
        authorization,
        accept: 'application/json',
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      redirect: 'manual', // never forward credentials to wherever a redirect points
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    console.error(`[jira] request to ${new URL(creds.siteUrl).host} failed: ${timedOut ? 'timeout' : 'network error'}`);
    throw new ApiError(
      502,
      timedOut ? 'jira_timeout' : 'jira_unreachable',
      timedOut ? 'Jira took too long to respond. Try again in a moment.' : `Couldn't reach Jira at ${creds.siteUrl}. Check the site URL.`,
    );
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON (HTML error pages, empty bodies). We never forward it anyway.
  }
  return { status: res.status, body };
}

// ------------------------------------------------------------------ errors

interface JiraErrorBody {
  errorMessages?: unknown;
  errors?: Record<string, unknown>;
}

function fieldErrors(body: unknown): Record<string, unknown> {
  const errors = (body as JiraErrorBody | null)?.errors;
  return errors && typeof errors === 'object' ? errors : {};
}

/** Turn a Jira failure into a short message we are happy to show a user. Never includes Atlassian's text. */
function jiraFailure(res: JiraResponse, creds: JiraCredentials, target?: JiraTarget): ApiError {
  const errors = fieldErrors(res.body);
  // Log status and the *names* of failing fields only. No bodies, no headers.
  console.warn(`[jira] ${res.status} from ${new URL(creds.siteUrl).host}${Object.keys(errors).length ? ` (fields: ${Object.keys(errors).join(', ')})` : ''}`);

  if (res.status === 401) {
    return new ApiError(422, 'jira_bad_credentials', 'Jira rejected the email and API token. Check both, and that the token hasn’t been revoked.');
  }
  if (res.status === 403) {
    return new ApiError(
      422,
      'jira_forbidden',
      'Jira refused access. The account may not have permission for this, or Jira may want a CAPTCHA after failed sign-ins — sign in to Jira in a browser once, then try again.',
    );
  }
  if (res.status === 404 || (res.status >= 300 && res.status < 400)) {
    return new ApiError(422, 'jira_site_not_found', `No Jira site was found at ${creds.siteUrl}. It should look like https://your-company.atlassian.net.`);
  }
  if (res.status === 400) {
    if ('project' in errors) {
      return new ApiError(422, 'jira_unknown_project', `Jira doesn’t recognise the project key “${target?.projectKey ?? ''}”, or this account can’t create issues in it.`);
    }
    if ('issuetype' in errors) {
      return new ApiError(
        422,
        'jira_bad_issue_type',
        `“${target?.issueType ?? ''}” isn’t an issue type in project ${target?.projectKey ?? ''}. Use one that exists there, such as Bug or Task.`,
      );
    }
    const fields = Object.keys(errors);
    return new ApiError(
      422,
      'jira_rejected',
      fields.length
        ? `Jira rejected the issue because of these fields: ${fields.join(', ')}. They may be required on this project’s create screen.`
        : 'Jira rejected the issue.',
    );
  }
  if (res.status === 429) return new ApiError(502, 'jira_rate_limited', 'Jira is rate-limiting requests. Try again in a minute.');
  return new ApiError(502, 'jira_unavailable', `Jira returned an unexpected error (${res.status}). Try again later.`);
}

// ------------------------------------------------------------------ operations

/** GET /rest/api/3/myself. Returns the account's display name. */
export async function testConnection(creds: JiraCredentials): Promise<{ displayName: string }> {
  const res = await jiraRequest(creds, '/rest/api/3/myself', { method: 'GET' });
  if (res.status !== 200) throw jiraFailure(res, creds);
  const displayName = (res.body as { displayName?: unknown } | null)?.displayName;
  return { displayName: typeof displayName === 'string' && displayName ? displayName : creds.email };
}

export interface ReportForJira {
  content: string;
  severity: string | null;
  category: string | null;
  originalReport: string | null;
}

/** First sentence of the Executive Summary, ≤ 250 chars with an ellipsis if cut. */
export function issueSummary(report: Pick<ReportForJira, 'content' | 'originalReport'>): string {
  const source =
    executiveSummary(report.content) ??
    report.originalReport?.replace(/\s+/g, ' ').trim() ??
    '';
  const firstSentence = /^(.+?[.!?])(?=\s|$)/.exec(source)?.[1] ?? source;
  const text = firstSentence.trim() || 'Bug report from DebugBuddy';
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1).trimEnd()}…` : text;
}

function label(value: string): string {
  // Jira labels cannot contain spaces.
  return value.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 255);
}

export async function createIssue(creds: JiraCredentials, target: JiraTarget, report: ReportForJira): Promise<{ key: string; url: string }> {
  const labels = ['debugbuddy'];
  if (report.category?.trim()) labels.push(label(report.category));
  const priority = report.severity ? PRIORITY_BY_SEVERITY[report.severity.trim().toLowerCase()] : undefined;

  const fields: Record<string, unknown> = {
    project: { key: target.projectKey },
    issuetype: { name: target.issueType },
    summary: issueSummary(report),
    description: markdownToAdf(report.content),
    labels: Array.from(new Set(labels)),
  };
  if (priority) fields.priority = { name: priority };

  let res = await jiraRequest(creds, '/rest/api/3/issue', { method: 'POST', body: { fields } });

  // Priority is often hidden or restricted on a project's create screen. Don't fail the issue over it.
  if (res.status === 400 && fields.priority && 'priority' in fieldErrors(res.body)) {
    console.warn('[jira] priority not accepted on this project; retrying without it');
    delete fields.priority;
    res = await jiraRequest(creds, '/rest/api/3/issue', { method: 'POST', body: { fields } });
  }

  if (res.status !== 201 && res.status !== 200) throw jiraFailure(res, creds, target);

  const key = (res.body as { key?: unknown } | null)?.key;
  if (typeof key !== 'string' || !key) throw new ApiError(502, 'jira_bad_response', 'Jira created the issue but didn’t return its key.');
  return { key, url: `${creds.siteUrl}/browse/${key}` };
}
