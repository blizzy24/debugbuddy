import type { Request, Response } from 'express';

const ALLOW_HEADERS = 'content-type, x-api-key';
const ALLOW_METHODS = 'POST, OPTIONS';

/** Open CORS, used for /health and for preflights (a preflight carries no key). */
export function allowAnyOrigin(req: Request, res: Response) {
  const origin = req.get('origin');
  res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);
  res.setHeader('Access-Control-Allow-Methods', ALLOW_METHODS);
  res.setHeader('Access-Control-Max-Age', '600');
}

/** An empty allow-list means "allow everything". */
export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (allowed.length === 0 || !origin) return true;
  const normalised = origin.replace(/\/+$/, '').toLowerCase();
  return allowed.some((entry) => entry.trim().replace(/\/+$/, '').toLowerCase() === normalised);
}

export function revokeCors(res: Response) {
  res.removeHeader('Access-Control-Allow-Origin');
}

/**
 * CORS for the dashboard routes (/api/projects, /api/reports). These are
 * authenticated by a bearer token, not cookies, so a foreign origin gains
 * nothing without the user's token. DASHBOARD_ORIGINS narrows it further.
 */
export function dashboardCors(allowed: string[]) {
  return (req: Request, res: Response, next: () => void) => {
    const origin = req.get('origin');
    if (origin && isOriginAllowed(origin, allowed)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
