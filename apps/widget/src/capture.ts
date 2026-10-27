/**
 * Automatic browser context, attached to the first message of a session.
 *
 * Installed as a side effect of importing this module, which index.ts does
 * before anything else, so the handlers are in place before the widget mounts.
 *
 * KNOWN LIMITATION: the widget script is loaded with `defer`, so it runs after
 * the document has been parsed. Errors, rejections, console errors and failed
 * requests that happen before that are not seen. We do not try to work around this.
 *
 * Privacy: no form values, input contents, storage or cookies are ever read,
 * and no request or response bodies — only methods, URLs and status codes.
 * Sensitive-looking query/fragment parameter values are redacted in every URL.
 *
 * Every wrapper calls the original and returns exactly what it returned. Nothing
 * is blocked, swallowed, or prevented; capture failures are silently ignored.
 */

const BUFFER_SIZE = 10;
const MAX_BLOCK = 2000;
const MAX_ENTRY = 300;
const SENSITIVE_PARAM = /token|key|secret|password|auth|session/i;

interface ErrorEntry {
  at: number;
  text: string;
}

interface NetworkEntry {
  at: number;
  text: string;
}

const errors: ErrorEntry[] = [];
const network: NetworkEntry[] = [];
const ignoredPrefixes: string[] = [];
const listeners = new Set<() => void>();
let seq = 0;

function push<T extends { at: number }>(buffer: T[], entry: T) {
  buffer.push(entry);
  if (buffer.length > BUFFER_SIZE) buffer.shift();
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

function clip(text: string, max = MAX_ENTRY): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

// ------------------------------------------------------------------ redaction

function redactParams(params: string): string {
  return params
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;
      let name = pair.slice(0, eq);
      try {
        name = decodeURIComponent(name.replace(/\+/g, ' '));
      } catch {
        /* keep raw */
      }
      return SENSITIVE_PARAM.test(name) ? `${pair.slice(0, eq)}=[redacted]` : pair;
    })
    .join('&');
}

/** Redacts sensitive query and fragment parameter values. Keeps the names. */
export function redactUrl(url: string): string {
  const hashAt = url.indexOf('#');
  let main = hashAt === -1 ? url : url.slice(0, hashAt);
  let hash = hashAt === -1 ? '' : url.slice(hashAt + 1);
  const queryAt = main.indexOf('?');
  if (queryAt !== -1) main = `${main.slice(0, queryAt)}?${redactParams(main.slice(queryAt + 1))}`;
  // OAuth implicit flows put tokens in the fragment (#access_token=…).
  if (hash.includes('=')) hash = redactParams(hash);
  return hashAt === -1 ? main : `${main}#${hash}`;
}

/** Redacts URLs embedded in free text, such as error messages. */
function redactText(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>)]+/g, (u) => redactUrl(u));
}

/** Same-origin URLs are shown as path + query, like "/api/cart". */
function displayUrl(raw: string): string {
  try {
    const url = new URL(raw, window.location.href);
    const shown = url.origin === window.location.origin ? url.pathname + url.search + url.hash : url.href;
    return clip(redactUrl(shown));
  } catch {
    return clip(redactUrl(raw));
  }
}

function isIgnored(raw: string): boolean {
  try {
    const href = new URL(raw, window.location.href).href;
    return ignoredPrefixes.some((p) => href.startsWith(p));
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ formatting

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function fileLine(file: string | undefined, line: number | undefined): string {
  if (!file) return '';
  return ` (${displayUrl(file)}${line ? `:${line}` : ''})`;
}

// ------------------------------------------------------------------ recorders

function recordError(text: string) {
  push(errors, { at: ++seq, text: clip(redactText(text)) });
}

function recordRequest(method: string, url: string, outcome: number | string) {
  if (isIgnored(url)) return;
  push(network, { at: ++seq, text: `${method.toUpperCase()} ${displayUrl(url)} ${outcome}` });
}

// Not Modified is a cache hit, not a failure.
const failed = (status: number) => (status < 200 || status >= 300) && status !== 304;

// ------------------------------------------------------------------ install

function install() {
  window.addEventListener('error', (event) => {
    try {
      // Bubble-phase listener, so this is a script error, not a resource load failure.
      const where = fileLine(event.filename, event.lineno);
      recordError(`${event.message || describe(event.error)}${where}`);
    } catch {
      /* ignore */
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    try {
      recordError(`Unhandled promise rejection: ${describe(event.reason)}`);
    } catch {
      /* ignore */
    }
  });

  const originalError = console.error;
  console.error = function (this: Console, ...args: unknown[]) {
    try {
      recordError(args.map(describe).join(' '));
    } catch {
      /* ignore */
    }
    return originalError.apply(this, args);
  };

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      // eslint-disable-next-line prefer-rest-params
      const result = originalFetch.apply(this, arguments as unknown as Parameters<typeof fetch>);
      try {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
        // A side branch: the caller still gets `result` itself, so nothing is swallowed.
        result.then(
          (res) => {
            if (res.type !== 'opaque' && failed(res.status)) recordRequest(method, url, res.status);
          },
          (err: unknown) => {
            if (!(err instanceof DOMException && err.name === 'AbortError')) recordRequest(method, url, 'network error');
          },
        );
      } catch {
        /* ignore */
      }
      return result;
    } as typeof fetch;
  }

  if (typeof XMLHttpRequest === 'function') {
    const requests = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
    const proto = XMLHttpRequest.prototype;
    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = function (this: XMLHttpRequest, method: string, url: string | URL) {
      try {
        requests.set(this, { method: String(method), url: String(url) });
      } catch {
        /* ignore */
      }
      // eslint-disable-next-line prefer-rest-params
      return originalOpen.apply(this, arguments as unknown as Parameters<typeof originalOpen>);
    } as typeof proto.open;

    proto.send = function (this: XMLHttpRequest) {
      try {
        const info = requests.get(this);
        if (info) {
          this.addEventListener('load', () => {
            if (failed(this.status)) recordRequest(info.method, info.url, this.status);
          });
          this.addEventListener('error', () => recordRequest(info.method, info.url, 'network error'));
          this.addEventListener('timeout', () => recordRequest(info.method, info.url, 'timed out'));
        }
      } catch {
        /* ignore */
      }
      // eslint-disable-next-line prefer-rest-params
      return originalSend.apply(this, arguments as unknown as Parameters<typeof originalSend>);
    };
  }
}

try {
  install();
} catch {
  // Never let capture stop the widget (or the page) from working.
}

// ------------------------------------------------------------------ public API

/** Don't record the widget's own requests, e.g. to its API. */
export function ignoreRequestsTo(prefix: string) {
  ignoredPrefixes.push(prefix);
}

/** Called whenever a new error or failed request is recorded. Returns an unsubscribe. */
export function onCaptureChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function browserSummary(ua: string): string {
  const version = (re: RegExp) => re.exec(ua)?.[1]?.split('.')[0] ?? '';
  let browser = '';
  if (/Edg(e|A|iOS)?\//.test(ua)) browser = `Edge ${version(/Edg(?:e|A|iOS)?\/([\d.]+)/)}`;
  else if (/OPR\//.test(ua)) browser = `Opera ${version(/OPR\/([\d.]+)/)}`;
  else if (/SamsungBrowser\//.test(ua)) browser = `Samsung Internet ${version(/SamsungBrowser\/([\d.]+)/)}`;
  else if (/(Firefox|FxiOS)\//.test(ua)) browser = `Firefox ${version(/(?:Firefox|FxiOS)\/([\d.]+)/)}`;
  else if (/(Chrome|CriOS)\//.test(ua)) browser = `Chrome ${version(/(?:Chrome|CriOS)\/([\d.]+)/)}`;
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = `Safari ${version(/Version\/([\d.]+)/)}`;

  let os = '';
  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  if (browser && os) return `${browser.trim()} on ${os}`;
  return browser.trim() || os || 'Unknown browser';
}

function section(title: string, entries: { text: string }[]): string[] {
  return entries.length ? [`- ${title}:`, ...entries.map((e) => `  - ${e.text}`)] : [];
}

/**
 * The exact text appended to the first message, or '' if nothing was captured.
 * Capped at 2000 characters (or `limit`, if smaller); the oldest error/network
 * entries are dropped first. If even the basics don't fit, returns ''.
 */
export function buildContextBlock(limit = MAX_BLOCK, now = new Date()): string {
  const max = Math.min(limit, MAX_BLOCK);
  const lines: string[] = [];
  const add = (label: string, value: string | undefined | null) => {
    const v = value?.trim();
    if (v) lines.push(`- ${label}: ${clip(v)}`);
  };

  try {
    add('Page', redactUrl(window.location.href));
    add('Title', document.title);
    if (document.referrer) add('Referrer', redactUrl(document.referrer));
    add('Browser', browserSummary(navigator.userAgent));
    add('User agent', navigator.userAgent);
    add('Viewport', `${window.innerWidth}x${window.innerHeight}`);
    if (window.screen) add('Screen', `${window.screen.width}x${window.screen.height}`);
    add('Language', navigator.language);
    try {
      add('Timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      /* ignore */
    }
    if (typeof navigator.onLine === 'boolean') add('Online', navigator.onLine ? 'yes' : 'no');
  } catch {
    /* partial context is fine */
  }

  let errs = errors.slice();
  let reqs = network.slice();

  const render = () => {
    const body = [...lines, ...section('Console errors', errs), ...section('Failed network requests', reqs)];
    if (!body.length) return '';
    return ['', '', '---', 'Technical context captured automatically by DebugBuddy:', ...body, `- Time: ${now.toISOString()}`].join('\n');
  };

  let block = render();
  while (block.length > max && (errs.length || reqs.length)) {
    // Drop whichever entry is oldest overall.
    const oldestErr = errs[0]?.at ?? Infinity;
    const oldestReq = reqs[0]?.at ?? Infinity;
    if (oldestErr < oldestReq) errs = errs.slice(1);
    else reqs = reqs.slice(1);
    block = render();
  }
  return block.length > max ? '' : block;
}
