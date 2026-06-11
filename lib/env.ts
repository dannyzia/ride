import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  WEBSOCKET_INTERNAL_SECRET: z.string().min(32),
  PORTPOS_APP_KEY: z.string().min(1),
  PORTPOS_SECRET_KEY: z.string().min(1),
  PORTPOS_BASE_URL: z.string().url(),
  PORTPOS_CALLBACK_URL: z.string().url(),
  BARIKOI_API_KEY: z.string().min(1),
});

const utilsServerEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  WEBSOCKET_INTERNAL_SECRET: z.string().min(32),
  INSTANCE_COUNT: z.literal("1"),
  BARIKOI_API_KEY: z.string().min(1).optional(),
});

export function validateServerEnv() {
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`[env] Missing or invalid env vars: ${missing}`);
  }
  return result.data;
}

export function validateUtilsServerEnv() {
  const result = utilsServerEnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`[env] Missing or invalid env vars: ${missing}`);
  }
  return result.data;
}
