/**
 * Reset the two ride-test account passwords to a known canonical value so
 * the Maestro flows (and any dev login) can authenticate reproducibly.
 *
 * Accounts (test, dev Supabase):
 *   rider  +8801613249520   -> test1234
 *   driver +8801700000001   -> test1234
 *
 * Reversible: re-run with a different PASSWORD env to change it. Non-destructive
 * (only updates auth.users.encrypted_password via the admin API).
 *
 * Usage:
 *   npx tsx scripts/reset-test-passwords.ts
 *   PASSWORD=other npx tsx scripts/reset-test-passwords.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Load utils-server/.env (which holds the real SUPABASE_URL + SERVICE_ROLE_KEY).
const envPath = resolve(__dirname, "..", "utils-server", ".env");
for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in utils-server/.env");
  process.exit(1);
}

const TARGET_PASSWORD = process.env.PASSWORD ?? "test1234";
const PHONES = ["+8801613249520", "+8801700000001"] as const;

const admin = createClient(url, key, { auth: { persistSession: false } });

function normalize(p: string) { return p.replace(/^\+/, ""); }

async function resetOne(phoneCanonical: string) {
  const target = normalize(phoneCanonical);
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 400 });
  if (listErr) throw listErr;
  // Supabase auth stores phone without the leading '+', so match on the
  // normalized form. Fall back to exact-with-plus in case any account has it.
  const user =
    list.users.find((u) => normalize(u.phone ?? "") === target) ??
    list.users.find((u) => u.phone === phoneCanonical);
  if (!user) {
    console.error(`[reset] no auth user for ${phoneCanonical}`);
    return false;
  }
  const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
    phone: phoneCanonical,
    password: TARGET_PASSWORD,
  });
  if (updErr) {
    console.error(`[reset] ${phoneCanonical} FAILED:`, updErr.message);
    return false;
  }
  console.log(`[reset] ${phoneCanonical} -> ${TARGET_PASSWORD}  (id=${user.id}, was ${user.phone})`);
  return true;
}

(async () => {
  let ok = true;
  for (const p of PHONES) ok = (await resetOne(p)) && ok;
  process.exit(ok ? 0 : 2);
})();
