import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { encrypt } from '../lib/crypto';
import { ApiError, asyncHandler } from '../lib/errors';
import { normaliseSiteUrl, testConnection, type JiraCredentials } from '../lib/jira';
import { decryptToken, loadJiraConfig, reportProjectId, syncReportToJira, type JiraConfigRow } from '../lib/jiraSync';
import { supabase } from '../lib/supabase';
import { assertProjectOwner, currentUser } from '../lib/userAuth';

// Dashboard-only routes. Mounted behind requireUser (bearer token); never
// reachable with a widget API key.

const SITE_URL_HINT = 'Use your Atlassian Cloud address, like https://your-company.atlassian.net';

const siteUrl = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalised = normaliseSiteUrl(value);
    if (!normalised) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: SITE_URL_HINT });
      return z.NEVER;
    }
    return normalised;
  });
const email = z.string().trim().email('Enter the email address of the Jira account');
const apiToken = z.string().trim().max(1024);
const projectKey = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/, 'Project keys are letters and numbers, like BUG'));
const issueType = z.string().trim().min(1, 'Enter an issue type, such as Bug').max(100);

/** PUT accepts a partial update; on first save the required fields are checked separately. */
const configBody = z
  .object({
    siteUrl: siteUrl.optional(),
    email: email.optional(),
    apiToken: apiToken.optional(), // empty or absent = keep the stored token
    jiraProjectKey: projectKey.optional(),
    issueType: issueType.optional(),
    autoCreate: z.boolean().optional(),
  })
  .strict();

const testBody = z
  .object({
    siteUrl: siteUrl.optional(),
    email: email.optional(),
    apiToken: apiToken.optional(),
  })
  .passthrough(); // the form may send its other fields too; they're ignored here

/** The shape the dashboard sees. The token, encrypted or not, is never part of it. */
function publicConfig(row: Omit<JiraConfigRow, 'api_token_encrypted'> | null) {
  if (!row) return { configured: false as const };
  return {
    configured: true as const,
    siteUrl: row.site_url,
    email: row.email,
    jiraProjectKey: row.jira_project_key,
    issueType: row.issue_type,
    autoCreate: row.auto_create,
    hasToken: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PUBLIC_COLUMNS = 'id, project_id, site_url, email, jira_project_key, issue_type, auto_create, created_at, updated_at';

async function ownedProjectId(req: Request): Promise<string> {
  const projectId = req.params.id ?? '';
  await assertProjectOwner(projectId, currentUser(req));
  return projectId;
}

// ------------------------------------------------------------------ /api/projects/:id/jira

export const projectJiraRouter = Router();

projectJiraRouter.get(
  '/:id/jira',
  asyncHandler(async (req: Request, res: Response) => {
    const projectId = await ownedProjectId(req);
    const { data, error } = await supabase.from('jira_configs').select(PUBLIC_COLUMNS).eq('project_id', projectId).maybeSingle();
    if (error) throw error;
    res.json(publicConfig(data as Omit<JiraConfigRow, 'api_token_encrypted'> | null));
  }),
);

projectJiraRouter.put(
  '/:id/jira',
  asyncHandler(async (req: Request, res: Response) => {
    const projectId = await ownedProjectId(req);
    const body = configBody.parse(req.body ?? {});
    const existing = await loadJiraConfig(projectId);

    const update: Record<string, unknown> = {};
    if (body.siteUrl !== undefined) update.site_url = body.siteUrl;
    if (body.email !== undefined) update.email = body.email;
    if (body.jiraProjectKey !== undefined) update.jira_project_key = body.jiraProjectKey;
    if (body.issueType !== undefined) update.issue_type = body.issueType;
    if (body.autoCreate !== undefined) update.auto_create = body.autoCreate;
    if (body.apiToken) update.api_token_encrypted = encrypt(body.apiToken, projectId);

    let saved: unknown;
    if (existing) {
      const { data, error } = await supabase.from('jira_configs').update(update).eq('project_id', projectId).select(PUBLIC_COLUMNS).single();
      if (error) throw error;
      saved = data;
    } else {
      const missing = [
        !body.siteUrl && 'site URL',
        !body.email && 'email',
        !body.apiToken && 'API token',
        !body.jiraProjectKey && 'project key',
      ].filter(Boolean);
      if (missing.length) throw new ApiError(400, 'invalid_request', `To connect Jira, enter the ${missing.join(', ')}.`);
      const { data, error } = await supabase
        .from('jira_configs')
        .insert({ project_id: projectId, issue_type: 'Bug', ...update })
        .select(PUBLIC_COLUMNS)
        .single();
      if (error) throw error;
      saved = data;
    }

    res.json(publicConfig(saved as Omit<JiraConfigRow, 'api_token_encrypted'>));
  }),
);

projectJiraRouter.delete(
  '/:id/jira',
  asyncHandler(async (req: Request, res: Response) => {
    const projectId = await ownedProjectId(req);
    const { error } = await supabase.from('jira_configs').delete().eq('project_id', projectId);
    if (error) throw error;
    res.json(publicConfig(null));
  }),
);

/**
 * Tests the values in the form when given, falling back to what's stored, so
 * the user can test before saving and can test without re-entering the token.
 */
projectJiraRouter.post(
  '/:id/jira/test',
  asyncHandler(async (req: Request, res: Response) => {
    const projectId = await ownedProjectId(req);
    const body = testBody.parse(req.body ?? {});
    const stored = await loadJiraConfig(projectId);

    const creds: Partial<JiraCredentials> = {
      siteUrl: body.siteUrl ?? stored?.site_url,
      email: body.email ?? stored?.email,
      apiToken: body.apiToken || (stored ? decryptToken(stored) : undefined),
    };
    if (!creds.siteUrl || !creds.email || !creds.apiToken) {
      throw new ApiError(400, 'invalid_request', 'Enter the site URL, email and API token to test the connection.');
    }

    const { displayName } = await testConnection(creds as JiraCredentials);
    res.json({ ok: true, displayName });
  }),
);

// ------------------------------------------------------------------ /api/reports/:id/jira

export const reportJiraRouter = Router();

reportJiraRouter.post(
  '/:id/jira',
  asyncHandler(async (req: Request, res: Response) => {
    const reportId = req.params.id ?? '';
    if (!z.string().uuid().safeParse(reportId).success) throw new ApiError(404, 'report_not_found', 'Report not found.');

    const projectId = await reportProjectId(reportId);
    if (!projectId) throw new ApiError(404, 'report_not_found', 'Report not found.');
    await assertProjectOwner(projectId, currentUser(req));

    const result = await syncReportToJira(reportId);
    res.status(result.alreadySynced ? 200 : 201).json(result);
  }),
);
