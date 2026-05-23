import { z } from 'zod';

const serverEnvSchema = z.object({
  DATABASE_URL:                z.string().url().optional(),
  FIREBASE_CLIENT_EMAIL:       z.string().email().optional(),
  FIREBASE_PRIVATE_KEY:        z.string().min(10).optional(),
  FIREBASE_PROJECT_ID:         z.string().min(1).optional(),
  FUNCTIONS_JWT_SECRET:        z.string().min(32).optional(),
  BKASH_APP_KEY:               z.string().min(1).optional(),
  BKASH_APP_SECRET:            z.string().min(1).optional(),
  BKASH_USERNAME:              z.string().min(1).optional(),
  BKASH_PASSWORD:              z.string().min(1).optional(),
  BKASH_BASE_URL:              z.string().url().optional(),
  GOOGLE_MAPS_SERVER_API_KEY:  z.string().min(1).optional(),
});

export function validateServerEnv() {
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map(i => i.path.join('.')).join(', ');
    throw new Error(`[env] Missing or invalid env vars: ${missing}`);
  }
  return result.data;
}
