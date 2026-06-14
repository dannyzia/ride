import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// `ws` v8's constructor signature doesn't structurally satisfy Supabase's
// WebSocketLikeConstructor (parameter variance). Cast through the expected
// interface — runtime behaviour is unaffected.
const wsTransport = ws as unknown as WebSocketLikeConstructor;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    transport: wsTransport,
  },
});
