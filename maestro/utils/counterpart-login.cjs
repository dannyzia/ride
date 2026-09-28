#!/usr/bin/env node
/**
 * counterpart-login.cjs — real Supabase auth login for COUNTERPART-API flows.
 * TWO-SIDED PATTERN (maestro/COVERAGE-MANIFEST.md §4): the counterpart account logs
 * in through the LIVE Supabase auth endpoint — no DB writes, no token forgery.
 * Output: JSON { access_token, refresh_token, user_id } written to --out.
 * Env/args: --phone +880XXXXXXXXXX --password test1234 [--api-base override]
 * Server vars come from .env.local when --api-base is omitted (SUPABASE_URL is
 * cloud — TEST-SETUP.md §4 — so login works regardless of the laptop IP).
 */
const fs = require('fs');

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
}

const phone = arg('phone');
const password = arg('password');
const out = arg('out', '/tmp/counterpart-token.json');
// Strip country-code prefix for OTP-style identities if the API expects local form.
const apiBase = arg('api-base', process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL);

if (!phone || !password || !apiBase) {
  console.error('usage: counterpart-login.cjs --phone <phone> --password <pw> [--api-base <supabase url>] [--out <file>]');
  process.exit(2);
}

(async () => {
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
    },
    body: JSON.stringify({ phone, password }),
  });
  if (!res.ok) {
    console.error(`counterpart login failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const json = await res.json();
  fs.writeFileSync(out, JSON.stringify({ access_token: json.access_token, refresh_token: json.refresh_token, user_id: json.user?.id ?? null }));
  console.log(`counterpart token written to ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
