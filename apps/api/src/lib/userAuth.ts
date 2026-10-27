import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ApiError } from './errors';
import { supabase } from './supabase';

/**
 * Dashboard authentication: the signed-in user's Supabase access token, sent as
 * `Authorization: Bearer <token>`.
 *
 * Deliberately separate from the widget's x-api-key path (lib/auth.ts). An API
 * key identifies a *project* and is public; a bearer token identifies a *person*
 * and is secret. No route accepts both, so a leaked widget key can never reach
 * a dashboard endpoint and a user token is never needed on a customer's site.
 */

export interface AuthUser {
  id: string;
  email: string | null;
}

export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '');
    if (!match?.[1]) throw new ApiError(401, 'not_authenticated', 'Sign in to continue.');

    const { data, error } = await supabase.auth.getUser(match[1]);
    if (error || !data.user) {
      // Only a 4xx from Supabase means "bad token". Network failures and 5xx are our problem, not the user's.
      const status = error?.status;
      if (error && !(status !== undefined && status >= 400 && status < 500)) {
        throw new Error(`Supabase auth unavailable (${error.name}${status ? ` ${status}` : ''})`);
      }
      throw new ApiError(401, 'invalid_session', 'Your session has expired. Sign in again.');
    }

    req.user = { id: data.user.id, email: data.user.email ?? null };
    next();
  } catch (err) {
    next(err);
  }
}

const uuid = z.string().uuid();

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new ApiError(401, 'not_authenticated', 'Sign in to continue.');
  return req.user;
}

/** 404 when the project doesn't exist, 403 when it belongs to someone else. */
export async function assertProjectOwner(projectId: string, user: AuthUser): Promise<void> {
  if (!uuid.safeParse(projectId).success) throw new ApiError(404, 'project_not_found', 'Project not found.');
  const { data, error } = await supabase.from('projects').select('owner_id').eq('id', projectId).maybeSingle<{ owner_id: string }>();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'project_not_found', 'Project not found.');
  if (data.owner_id !== user.id) throw new ApiError(403, 'project_forbidden', 'You don’t have access to this project.');
}
