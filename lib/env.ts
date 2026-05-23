import { z } from 'zod';

const serverEnvSchema = z.object({
  DATABASE_URL:                z.string().url(),
  FIREBASE_CLIENT_EMAIL:       z.string().email(),
  FIREBASE_PRIVATE_KEY:        z.string().min(100),
  FIREBASE_PROJECT_ID:         z.string().min(1),
  FUNCTIONS_JWT_SECRET:        z.string().min(32),
  WEBSOCKET_INTERNAL_SECRET:    z.string().min(32),
  BKASH_APP_KEY:               z.string().min(1),
  BKASH_APP_SECRET:            z.string().min(1),
  BKASH_USERNAME:              z.string().min(1),
  BKASH_PASSWORD:              z.string().min(1),
  BKASH_BASE_URL:              z.string().url(),
  BARIKOI_API_KEY:             z.string().min(1),
});

const utilsServerEnvSchema = z.object({
  DATABASE_URL:                z.string().url(),
  FIREBASE_PROJECT_ID:         z.string().min(1),
  FIREBASE_CLIENT_EMAIL:       z.string().email(),
  FIREBASE_PRIVATE_KEY:        z.string().min(100),
  WEBSOCKET_INTERNAL_SECRET:    z.string().min(32),
  INSTANCE_COUNT:              z.literal('1'),
});

export function validateServerEnv() {
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map(i => i.path.join('.')).join(', ');
    throw new Error(`[env] Missing or invalid env vars: ${missing}`);
  }
  return result.data;
}

export function validateUtilsServerEnv() {
  const result = utilsServerEnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map(i => i.path.join('.')).join(', ');
    throw new Error(`[env] Missing or invalid env vars: ${missing}`);
  }
  return result.data;
}
