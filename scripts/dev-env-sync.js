#!/usr/bin/env node
/**
 * dev-env-sync.js — Sync .env.local dev IPs to the machine's CURRENT LAN IP.
 *
 * WHY: the laptop IP differs between networks (broadband WiFi vs mobile
 * hotspot). EXPO_PUBLIC_* values are inlined into the JS bundle at Metro
 * start, so a stale IP breaks every device API call (app hangs at splash /
 * Retry). Run this BEFORE `npx expo start` — see TEST-SETUP.md (repo root).
 *
 * Usage:
 *   node scripts/dev-env-sync.js            # patch .env.local to current IP
 *   node scripts/dev-env-sync.js --check    # exit 1 if drift (no writes) — CI/agent gate
 *   node scripts/dev-env-sync.js --ip A.B.C.D  # manual override (no detection)
 *
 * Safety: EXPO_PUBLIC_SERVER_URL / EXPO_PUBLIC_WEB_SOCKET_SERVER_URL are only
 * rewritten when their current value is a DEV-shaped URL (http://<host>:8081 /
 * ws://<host>:3001, host = IP or localhost). Intentional prod domains
 * (https://... / wss://...) are never touched.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", ".env.local");

// ── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const CHECK_ONLY = args.includes("--check");
const ipFlagIdx = args.indexOf("--ip");
const MANUAL_IP = ipFlagIdx !== -1 ? args[ipFlagIdx + 1] : null;

// ── LAN IP detection ────────────────────────────────────────────────────────
function detectLanIp() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs || []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      if (addr.address.startsWith("169.254.")) continue; // link-local / unplugged Ethernet
      candidates.push({ name: name.toLowerCase(), ip: addr.address });
    }
  }
  if (candidates.length === 0) return null;
  // Prefer Wi-Fi adapters (the phone and laptop share the Wi-Fi network).
  const wifi = candidates.find((c) => /wi-?fi|wlan/.test(c.name));
  return (wifi || candidates[0]).ip;
}

function isValidIp(s) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(s || "");
}

const NEW_IP = MANUAL_IP || detectLanIp();
if (!isValidIp(NEW_IP)) {
  console.error(`[dev-env-sync] no usable LAN IPv4 found (pass --ip A.B.C.D). Candidates scanned via os.networkInterfaces().`);
  process.exit(1);
}

// ── .env.local patching ─────────────────────────────────────────────────────
if (!fs.existsSync(ENV_PATH)) {
  console.error(`[dev-env-sync] ${ENV_PATH} not found`);
  process.exit(1);
}
const raw = fs.readFileSync(ENV_PATH, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);

const isDevHttpApi = (v) => /^http:\/\/(localhost|(\d{1,3}\.){3}\d{1,3}):8081$/.test(v);
const isDevWs = (v) => /^ws:\/\/(localhost|(\d{1,3}\.){3}\d{1,3}):3001$/.test(v);

const changes = [];
const setKey = (key, value, guard) => {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(new RegExp(`^${key}=(.*)$`));
    if (!m) continue;
    const current = m[1].trim();
    if (guard && !guard(current)) return; // dev-shaped guard failed → leave alone
    if (current === value) return; // already correct
    lines[i] = `${key}=${value}`;
    changes.push(`${key}: ${current || "(empty)"} → ${value}`);
    return;
  }
  // Key not present (e.g. first run after cleanup) → append before first blank/comments at end.
  lines.push(`${key}=${value}`);
  changes.push(`${key}: (absent) → ${value}`);
};

setKey("EXPO_PUBLIC_DEV_LAN_IP", NEW_IP);
setKey("DEV_LAN_IP", NEW_IP);
setKey("EXPO_PUBLIC_SERVER_URL", `http://${NEW_IP}:8081`, isDevHttpApi);
setKey("EXPO_PUBLIC_WEB_SOCKET_SERVER_URL", `ws://${NEW_IP}:3001`, isDevWs);

if (changes.length === 0) {
  console.log(`[dev-env-sync] OK — .env.local already synced to ${NEW_IP}. Nothing to do.`);
  process.exit(0);
}
if (CHECK_ONLY) {
  console.error(`[dev-env-sync] DRIFT detected (current LAN IP: ${NEW_IP}):\n  ${changes.join("\n  ")}`);
  console.error(`[dev-env-sync] run \`node scripts/dev-env-sync.js\`, then restart Metro (env is inlined at bundle time).`);
  process.exit(1);
}
fs.writeFileSync(ENV_PATH, lines.join(eol), "utf8");
console.log(`[dev-env-sync] patched .env.local → ${NEW_IP}`);
for (const c of changes) console.log(`  ${c}`);
console.log(`[dev-env-sync] NEXT: restart Metro so the new EXPO_PUBLIC_* values are inlined into the bundle.`);
