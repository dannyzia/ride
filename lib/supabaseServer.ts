import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/**
 * Server-side Supabase client (service-role key, no realtime transport).
 *
 * The `ws` package was previously imported here to provide a Node-native
 * WebSocket transport for server-side realtime subscriptions. That import
 * leaked `ws` into the Metro client bundle via the transitive import chain:
 *   app/api/* → lib/auth.ts → lib/supabaseServer.ts → ws
 *
 * Removed because:
 * 1. supabaseAdmin is never used for realtime (verified: zero .channel/.on calls)
 * 2. Realtime is handled by utils-server/ which has its own ws import
 * 3. The ws import caused Metro UnableToResolveError on the client bundle
 *
 * If server-side realtime via supabaseAdmin is ever needed, use a dynamic
 * require('ws') in the calling code — do NOT re-add the top-level import.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
