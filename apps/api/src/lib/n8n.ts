import { env } from './env';
import { ApiError } from './errors';

export type ReplyType = 'questions' | 'report';

export interface PipelineReply {
  type: ReplyType;
  content: string;
  readinessScore: number | null;
  severity: string | null;
  category: string | null;
}

const TIMEOUT_MS = 60_000;
const REPORT_HEADING = '# Engineering Report';

/**
 * Explicit type/status values the pipeline may send. Anything here wins over
 * the heading heuristic, so n8n can start sending `type` without an API change.
 */
const TYPE_ALIASES: Record<string, ReplyType> = {
  report: 'report',
  report_ready: 'report',
  questions: 'questions',
  question: 'questions',
  clarification: 'questions',
  needs_clarification: 'questions',
};

type Payload = Record<string, unknown>;

function isObject(value: unknown): value is Payload {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveType(payload: Payload, text: string): ReplyType {
  for (const field of ['type', 'status']) {
    const value = payload[field];
    if (typeof value === 'string') {
      const mapped = TYPE_ALIASES[value.toLowerCase()];
      if (mapped) return mapped;
    }
  }
  return text.trimStart().startsWith(REPORT_HEADING) ? 'report' : 'questions';
}

function parseReadiness(payload: Payload, text: string): number | null {
  const explicit = payload.readiness_score;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return Math.round(explicit);
  // Matches "Readiness: 72/100" and the bold form "**Readiness:** 72/100".
  const m = /Readiness:?\**\s*:?\s*(\d{1,3})\s*\/\s*100/i.exec(text);
  return m?.[1] ? Number(m[1]) : null;
}

function parseLabel(payload: Payload, field: 'severity' | 'category', text: string): string | null {
  const report = isObject(payload.report) ? payload.report : {};
  const intake = isObject(payload.intake) ? payload.intake : {};
  const explicit = str(payload[field]) ?? str(report[field]) ?? str(intake[field]);
  if (explicit) return explicit;
  const m = new RegExp(`${field}:?\\**\\s*:?\\s*([A-Za-z][\\w-]*(?: [\\w-]+)?)`, 'i').exec(text);
  return m?.[1]?.trim() ?? null;
}

/** Accepts `{ output }`, `{ message }`, or an array whose first element has that shape. */
function normalise(body: unknown): { payload: Payload; text: string } {
  const payload = Array.isArray(body) ? body[0] : body;
  if (!isObject(payload)) throw new ApiError(502, 'pipeline_bad_response', 'The analysis pipeline returned an unexpected response.');
  const text = str(payload.output) ?? str(payload.message) ?? str(payload.text);
  if (!text) throw new ApiError(502, 'pipeline_bad_response', 'The analysis pipeline returned an empty response.');
  return { payload, text };
}

export async function callPipeline(message: string, sessionId: string): Promise<PipelineReply> {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  if (env.N8N_WEBHOOK_AUTH_HEADER && env.N8N_WEBHOOK_AUTH_VALUE) {
    headers[env.N8N_WEBHOOK_AUTH_HEADER] = env.N8N_WEBHOOK_AUTH_VALUE;
  }

  let res: Response;
  try {
    res = await fetch(env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers,
      // `action` is what n8n's Chat Trigger expects; plain webhooks ignore it.
      body: JSON.stringify({ action: 'sendMessage', chatInput: message, sessionId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    console.error('[n8n] request failed:', err instanceof Error ? err.message : err);
    throw new ApiError(
      502,
      timedOut ? 'pipeline_timeout' : 'pipeline_unreachable',
      timedOut ? 'The analysis pipeline took too long to respond.' : 'The analysis pipeline is unreachable.',
    );
  }

  if (!res.ok) {
    console.error(`[n8n] non-2xx response: ${res.status}`);
    throw new ApiError(502, 'pipeline_error', `The analysis pipeline responded with status ${res.status}.`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(502, 'pipeline_bad_response', 'The analysis pipeline returned invalid JSON.');
  }

  const { payload, text } = normalise(body);
  const type = resolveType(payload, text);
  return {
    type,
    content: text,
    readinessScore: parseReadiness(payload, text),
    severity: type === 'report' ? parseLabel(payload, 'severity', text) : null,
    category: type === 'report' ? parseLabel(payload, 'category', text) : null,
  };
}
