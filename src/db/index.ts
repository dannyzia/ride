import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Supabase pooler is in ap-northeast-1 (Tokyo). A cold connect from BD can
// take ~5.8s under jitter (measured), so connect_timeout must be well above
// that — 30s is safe (healthy connects complete in ~1.5s). max is kept small
// because the session-mode pooler (port 5432) caps total connections at ~15
// across ALL clients: with 2 long-running processes (Metro API + utils-server)
// each holding `max` connections, 2*max must stay well under 15, so max=5.
// (Switching DATABASE_URL to the transaction-mode pooler on port 6543 lifts
// this ceiling entirely — then max can be raised. prepare:false is required
// for transaction mode and is already set.)
const client = postgres(DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 5,
  idle_timeout: 30,
  connect_timeout: 30,
});

export const db = drizzle(client, { schema });
