import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { allowAnyOrigin, dashboardCors } from './lib/cors';
import { env } from './lib/env';
import { ApiError, errorBody } from './lib/errors';
import { requireUser } from './lib/userAuth';
import { chatRouter } from './routes/chat';
import { projectJiraRouter, reportJiraRouter } from './routes/jira';

const app = express();
app.disable('x-powered-by');

// Reflect CORS before body parsing so even malformed-body errors are readable by the widget.
// The chat route narrows this to the project's allowed_origins once the key is known.
app.use('/api/chat', (req, res, next) => {
  allowAnyOrigin(req, res);
  next();
});
app.use(express.json({ limit: '64kb' }));

app.get('/health', (req, res) => {
  allowAnyOrigin(req, res);
  res.status(200).json({ status: 'ok' });
});

// Widget path: public API key (x-api-key), checked inside the route.
app.use('/api/chat', chatRouter);

// Dashboard path: Supabase user token (Authorization: Bearer). Kept apart from
// the widget path on purpose; see lib/userAuth.ts.
const dashboard = dashboardCors(env.DASHBOARD_ORIGINS);
app.use('/api/projects', dashboard, requireUser, projectJiraRouter);
app.use('/api/reports', dashboard, requireUser, reportJiraRouter);

app.use((_req, res) => {
  res.status(404).json(errorBody('not_found', 'Not found.'));
});

// Every error leaves as { error: { code, message } }. Stack traces stay in the server log.
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof ApiError) {
    res.status(err.status).json(errorBody(err.code, err.message));
    return;
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
    res.status(400).json(errorBody('invalid_request', message));
    return;
  }
  if (typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.parse.failed') {
    res.status(400).json(errorBody('invalid_json', 'Request body is not valid JSON.'));
    return;
  }
  if (typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.too.large') {
    res.status(413).json(errorBody('payload_too_large', 'Request body is too large.'));
    return;
  }
  console.error('[api] unhandled error:', err);
  res.status(500).json(errorBody('internal_error', 'Something went wrong.'));
});

app.listen(env.PORT, () => {
  console.log(`DebugBuddy API listening on http://localhost:${env.PORT}`);
});
