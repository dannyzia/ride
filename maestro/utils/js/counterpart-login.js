/**
 * counterpart-login.js — GraalJS login for COUNTERPART-API flows (runs INSIDE Maestro).
 *
 * WHY THIS EXISTS (2026-10-15). The counterpart mechanism originally shelled out
 * (`- runScript:` + `when:` + `commands: [- node maestro/utils/counterpart-login.cjs …]`).
 * That construct cannot load on Maestro 2.6.1: `commands:` is a `runFlow` field, not
 * a `runScript` one, and Maestro has NO shell step at all (upstream maintainers:
 * "We won't support shell scripts inside of tests"). `runScript` runs a JavaScript
 * FILE in a GraalJS sandbox — so the two-sided pattern is implemented here in JS,
 * with Maestro's built-in `http` client (OkHttp) instead of Node's `fetch`.
 * The Node pair under maestro/utils/*.cjs is kept as a manual/CLI utility, but no
 * flow can invoke it: a flow step cannot shell out.
 *
 * Sandbox constraints that shaped this file: no `fs` (so no token file), no
 * `require`, no `process.env`. Environment variables arrive as bare JS identifiers
 * and results are shared between steps through the `output` object, which persists
 * for the whole flow run.
 *
 * Inputs (flow env, all required):
 *   phone, password    — the counterpart account's real credentials
 *   supabaseUrl        — ${SUPABASE_URL}
 *   supabaseAnonKey    — ${SUPABASE_ANON_KEY}
 *   label              — optional log prefix
 * Outputs (read by counterpart-api.js):
 *   output.counterpartToken, output.counterpartUserId
 *
 * Verification: load-verified via maestro/tools/flow-load-check.cjs (the engine
 * parses and accepts this step). Runtime behaviour is device-day work — it cannot
 * be exercised without a device, since Maestro refuses to run any step without one.
 */

/* eslint-disable no-var -- GraalJS script scope: `var` keeps re-declaration legal
   if Maestro evaluates this file more than once in one context, where `const`
   would raise a SyntaxError on the second run. */
/* global phone, password, supabaseUrl, supabaseAnonKey, label -- injected by the
   Maestro runScript `env:` map, so ESLint cannot know them. */
/* global http, json, output -- Maestro's GraalJS sandbox globals. */
/* eslint-disable no-console -- Maestro captures the sandbox's console output
   (prefixed JsConsole); the GraalJS sandbox has no logger. */

var _phone = typeof phone === "undefined" ? "" : String(phone);
var _password = typeof password === "undefined" ? "" : String(password);
var _supabaseUrl = typeof supabaseUrl === "undefined" ? "" : String(supabaseUrl);
var _anonKey = typeof supabaseAnonKey === "undefined" ? "" : String(supabaseAnonKey);
var _label = typeof label === "undefined" ? "counterpart-login" : String(label);

if (!_phone || !_password || !_supabaseUrl) {
  throw new Error(_label + ": phone, password and supabaseUrl are required");
}

var _res = http.request(_supabaseUrl.replace(/\/+$/, "") + "/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: _anonKey },
  body: JSON.stringify({ phone: _phone, password: _password }),
});

if (!_res.ok) {
  throw new Error(_label + ": counterpart login failed — HTTP " + _res.status + " " + _res.body);
}

var _parsed = json(_res.body);
output.counterpartToken = _parsed.access_token;
output.counterpartUserId = _parsed.user ? _parsed.user.id : null;
console.log(_label + ": token acquired for user " + output.counterpartUserId);
