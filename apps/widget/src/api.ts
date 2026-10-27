export type ReplyType = 'questions' | 'report';

export interface ChatReply {
  sessionId: string;
  type: ReplyType;
  content: string;
}

export class ChatError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const CLIENT_TIMEOUT_MS = 75_000;

/** Never throws anything but ChatError. */
export async function sendChat(
  apiUrl: string,
  apiKey: string,
  message: string,
  sessionId: string | null,
): Promise<ChatReply> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(sessionId ? { message, sessionId } : { message }),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    throw new ChatError(0, aborted ? 'client_timeout' : 'network_error', aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // fall through with body = null
  }

  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ChatError(res.status, err?.code ?? 'http_error', err?.message ?? `HTTP ${res.status}`);
  }

  const reply = body as Partial<ChatReply> | null;
  if (!reply || typeof reply.content !== 'string' || typeof reply.sessionId !== 'string') {
    throw new ChatError(res.status, 'bad_response', 'Unexpected response');
  }
  return {
    sessionId: reply.sessionId,
    type: reply.type === 'report' ? 'report' : 'questions',
    content: reply.content,
  };
}

/** Human copy for each failure. The thread shows this, never a raw error. */
export function describeError(err: ChatError): { text: string; retryable: boolean } {
  switch (err.code) {
    case 'network_error':
      return { text: "I couldn't reach DebugBuddy. Check your connection and try again.", retryable: true };
    case 'client_timeout':
    case 'pipeline_timeout':
      return { text: 'That took longer than expected. Your message is safe — try sending it again.', retryable: true };
    case 'invalid_api_key':
      return { text: "This site's DebugBuddy key isn't valid, so I can't take reports right now.", retryable: false };
    case 'origin_not_allowed':
      return { text: "This site isn't allowed to send reports to this DebugBuddy project.", retryable: false };
    case 'session_forbidden':
      return { text: 'Your previous conversation expired. Try again to start a fresh one.', retryable: true };
    case 'invalid_request':
      return { text: err.message, retryable: false };
    default:
      if (err.status === 502) {
        return { text: 'The analysis service is unavailable right now. Give it a moment and try again.', retryable: true };
      }
      return { text: 'Something went wrong on our side. Try again in a moment.', retryable: true };
  }
}
