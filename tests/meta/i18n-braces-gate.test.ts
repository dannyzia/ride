/**
 * Meta gate: the single-brace locale gate must actually fail on malformed
 * interpolation params.
 *
 * Purpose:     react-i18next interpolates `{{name}}`. A value written `{name}`
 *              renders verbatim ("Debt ceiling: {amount}") and no other gate
 *              sees it: the key resolves, both locales agree, the call site
 *              passes the param, and tsc/eslint never read locale JSON. The
 *              bug shipped twice by hand (monetization.ceiling_warn,
 *              shop.packages.*) before scripts/check-i18n-braces.cjs existed.
 * Owner:       Coding model (test lane)
 * Status:      ACTIVE
 * Related (concrete paths):
 *   - scripts/check-i18n-braces.cjs — the CLI under test
 *   - package.json — `check:i18n-braces`, the npm entry point
 *   - .github/workflows/ci.yml — `test` job and `weekly-validation` job steps
 * Last verified: 2026-11-10 — real tree clean (2 locale files, 177 double-brace
 *   placeholders); every fault shape below fails on the SHIPPED tool and passes
 *   on a neutralised copy, so a no-op gate cannot pass this suite.
 * How to update: the CLI resolves its inputs from __dirname, so these fixtures
 *   copy the shipped file into a throwaway tree rather than faking paths. If the
 *   detector line moves, `neutraliseDetector` throws instead of silently
 *   injecting nothing — fix that helper, never delete the fault pair.
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const CLI = path.join(ROOT, "scripts", "check-i18n-braces.cjs");

type Run = { code: number; output: string };

function run(cliPath: string, args: string[] = []): Run {
  try {
    const stdout = execFileSync(process.execPath, [cliPath, ...args], {
      cwd: path.dirname(path.dirname(cliPath)),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: typeof e.status === "number" ? e.status : 1,
      output: `${e.stdout ?? ""}${e.stderr ?? ""}`,
    };
  }
}

/**
 * Neutralise the detector in a COPY of the shipped CLI. The fault-injected copy
 * must report the same faulty tree as clean — that is what proves the fixture
 * cases fail because of the rule and not by accident.
 */
function neutraliseDetector(source: string): string {
  const needle = "  if (!/[{}]/.test(rest)) return null;";
  const replacement = "  if (true) return null; // fault injection: detector off";
  if (!source.includes(needle)) {
    throw new Error(
      "fault injection did not apply — the detector line in scripts/check-i18n-braces.cjs moved",
    );
  }
  return source.replace(needle, replacement);
}

function sandbox(
  locales: Record<string, unknown>,
  opts: { neutralise?: boolean; rawFiles?: Record<string, string> } = {},
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-braces-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  const source = fs.readFileSync(CLI, "utf8");
  fs.writeFileSync(
    path.join(dir, "scripts", "check-i18n-braces.cjs"),
    opts.neutralise ? neutraliseDetector(source) : source,
  );
  for (const [rel, json] of Object.entries(locales)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(json, null, 2));
  }
  for (const [rel, body] of Object.entries(opts.rawFiles ?? {})) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return dir;
}

function sandboxCli(dir: string): string {
  return path.join(dir, "scripts", "check-i18n-braces.cjs");
}

const EN = "i18n/locales/en/common.json";
const BN = "i18n/locales/bn/common.json";

describe("i18n braces gate — single-brace params cannot ship", () => {
  test("the real tree is clean", () => {
    const result = run(CLI);
    expect(result.code).toBe(0);
    expect(result.output).toContain("locale file(s) clean");
  });

  test("well-formed placeholders, plain text and non-string leaves pass", () => {
    const dir = sandbox({
      [EN]: {
        monetization: {
          ceiling: "You're at {{pct}}% of your debt ceiling",
          spaced: "Debt ceiling: {{ amount }}",
          plain: "No placeholders here",
          count: 12,
          flag: true,
          nested: { deep: "due {{date}}" },
        },
      },
    });
    const result = run(sandboxCli(dir));
    expect(result.code).toBe(0);
  });

  test("a single-brace param fails and names the offending key", () => {
    const dir = sandbox({
      [EN]: { monetization: { ok: "{{amount}}", bad: "Debt ceiling: {amount}" } },
    });
    const result = run(sandboxCli(dir));
    expect(result.code).toBe(1);
    expect(result.output).toContain("monetization.bad");
    expect(result.output).not.toContain("monetization.ok");
  });

  test("the FUSE pair: a neutralised copy reports the same faulty tree clean", () => {
    const faulty = { [EN]: { monetization: { bad: "Debt ceiling: {amount}" } } };
    const shipped = run(sandboxCli(sandbox(faulty)));
    const neutralised = run(sandboxCli(sandbox(faulty, { neutralise: true })));
    expect(shipped.code).toBe(1);
    expect(neutralised.code).toBe(0);
  });

  test("a fault in ONE locale fails: coverage is every locale file, not just en", () => {
    const dir = sandbox({
      [EN]: { monetization: { amount: "Debt ceiling: {{amount}}" } },
      [BN]: { monetization: { amount: "ঋণের সীমা: {amount}" } },
    });
    const result = run(sandboxCli(dir));
    expect(result.code).toBe(1);
    // The tool prints repo-relative paths with forward slashes on every OS.
    expect(result.output).toContain(BN);
    expect(result.output).toContain("monetization.amount");
  });

  test.each([
    ["unterminated double-open", "x {{amount}"],
    ["unterminated double-close", "x {amount}}"],
  ])("%s fails (unbalanced braces render verbatim too)", (_label, value) => {
    const dir = sandbox({ [EN]: { k: value } });
    expect(run(sandboxCli(dir)).code).toBe(1);
  });

  test("no locale files is exit 2, never a silent pass", () => {
    const dir = sandbox({});
    const result = run(sandboxCli(dir));
    expect(result.code).toBe(2);
    expect(result.output).toContain("could not run");
  });

  test("unparseable locale JSON is exit 2, never a silent pass", () => {
    const dir = sandbox({}, { rawFiles: { [EN]: "{ not json" } });
    const result = run(sandboxCli(dir));
    expect(result.code).toBe(2);
    expect(result.output).toContain("not valid JSON");
  });

  test("--json reports the findings machine-readably", () => {
    const dir = sandbox({ [EN]: { a: { bad: "{amount}" } } });
    const result = run(sandboxCli(dir), ["--json"]);
    expect(result.code).toBe(1);
    const parsed = JSON.parse(result.output) as {
      findings: { key: string }[];
    };
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0].key).toBe("a.bad");
  });
});
