import { createClient } from "@supabase/supabase-js";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import ws from "ws";

// Library typing gap, not a runtime incompatibility: @types/ws v8 declares a
// second `constructor(address: null, …)` overload (server-stream mode), and TS
// selects it for assignability checks, hiding the primary
// `constructor(address: string | URL, protocols?: …)` overload that
// realtime-js actually invokes. Narrow to the constructor shape realtime-js
// expects. Remove if @types/ws fixes overload ordering.
const wsTransport = ws as unknown as WebSocketLikeConstructor;

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/**
 * Server-side Supabase client (service-role key).
 *
 * 2026-08-29: Node 20 has no native WebSocket, so supabase-js' RealtimeClient
 * (constructed unconditionally by createClient) throws on import. We pass
 * `ws` as the realtime transport so it works on Node 20. This file is only
 * required from server contexts (app/api route files ending in +api.ts,
 * admin layout type-only), so importing `ws` here does not leak into the
 * Android client bundle (verified by the §3 guard grep).
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    transport: wsTransport,
  },
});
