/**
 * counterpart-api.js — GraalJS live-API call for COUNTERPART-API flows (runs INSIDE Maestro).
 *
 * Companion to counterpart-login.js; see that file for WHY this pair replaced the
 * shell-out construct (no Maestro step can run a shell command, and `commands:` is
 * not a `runScript` field).
 *
 * Every call goes to the app's OWN live endpoint — never a direct DB write
 * (maestro/COVERAGE-MANIFEST.md §4 doctrine). A non-2xx response throws, so the
 * flow FAILS at this step instead of continuing against a state the counterpart
 * never reached (the silent-pass mode the old shell construct had).
 *
 * Inputs (flow env):
 *   apiBase  — ${API_BASE}, the Expo API host (Metro dev: http://<LAN-IP>:8081)
 *   method   — GET | POST | PATCH | PUT | DELETE
 *   path     — the endpoint path, e.g. /api/shop/orders/${ORDER_ID}/mark-ready
 *   body     — JSON string; ignored for GET/HEAD (default "{}")
 *   label    — optional log prefix and idempotency-key seed
 *   token    — optional bearer token from flow env (the seed/counterpart-test
 *              callers pass ${API_TOKEN}). WHEN ABSENT the token written by
 *              counterpart-login.js (output.counterpartToken) is used. Precedence
 *              is explicit: env token wins, output token is the fallback.
 *
 * Verification: load-verified via maestro/tools/flow-load-check.cjs. Runtime
 * behaviour is device-day work (Maestro cannot run a step without a device).
 */

/* eslint-disable no-var -- GraalJS script scope: `var` keeps re-declaration legal
   if Maestro evaluates this file more than once in one context, where `const`
   would raise a SyntaxError on the second run. */
/* global apiBase, method, path, body, label, token -- injected by the Maestro
   runScript `env:` map, so ESLint cannot know them. */
/* global http, output -- Maestro's GraalJS sandbox globals. */
/* eslint-disable no-console -- Maestro captures the sandbox's console output
   (prefixed JsConsole); the GraalJS sandbox has no logger. */

var _apiBase = typeof apiBase === "undefined" ? "" : String(apiBase);
var _method = (typeof method === "undefined" ? "POST" : String(method)).toUpperCase();
var _path = typeof path === "undefined" ? "" : String(path);
var _body = typeof body === "undefined" ? "{}" : String(body);
var _label = typeof label === "undefined" ? "counterpart-api" : String(label);
var _token = typeof token === "undefined" ? "" : String(token);

if (!_apiBase || !_path) {
  throw new Error(_label + ": apiBase and path are required");
}
if (!_token && output.counterpartToken) {
  _token = String(output.counterpartToken);
}

var _url = _apiBase.replace(/\/+$/, "") + _path;
var _headers = { "Content-Type": "application/json" };
if (_token) {
  _headers.Authorization = "Bearer " + _token;
}
// Idempotency convention (AGENTS.md): deterministic key per counterpart action.
_headers["Idempotency-Key"] = "maestro-" + _method + "-" + _path.replace(/[^A-Za-z0-9]+/g, "-");

var _options = { method: _method, headers: _headers };
if (_method !== "GET" && _method !== "HEAD") {
  _options.body = _body;
}

var _res = http.request(_url, _options);
if (!_res.ok) {
  throw new Error(_label + ": " + _method + " " + _path + " failed — HTTP " + _res.status + " " + _res.body);
}
output.lastCounterpartStatus = _res.status;
console.log(_label + ": " + _method + " " + _path + " -> " + _res.status);
