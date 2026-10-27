import type { AuthUser } from '../lib/userAuth';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireUser on dashboard routes. Never set on the widget's /api/chat path. */
      user?: AuthUser;
    }
  }
}

export {};
