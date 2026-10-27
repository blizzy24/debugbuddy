import { DebugBuddyWidget } from './widget';

/**
 * Embed contract:
 *   <script src=".../widget.js" data-debugbuddy-key="db_live_…" data-api-url="https://api…" defer></script>
 *
 * data-api-url is optional and defaults to the origin the script was served from.
 */

const HOST_ID = 'debugbuddy-widget';

function findScript(): HTMLScriptElement | null {
  const current = document.currentScript;
  if (current instanceof HTMLScriptElement && current.dataset.debugbuddyKey !== undefined) return current;
  return document.querySelector<HTMLScriptElement>('script[data-debugbuddy-key]');
}

function resolveApiUrl(script: HTMLScriptElement): string {
  const explicit = script.dataset.apiUrl?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  try {
    return new URL(script.src, window.location.href).origin;
  } catch {
    return window.location.origin;
  }
}

function boot(script: HTMLScriptElement | null) {
  if (document.getElementById(HOST_ID)) return; // already mounted

  const apiKey = script?.dataset.debugbuddyKey?.trim();
  if (!script || !apiKey) {
    console.warn('[DebugBuddy] Missing data-debugbuddy-key on the widget script tag; widget not loaded.');
    return;
  }

  const host = document.createElement('div');
  host.id = HOST_ID;
  document.body.appendChild(host);

  try {
    new DebugBuddyWidget(host, { apiKey, apiUrl: resolveApiUrl(script) });
  } catch (err) {
    host.remove();
    console.warn('[DebugBuddy] Failed to start:', err);
  }
}

// currentScript is only available synchronously, so capture it now and mount when the body exists.
const ownScript = findScript();
if (document.body) {
  boot(ownScript);
} else {
  document.addEventListener('DOMContentLoaded', () => boot(ownScript), { once: true });
}
