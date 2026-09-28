#!/usr/bin/env node
/**
 * counterpart-api.cjs — issue ONE authenticated live-API call for COUNTERPART-API flows.
 * Consumes the token written by counterpart-login.cjs (--token file) and calls the
 * app's own live endpoint (--path) — never a direct DB write (manifest §4 doctrine).
 * The API base is the Expo API host (Metro dev: http://<LAN-IP>:8081 per TEST-SETUP.md §4),
 * overridable via --api-base or API_BASE env.
 * Output: response JSON written to --out (plus non-zero exit on non-2xx).
 */
const fs = require('fs');

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
}

const tokenFile = arg('token');
const method = (arg('method', 'POST') || 'POST').toUpperCase();
const path = arg('path');
const body = arg('body', '{}');
const out = arg('out', '/tmp/counterpart-response.json');
const apiBase = (arg('api-base') || process.env.API_BASE || '').replace(/\/$/, '');

if (!tokenFile || !path || !apiBase) {
  console.error('usage: counterpart-api.cjs --token <file> --path <path> [--method POST] [--body JSON] --api-base <url> [--out <file>]');
  process.exit(2);
}

(async () => {
  const { access_token } = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${access_token}`,
      // Idempotency convention (AGENTS.md): deterministic key per counterpart action.
      'Idempotency-Key': `maestro-counterpart-${method}-${path}-${Date.now()}`,
    },
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });
  const text = await res.text();
  fs.writeFileSync(out, text || '{}');
  if (!res.ok) {
    console.error(`counterpart api failed: ${res.status} ${text.slice(0, 500)}`);
    process.exit(1);
  }
  console.log(`counterpart ${method} ${path} → ${res.status}`);
})().catch((e) => { console.error(e); process.exit(1); });
