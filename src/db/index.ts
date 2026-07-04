import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Supabase pooler is in ap-northeast-1 (Tokyo). A cold connect from BD can
// take ~5.8s under jitter (measured), so connect_timeout must be well above
// that — 30s is safe (healthy connects complete in ~1.5s). max and
// idle_timeout are kept generous to avoid reconnect churn (every reconnect =
// fresh TLS+auth handshake to a distant region). No max_lifetime: a short
// lifetime (the prior 60s) forces constant reconnects to Tokyo and amplifies
// the chance of hitting the connect timeout.
const client = postgres(DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 10,
  idle_timeout: 30,
  connect_timeout: 30,
});

export const db = drizzle(client, { schema });
