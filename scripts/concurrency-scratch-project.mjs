#!/usr/bin/env node
/**
 * concurrency-scratch-project.mjs — provision a throwaway Supabase project for
 * the tests/concurrency scratch databases.
 *
 * Purpose:     Create (or reuse) a dedicated disposable Supabase project so the
 *              concurrency harnesses stop creating/dropping scratch databases
 *              and schemas on the SHARED dev project. Writes the pooled
 *              connection URL to the gitignored `.env.scratch.local`.
 * Owner:       Coding model (test lane)
 * Status:      ACTIVE
 * Source of truth: this file + the Supabase Management API OpenAPI spec
 *              (https://api.supabase.com/api/v1-json) — every endpoint shape
 *              below was read from that spec on 2026-10-04.
 * Related (concrete paths):
 *   - tests/concurrency/*.test.ts — harnesses that create/drop scratch DBs
 *   - tests/meta/concurrency-gate.test.ts — default-suite skip gate
 *   - .github/workflows/ci.yml (`concurrency-locks`) — CI's equivalent, a local
 *     postgres:16 service container; this script is the LOCAL-run equivalent
 *   - scripts/_load-env.ts — how the harnesses read DATABASE_URL
 *   - drizzle.config.js — derives the session-mode URL from DATABASE_URL
 * Last verified: 2026-10-04 — create → reuse → delete cycle exercised against a
 *              local stub of the Management API; no real project was
 *              provisioned, so the first real run is unproven.
 * How to update: keep the request/response shapes aligned with the OpenAPI spec
 *              above; add new scratch consumers to Related.
 *
 * WHY a dedicated project: the M-3 (launch-free lock) and U-4
 * (activateSubscription lock) harnesses DROP/CREATE DATABASES, and the promo
 * harnesses create/drop a SCHEMA. Pointing DATABASE_URL at the shared dev
 * project does that on the same cluster the app and dev server use. A throwaway
 * project isolates all of it — and can be deleted when done.
 *
 * USAGE (bash; PowerShell: run the 3 commands with $env:DATABASE_URL set instead)
 *   node scripts/concurrency-scratch-project.mjs                # create/reuse
 *   set -a; . ./.env.scratch.local; set +a   # export SCRATCH_DATABASE_URL (+ DATABASE_URL)
 *   npx drizzle-kit push --force                                # build the app schema
 *   RUN_CONCURRENCY_TESTS=1 npx jest tests/concurrency --watchAll=false
 *   node scripts/concurrency-scratch-project.mjs --delete --yes # tear down
 *
 * CREDENTIALS (never committed; `.env.scratch.local` is gitignored)
 *   SUPABASE_ACCESS_TOKEN  — personal access token with `projects:write`:
 *                            https://supabase.com/dashboard/account/tokens
 *                            (read from the process env, else from .env.local)
 *   SUPABASE_ORG_SLUG      — optional; when unset the slug is auto-detected if
 *                            the token can see exactly one organization
 *
 * Flags:
 *   --delete              delete the throwaway project (requires --yes)
 *   --yes                 confirm the irreversible delete
 *   --name <name>         project name (default: ride-scratch)
 *   --org <slug>          organization slug (default: SUPABASE_ORG_SLUG / auto)
 *   --region <code>       region for NEW projects (default: ap-southeast-1)
 *   --db-pass <pass>      password to use/create or to supply on reuse
 *   --dry-run             print the planned API calls; makes NO network calls
 *   --help                this text
 *
 * Exit codes: 0 ok · 1 any failure (bad args, missing token, API error, timeout)
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH_ENV_PATH = path.join(ROOT, ".env.scratch.local");
const ENV_LOCAL_PATH = path.join(ROOT, ".env.local");
const API_BASE = (
  process.env.SUPABASE_MANAGEMENT_API_BASE || "https://api.supabase.com/v1"
).replace(/\/+$/, "");

const DEFAULT_PROJECT_NAME = "ride-scratch";
/** Repo's documented production region (AGENTS.md env reference); override with --region. */
const DEFAULT_REGION = "ap-southeast-1";
const POLL_MS = 5000;
const CREATE_TIMEOUT_MS = 15 * 60 * 1000;
const POOLER_TIMEOUT_MS = 2 * 60 * 1000;

// ── args ─────────────────────────────────────────────────────────────────────
const VALUE_FLAGS = { "--name": "name", "--org": "org", "--region": "region", "--db-pass": "dbPass" };
const BOOL_FLAGS = { "--delete": "delete", "--yes": "yes", "--dry-run": "dryRun", "--help": "help" };

function parseArgs(argv) {
  const out = { name: DEFAULT_PROJECT_NAME, region: DEFAULT_REGION, dbPass: null, delete: false, yes: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (BOOL_FLAGS[arg]) {
      out[BOOL_FLAGS[arg]] = true;
      continue;
    }
    if (VALUE_FLAGS[arg]) {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) fail(`missing value for ${arg}`);
      out[VALUE_FLAGS[arg]] = value;
      i++;
      continue;
    }
    fail(`unknown argument: ${arg} (try --help)`);
  }
  return out;
}

// ── logging / env files ──────────────────────────────────────────────────────
function log(msg) {
  console.log(`[scratch-project] ${msg}`);
}
function fail(msg) {
  console.error(`[scratch-project] ERROR: ${msg}`);
  process.exit(1);
}
function parseKeyVals(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
function readEnvLocal() {
  return fs.existsSync(ENV_LOCAL_PATH) ? parseKeyVals(fs.readFileSync(ENV_LOCAL_PATH, "utf8")) : {};
}
function readScratchEnv() {
  if (!fs.existsSync(SCRATCH_ENV_PATH)) return null;
  const parsed = parseKeyVals(fs.readFileSync(SCRATCH_ENV_PATH, "utf8"));
  if (!parsed.SCRATCH_PROJECT_REF) return null;
  return { ref: parsed.SCRATCH_PROJECT_REF, name: parsed.SCRATCH_PROJECT_NAME ?? null, dbPass: parsed.SCRATCH_DB_PASS ?? null };
}
function maskUrl(url) {
  return url.replace(/:\/\/([^:@/]+):[^@]+@/, "://$1:****@");
}

// ── Management API client ────────────────────────────────────────────────────
async function api(method, route, body) {
  if (!ACCESS_TOKEN) {
    fail(
      "SUPABASE_ACCESS_TOKEN is not set (process env or .env.local). Create a personal " +
        "access token with the projects:write scope at https://supabase.com/dashboard/account/tokens",
    );
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${route}`, {
      method,
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    fail(`${method} ${route} could not reach ${API_BASE}: ${e.message}`);
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON error body — keep the raw text for the message below.
  }
  if (!res.ok) {
    const detail = (json ? JSON.stringify(json) : text).slice(0, 400);
    const err = new Error(`${method} ${route} → HTTP ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// ── project operations ───────────────────────────────────────────────────────
async function resolveOrgSlug() {
  if (ORG_SLUG) return ORG_SLUG;
  const orgs = await api("GET", "/organizations");
  if (!Array.isArray(orgs) || orgs.length === 0) fail("this token sees no organizations");
  if (orgs.length === 1) {
    log(`organization auto-detected: ${orgs[0].slug}`);
    return orgs[0].slug;
  }
  fail(`multiple organizations visible (${orgs.map((o) => o.slug).join(", ")}) — pass --org <slug>`);
}

async function findProjectByName() {
  const projects = await api("GET", "/projects");
  let matches = (projects ?? []).filter((p) => p.name === PROJECT_NAME);
  if (ORG_SLUG) matches = matches.filter((p) => p.organization_slug === ORG_SLUG);
  if (matches.length > 1) {
    fail(
      `multiple projects named "${PROJECT_NAME}": ${matches
        .map((m) => `${m.ref} (org ${m.organization_slug})`)
        .join(", ")} — pass --org to disambiguate`,
    );
  }
  return matches[0] ?? null;
}

async function waitForHealthy(ref) {
  const startedAt = Date.now();
  let lastStatus = null;
  for (;;) {
    const project = await api("GET", `/projects/${ref}`);
    if (project.status !== lastStatus) {
      log(`status: ${project.status}`);
      lastStatus = project.status;
    }
    if (project.status === "ACTIVE_HEALTHY") return project;
    if (["INIT_FAILED", "RESTORE_FAILED", "REMOVED"].includes(project.status)) {
      fail(`project ${ref} entered ${project.status} — inspect it in the Supabase dashboard`);
    }
    if (project.status === "INACTIVE") {
      fail(`project ${ref} is PAUSED (free-tier idle) — restore it in the dashboard, or --delete --yes and re-create`);
    }
    if (Date.now() - startedAt > CREATE_TIMEOUT_MS) {
      fail(`timed out after ${CREATE_TIMEOUT_MS / 60000} min waiting for ${ref} to become ACTIVE_HEALTHY (last: ${project.status})`);
    }
    await delay(POLL_MS);
  }
}

/**
 * The pooler config can lag the project becoming healthy, so this retries.
 * The transaction pooler (6543) is the same shape the dev DATABASE_URL uses and
 * is what the harnesses are proven against; drizzle.config.js derives the
 * session-mode URL (5432) from it by string surgery for `drizzle-kit push`.
 */
async function resolvePoolerUrl(ref, pass) {
  const deadline = Date.now() + POOLER_TIMEOUT_MS;
  for (;;) {
    const rows = await api("GET", `/projects/${ref}/config/database/pooler`);
    const primary = (rows ?? []).filter((r) => r.database_type === "PRIMARY");
    const tx = primary.find((r) => r.pool_mode === "transaction") ?? primary[0];
    if (tx?.db_user && tx?.db_host) {
      return `postgresql://${tx.db_user}:${encodeURIComponent(pass)}@${tx.db_host}:${tx.db_port}/${tx.db_name}`;
    }
    if (Date.now() > deadline) fail(`no PRIMARY pooler entry for ${ref} after ${POOLER_TIMEOUT_MS / 1000}s`);
    await delay(POLL_MS);
  }
}

function writeScratchEnv(project, pass, url) {
  const lines = [
    "# Throwaway Supabase project for tests/concurrency scratch databases.",
    "# Generated by scripts/concurrency-scratch-project.mjs — gitignored, never commit.",
    `# project: ${project.name} (${project.ref}) | region: ${project.region} | created: ${project.created_at}`,
    `SCRATCH_PROJECT_NAME=${project.name}`,
    `SCRATCH_PROJECT_REF=${project.ref}`,
    `SCRATCH_PROJECT_REGION=${project.region}`,
    `SCRATCH_DB_PASS=${pass}`,
    `SCRATCH_DATABASE_URL=${url}`,
    // Kept for `npx drizzle-kit push` only (drizzle.config.js derives from
    // DATABASE_URL); the concurrency harnesses use SCRATCH_DATABASE_URL and
    // refuse to run without it (tests/concurrency/scratch-db-url.ts).
    `DATABASE_URL=${url}`,
    "",
  ];
  fs.writeFileSync(SCRATCH_ENV_PATH, lines.join("\n"), { encoding: "utf8", mode: 0o600 });
  log(`wrote ${path.relative(process.cwd(), SCRATCH_ENV_PATH)} → SCRATCH_DATABASE_URL=${maskUrl(url)}`);
}

function printNextSteps() {
  const rel = "./" + path.relative(ROOT, SCRATCH_ENV_PATH).split(path.sep).join("/");
  log("NEXT (bash):");
  log(`  1. set -a; . ${rel}; set +a     # exports SCRATCH_DATABASE_URL (+ DATABASE_URL)`);
  log("  2. npx drizzle-kit push --force  # build the app schema in the scratch project");
  log("  3. RUN_CONCURRENCY_TESTS=1 npx jest tests/concurrency --watchAll=false");
  log("  Tear down when done: node scripts/concurrency-scratch-project.mjs --delete --yes");
}

// ── commands ─────────────────────────────────────────────────────────────────
async function cmdCreate() {
  if (flags.dryRun) {
    const orgShown = ORG_SLUG ?? "(auto-detected via GET /organizations)";
    const body = {
      name: PROJECT_NAME,
      db_pass: flags.dbPass ? "(from --db-pass)" : "(generated, 24 random chars)",
      organization_slug: ORG_SLUG ?? "(resolved first)",
      region_selection: { type: "specific", code: REGION },
    };
    log("DRY RUN — no API calls will be made");
    log(`  GET  ${API_BASE}/organizations                          # unless org resolved (now: ${orgShown})`);
    log(`  GET  ${API_BASE}/projects                                # reuse check: name=${PROJECT_NAME}`);
    log(`  POST ${API_BASE}/projects                                # only when absent`);
    log(`       body: ${JSON.stringify(body)}`);
    log(`  GET  ${API_BASE}/projects/{ref}                          # poll 5s until ACTIVE_HEALTHY (15 min cap)`);
    log(`  GET  ${API_BASE}/projects/{ref}/config/database/pooler  # transaction pooler URL`);
    log(`  write ${path.relative(process.cwd(), SCRATCH_ENV_PATH)}`);
    return;
  }

  const existing = await findProjectByName();
  const stored = readScratchEnv();
  let project;
  let dbPass;

  if (existing) {
    dbPass = flags.dbPass ?? (stored && stored.ref === existing.ref ? stored.dbPass : null);
    if (!dbPass) {
      fail(
        `project "${PROJECT_NAME}" (${existing.ref}) already exists but its password is unknown — ` +
          `pass --db-pass, or remove it with --delete --yes and re-run`,
      );
    }
    log(`reusing existing project ${existing.ref} (status: ${existing.status})`);
    project = await waitForHealthy(existing.ref);
  } else {
    const org = await resolveOrgSlug();
    dbPass = flags.dbPass ?? generateDbPass();
    const body = {
      name: PROJECT_NAME,
      db_pass: dbPass,
      organization_slug: org,
      region_selection: { type: "specific", code: REGION },
    };
    log(`creating "${PROJECT_NAME}" in org "${org}", region ${REGION} — this takes a few minutes`);
    const created = await api("POST", "/projects", body);
    log(`created: ref=${created.ref}`);
    project = await waitForHealthy(created.ref);
  }

  const url = await resolvePoolerUrl(project.ref, dbPass);
  writeScratchEnv(project, dbPass, url);
  printNextSteps();
}

async function cmdDelete() {
  if (flags.dryRun) {
    const stored = readScratchEnv();
    log("DRY RUN — no API calls will be made");
    log(`  target: ${stored?.ref ? `project ${stored.ref} from .env.scratch.local` : `first project named "${PROJECT_NAME}" (GET /projects)`}`);
    log(`  DELETE ${API_BASE}/projects/{ref}`);
    log(`  remove ${path.relative(process.cwd(), SCRATCH_ENV_PATH)} when its ref matches`);
    return;
  }
  if (!flags.yes) fail("refusing to delete without --yes (the call is irreversible once it starts)");

  const stored = readScratchEnv();
  let target = stored ? { ref: stored.ref, name: stored.name ?? PROJECT_NAME } : null;
  if (!target) target = await findProjectByName();
  if (!target) {
    log(`nothing to delete: no .env.scratch.local and no project named "${PROJECT_NAME}"`);
    return;
  }

  log(`deleting project ${target.name} (${target.ref}) — this cannot be undone`);
  try {
    const res = await api("DELETE", `/projects/${target.ref}`);
    log(`delete requested: ${res?.name ?? target.name} (${res?.ref ?? target.ref})`);
  } catch (e) {
    if (e.status === 404) {
      log(`project ${target.ref} was already gone (HTTP 404) — treating as deleted`);
    } else {
      throw e;
    }
  }
  if (stored && stored.ref === target.ref) {
    fs.rmSync(SCRATCH_ENV_PATH, { force: true });
    log(`removed ${path.relative(process.cwd(), SCRATCH_ENV_PATH)}`);
  }
}

function generateDbPass() {
  // URL-safe and guaranteed to satisfy letter+digit rules: 29 chars total.
  return `Ride${crypto.randomBytes(18).toString("base64url")}1`;
}

function printHelp() {
  console.log(`concurrency-scratch-project.mjs — throwaway Supabase project for tests/concurrency scratch DBs.

Usage:
  node scripts/concurrency-scratch-project.mjs [--name <n>] [--org <slug>] [--region <code>] [--db-pass <p>] [--dry-run]
  node scripts/concurrency-scratch-project.mjs --delete --yes

Flags:
  --delete        delete the throwaway project (requires --yes)
  --yes           confirm the irreversible delete
  --name <name>   project name (default: ${DEFAULT_PROJECT_NAME})
  --org <slug>    organization slug (default: SUPABASE_ORG_SLUG env, else auto-detected)
  --region <code> region for NEW projects (default: ${DEFAULT_REGION})
  --db-pass <p>   password to create with / to supply when reusing
  --dry-run       print the planned API calls; makes NO network calls
  --help          this text

Requires SUPABASE_ACCESS_TOKEN (process env or .env.local) with projects:write.
Writes the pooled connection URL to the gitignored .env.scratch.local.`);
}

// ── main ─────────────────────────────────────────────────────────────────────
const flags = parseArgs(process.argv.slice(2));
if (flags.help) {
  printHelp();
  process.exit(0);
}
const envLocal = readEnvLocal();
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || envLocal.SUPABASE_ACCESS_TOKEN || null;
const ORG_SLUG = flags.org || process.env.SUPABASE_ORG_SLUG || envLocal.SUPABASE_ORG_SLUG || null;
const PROJECT_NAME = flags.name;
const REGION = flags.region;

try {
  if (flags.delete) {
    await cmdDelete();
  } else {
    await cmdCreate();
  }
} catch (e) {
  fail(e.message);
}
