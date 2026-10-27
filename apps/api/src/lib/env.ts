import 'dotenv/config';
import { z } from 'zod';

const KEYGEN = `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  N8N_WEBHOOK_URL: z.string().url(),
  N8N_WEBHOOK_AUTH_HEADER: z.string().min(1).optional(),
  N8N_WEBHOOK_AUTH_VALUE: z.string().min(1).optional(),
  // AES-256-GCM key for Jira API tokens at rest. Required: there is no default, on purpose.
  ENCRYPTION_KEY: z
    .string({ required_error: `is missing. Generate one with:  ${KEYGEN}` })
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, `must be exactly 64 hex characters (32 bytes). Generate one with:  ${KEYGEN}`),
  // Optional comma-separated list of dashboard origins allowed to call the dashboard endpoints.
  DASHBOARD_ORIGINS: z
    .string()
    .optional()
    .transform((v) => (v ?? '').split(',').map((o) => o.trim()).filter(Boolean)),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Invalid environment. Copy apps/api/.env.example to apps/api/.env and fill it in.\n${missing}`);
  process.exit(1);
}

export const env = parsed.data;
