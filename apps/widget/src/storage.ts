// sessionStorage can be missing or throw (privacy modes, sandboxed iframes). Never let that break the widget.

export interface StoredMessage {
  role: 'user' | 'assistant';
  kind: 'text' | 'questions' | 'report';
  content: string;
}

export interface StoredState {
  sessionId: string | null;
  messages: StoredMessage[];
}

const storageKey = (apiKey: string) => `debugbuddy:${apiKey}`;

export function loadState(apiKey: string): StoredState {
  try {
    const raw = window.sessionStorage.getItem(storageKey(apiKey));
    if (!raw) return { sessionId: null, messages: [] };
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
      messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-50) : [],
    };
  } catch {
    return { sessionId: null, messages: [] };
  }
}

export function saveState(apiKey: string, state: StoredState): void {
  try {
    window.sessionStorage.setItem(storageKey(apiKey), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function clearState(apiKey: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(apiKey));
  } catch {
    /* ignore */
  }
}
