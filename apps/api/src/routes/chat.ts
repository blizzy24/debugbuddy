import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { verifyApiKey } from '../lib/auth';
import { allowAnyOrigin, isOriginAllowed, revokeCors } from '../lib/cors';
import { ApiError } from '../lib/errors';
import { autoCreateJiraIssueForSession } from '../lib/jiraSync';
import { callPipeline } from '../lib/n8n';
import { supabase } from '../lib/supabase';

const bodySchema = z.object({
  message: z.string().trim().min(1, 'message is required').max(5000, 'message must be at most 5000 characters'),
  sessionId: z.string().uuid('sessionId must be a uuid').optional(),
});

interface SessionRow {
  id: string;
  project_id: string;
  status: 'open' | 'completed';
  iteration: number;
}

export const chatRouter = Router();

chatRouter.options('/', (req, res) => {
  allowAnyOrigin(req, res);
  res.sendStatus(204);
});

chatRouter.post('/', (req, res, next) => {
  handleChat(req, res).catch(next);
});

async function handleChat(req: Request, res: Response) {
  // Reflect the origin up front so the widget can read 401s; narrowed below once we know the project.
  allowAnyOrigin(req, res);

  // 1. Key
  const key = await verifyApiKey(req.get('x-api-key'));
  if (!key) throw new ApiError(401, 'invalid_api_key', 'The API key is missing, invalid, or revoked.');

  if (!isOriginAllowed(req.get('origin'), key.allowedOrigins)) {
    revokeCors(res);
    throw new ApiError(403, 'origin_not_allowed', 'This origin is not allowed for this project.');
  }

  const { message, sessionId: requestedId } = bodySchema.parse(req.body);

  // 2. Session
  let session = requestedId ? await loadSession(requestedId, key.projectId) : null;
  if (!session) {
    session = await createSession(key.projectId, message);
  }

  // 3–5. Pipeline
  const reply = await callPipeline(message, session.id);

  // 6. Persist the outcome
  if (reply.type === 'report') {
    const { error: reportError } = await supabase.from('reports').insert({
      session_id: session.id,
      readiness_score: reply.readinessScore,
      severity: reply.severity,
      category: reply.category,
      content: reply.content,
    });
    if (reportError) throw reportError;

    const { error } = await supabase
      .from('sessions')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', session.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('sessions')
      .update({ iteration: session.iteration + 1, updated_at: new Date().toISOString() })
      .eq('id', session.id);
    if (error) throw error;
  }

  // 7. Usage
  const { error: usageError } = await supabase
    .from('usage_events')
    .insert({ project_id: key.projectId, session_id: session.id, event_type: 'chat_message' });
  if (usageError) console.warn('[chat] failed to record usage event:', usageError.message);

  // 8. Reply
  res.status(200).json({ sessionId: session.id, type: reply.type, content: reply.content });

  // 9. Jira auto-create. Added after the response is sent and never throws, so
  // nothing in it can delay or change what the visitor receives.
  if (reply.type === 'report') void autoCreateJiraIssueForSession(key.projectId, session.id);
}

/**
 * Returns the open session, or null when the session has already completed
 * (the next message then starts a fresh one). Throws 403 when the session is
 * unknown or belongs to another project — the two are indistinguishable on purpose.
 */
async function loadSession(id: string, projectId: string): Promise<SessionRow | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, project_id, status, iteration')
    .eq('id', id)
    .maybeSingle<SessionRow>();
  if (error) throw error;
  if (!data || data.project_id !== projectId) {
    throw new ApiError(403, 'session_forbidden', 'This session does not belong to this project.');
  }
  return data.status === 'completed' ? null : data;
}

async function createSession(projectId: string, message: string): Promise<SessionRow> {
  const row: SessionRow = { id: randomUUID(), project_id: projectId, status: 'open', iteration: 1 };
  const { error } = await supabase.from('sessions').insert({ ...row, original_report: message });
  if (error) throw error;
  return row;
}

