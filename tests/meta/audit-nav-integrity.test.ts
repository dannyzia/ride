/**
 * tests/meta/audit-nav-integrity.test.ts
 *
 * Proof for scripts/audit-nav-integrity.cjs — the sound navigation resolver that
 * replaced three rejected regex attempts at screen reachability.
 *
 * WHY. The earlier reachability analyses produced 99 false "unreachable"
 * verdicts, from three causes that a naive scan cannot see: routes held in
 * module/function constants, the admin SPA's navigation living in a DATA TABLE
 * (components/admin/AdminShell.tsx's `NAV` array consumed via
 * `router.push(item.route)`), and the app entry point's forwarder wrapper
 * (`redirect(href)` -> `router.replace(href)`), without which the root has no
 * outgoing edges. A resolver that silently stops following one of those hops
 * still exits 0 on the real tree and still prints a plausible report — the
 * silent-regression shape this repo's gate proofs exist to catch.
 *
 * HOW. Same contract as tests/meta/flow-xcheck.test.ts: copy the SHIPPED tool
 * into a throwaway tree, lay out app/** and components/** around it, and run the
 * real file. The tool resolves `typescript` from <root>/node_modules/typescript,
 * so the sandbox junctions the repo's real node_modules: a junction copies
 * nothing, and fs.rmSync does not follow junctions into the target (verified —
 * the sentinel file below exists for that reason).
 *
 * NON-VACUITY. Every resolution feature is paired with a fault-injected copy of
 * the script in which that feature's detector is neutralised, asserting the
 * outcome FLIPS (a dangling ghost disappears, or a resolved edge becomes
 * unresolved). neutralize() throws when an anchor no longer matches, and the
 * contract test at the end re-checks every anchor against the shipped tool, so
 * a refactor names itself instead of surfacing as an unexplained pass.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

const REPO = path.resolve(__dirname, "..", "..");
const TOOL = path.join(REPO, "scripts", "audit-nav-integrity.cjs");
const REPO_NODE_MODULES = path.join(REPO, "node_modules");

const ROUTER = 'import { useRouter } from "expo-router";';
const SCREEN = "export default function Screen() { return null; }";

interface AuditDef {
  /** app/-relative path -> source. */
  app?: Record<string, string>;
  /** components/-relative path -> source. */
  components?: Record<string, string>;
  /** Pass --gate (exit 2 when a dangling target exists). */
  gate?: boolean;
  /** Run the human-readable report instead of --json. */
  text?: boolean;
  /** Fault injection: rewrite the copied script. Never touches the repo copy. */
  mutate?: (src: string) => string;
}

interface DanglingSite {
  file: string;
  line: number;
  kind: string;
  target: string;
}

interface UnresolvedSite {
  file: string;
  line: number;
  kind: string;
  reason: string;
}

interface NavReport {
  routeFiles: number;
  sites: number;
  resolved: number;
  dangling: DanglingSite[];
  unresolved: UnresolvedSite[];
  droppedByReceiverCheck: number;
  unreachable: string[];
  adminUnlisted: string[];
  /** Every addressable screen (consumed by flow-xcheck's screen-affinity tier). */
  screens: string[];
  /** BFS-reachable subset of `screens`; a FLOOR (UNRESOLVED sites are not edges). */
  reachable: string[];
}

interface AuditRun {
  code: number;
  out: string;
  err: string;
  /** stdout + stderr, for assertions that only care that a message was printed. */
  all: string;
  json: NavReport | null;
}

const sandboxes: string[] = [];
afterAll(() => {
  for (const dir of sandboxes) fs.rmSync(dir, { recursive: true, force: true });
});

function write(root: string, rel: string, body: string): void {
  const abs = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, "utf8");
}

/**
 * Replace `from` with `to`, or throw. Throwing is the whole point: a mutation
 * that does not apply would leave an UNMUTATED tool in the sandbox, whose exit
 * code would look exactly like the expected result and turn the non-vacuity
 * proof into a lie.
 */
function neutralize(src: string, from: string, to: string): string {
  if (!src.includes(from)) {
    throw new Error(`fault-injection anchor not found in audit-nav-integrity.cjs: ${JSON.stringify(from)}`);
  }
  return src.replace(from, to);
}

function runAudit(f: AuditDef): AuditRun {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nav-audit-fixture-"));
  sandboxes.push(root);

  // The tool requires <root>/node_modules/typescript. A junction to the real
  // node_modules makes it visible without copying; cleanup below relies on
  // fs.rmSync NOT following junctions (probed: the target survives).
  fs.symlinkSync(REPO_NODE_MODULES, path.join(root, "node_modules"), "junction");

  let src = fs.readFileSync(TOOL, "utf8").replace(/\r\n/g, "\n");
  if (f.mutate) src = f.mutate(src);
  write(root, "scripts/audit-nav-integrity.cjs", src);

  for (const [rel, body] of Object.entries(f.app ?? {})) write(root, `app/${rel}`, body);
  for (const [rel, body] of Object.entries(f.components ?? {})) write(root, `components/${rel}`, body);

  const args = [
    path.join(root, "scripts", "audit-nav-integrity.cjs"),
    ...(f.text ? [] : ["--json"]),
    ...(f.gate ? ["--gate"] : []),
  ];
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = r.stdout ?? "";
  const err = r.stderr ?? "";
  let json: NavReport | null = null;
  if (!f.text) {
    try {
      json = JSON.parse(out) as NavReport;
    } catch {
      json = null;
    }
  }
  return { code: r.status ?? -1, out, err, all: out + err, json };
}

/** The report, failing loudly when the tool produced no parseable JSON. */
function report(r: AuditRun): NavReport {
  if (!r.json) {
    throw new Error(`expected --json output, got:\n${r.all.slice(0, 600)}`);
  }
  return r.json;
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const pushable = (target: string) =>
  [
    ROUTER,
    "export default function Screen() {",
    "  const router = useRouter();",
    `  return <Pressable onPress={() => router.push(${target})} />;`,
    "}",
  ].join("\n");

const CLEAN = (): AuditDef => ({
  app: {
    "(auth)/welcome.tsx": pushable('"/(auth)/login"'),
    "(auth)/login.tsx": SCREEN,
  },
});

/** The class the request names: the route is a module constant, one hop away. */
const CONST_CLEAN = (): AuditDef => ({
  app: {
    "(auth)/welcome.tsx": [
      ROUTER,
      'const LOGIN = "/(auth)/login";',
      "export default function Welcome() {",
      "  const router = useRouter();",
      "  router.push(LOGIN);",
      "  return null;",
      "}",
    ].join("\n"),
    "(auth)/login.tsx": SCREEN,
  },
});

/**
 * Two scopes bind `LOGIN` to different values. A flat, module-first name map
 * would resolve B's push to the module's live route and MISS the ghost — the
 * exact false-negative that makes reachability numbers unsound.
 */
const CONST_SHADOWED = (): AuditDef => ({
  app: {
    "(auth)/welcome.tsx": [
      ROUTER,
      'const LOGIN = "/(auth)/login";',
      "export function A() { const router = useRouter(); router.push(LOGIN); return null; }",
      'export function B() { const router = useRouter(); const LOGIN = "/(auth)/ghost"; router.push(LOGIN); return null; }',
    ].join("\n"),
    "(auth)/login.tsx": SCREEN,
  },
  gate: true,
});

/** The admin SPA mechanism: a data table consumed inside the render body. */
const ADMIN = (ghost = false): AuditDef => ({
  components: {
    "admin/AdminShell.tsx": [
      ROUTER,
      "const NAV = [",
      '  { route: "/admin/dashboard", label: "Dashboard" },',
      '  { route: "/admin/riders", label: "Riders" },',
      ...(ghost ? ['  { route: "/admin/ghost", label: "Ghost" },'] : []),
      "];",
      "export default function AdminShell() {",
      "  const router = useRouter();",
      "  return (",
      "    <View>",
      "      {NAV.filter((item) => item.hidden !== true).map((item) => (",
      "        <Pressable key={item.route} onPress={() => router.push(item.route as string)} />",
      "      ))}",
      "    </View>",
      "  );",
      "}",
    ].join("\n"),
  },
  app: {
    "admin/dashboard.tsx": SCREEN,
    "admin/riders.tsx": SCREEN,
    "admin/orphan.tsx": SCREEN,
  },
});

/** The app entry point: an indirect wrapper whose call sites carry the targets. */
const FORWARDER = (ghost = false): AuditDef => ({
  app: {
    "index.tsx": [
      'import { useCallback } from "react";',
      ROUTER,
      "export default function Index() {",
      "  const router = useRouter();",
      "  const redirect = useCallback((href: string) => {",
      "    router.replace(href);",
      "  }, [router]);",
      '  redirect("/(auth)/welcome");',
      `  redirect("${ghost ? "/(auth)/ghost" : "/(auth)/login"}");`,
      "  return null;",
      "}",
    ].join("\n"),
    "(auth)/welcome.tsx": SCREEN,
    "(auth)/login.tsx": SCREEN,
  },
});

const STACK = (): AuditDef => ({
  app: {
    "(main)/shop/_layout.tsx": [
      'import { Stack } from "expo-router";',
      "export default function Layout() {",
      "  return (",
      "    <Stack>",
      '      <Stack.Screen name="index" />',
      '      <Stack.Screen name="[id]" />',
      "    </Stack>",
      "  );",
      "}",
    ].join("\n"),
    "(main)/shop/index.tsx": SCREEN,
    "(main)/shop/[id].tsx": SCREEN,
  },
});

/** A genuinely runtime-dependent target: must be UNRESOLVED, never dangling. */
const RUNTIME = (): AuditDef => ({
  components: {
    "PromoBanner.tsx": [
      ROUTER,
      "export function PromoBanner({ getTarget }) {",
      "  const router = useRouter();",
      "  return <Pressable onPress={() => router.push(getTarget())} />;",
      "}",
    ].join("\n"),
  },
  gate: true,
});

/** Non-router receivers: the fiction the first version reported as navigation. */
const RECEIVERS = (): AuditDef => ({
  components: {
    "PhoneField.tsx": [
      "export function PhoneField({ value }) {",
      '  const digits = value.replace(/\\D/g, "");',
      "  const rows = [];",
      "  rows.push(digits);",
      "  return null;",
      "}",
    ].join("\n"),
  },
});

/** A receiver literally named `router` that is NOT from expo-router. */
const FAKE_ROUTER = (): AuditDef => ({
  components: {
    "FakeRouter.tsx": [
      "export function FakeRouter() {",
      "  const router = { push: () => {} };",
      '  router.push("/not/checked");',
      "  return null;",
      "}",
    ].join("\n"),
  },
});

const LINK = (): AuditDef => ({
  components: {
    "NavLink.tsx": [
      'import { Link } from "expo-router";',
      'export function NavLink() { return <Link href="/(auth)/login">go</Link>; }',
    ].join("\n"),
  },
  app: { "(auth)/login.tsx": SCREEN },
});

// ── fault-injection anchors, one per resolution feature ──────────────────────

const ANCHORS = {
  /** identifier -> const initializer (module and function scope). */
  routeConstant: "if (init) return resolveExpr(init, sf, env, depth + 1);",
  /** `.map` receiver -> array literal (the admin NAV table). */
  tableLiteral: "if (ts.isArrayLiteralExpression(node)) return node.elements;",
  /** a local function whose first parameter is forwarded into a router method. */
  forwarder: "return hasForwardingBody(fn, param) ? param : undefined;",
  /** <Stack.Screen name> relative to its layout directory. */
  screenName: "const segs = resolveScreenName(sf, node);",
  /** the honesty bucket: undecidable sites are collected here, not as dead. */
  unresolvedCollector: "unresolved.push({ file: from, line: s.line, kind: s.kind, reason });",
  /** the only gating bucket. */
  danglingCollector: 'dangling.push({ file: from, line: s.line, kind: s.kind, target: "/" + key });',
  /** the receiver check that keeps String/Array methods out of the site set. */
  receiverCheck: "routers.has(node.expression.expression.text)",
} as const;

const FAULTS = {
  /** constants stop resolving: resolved edges become UNRESOLVED, not wrong. */
  routeConstant: (s: string) =>
    neutralize(s, ANCHORS.routeConstant, "if (false) return resolveExpr(init, sf, env, depth + 1);"),
  /** array-literal resolution stops: the NAV table degrades to "runtime". */
  tableLiteral: (s: string) => neutralize(s, ANCHORS.tableLiteral, "if (false) return node.elements;"),
  /** forwarder detection stops: the wrapper call sites are not even sites. */
  forwarder: (s: string) => neutralize(s, ANCHORS.forwarder, "return undefined;"),
  /** Stack.Screen names stop resolving (no site is pushed). */
  screenName: (s: string) => neutralize(s, ANCHORS.screenName, "const segs = null;"),
  /**
   * The old rejected behavior, injected: undecidable sites are folded into the
   * dead bucket. The gate must flip 0 -> 2, which is what makes "UNRESOLVED
   * never gates" a fact rather than a comment.
   */
  unresolvedFoldsIntoDangling: (s: string) =>
    neutralize(
      s,
      ANCHORS.unresolvedCollector,
      'dangling.push({ file: from, line: s.line, kind: s.kind, target: "/undecidable" });'
    ),
  /** the gate stops reporting a collected dangling site (proves the exit code comes from it). */
  danglingDropped: (s: string) => neutralize(s, ANCHORS.danglingCollector, "/* dangling collector removed */"),
  /** any receiver counts as a router: String.replace / Array.push become "navigation". */
  receiverCheck: (s: string) => neutralize(s, ANCHORS.receiverCheck, "true"),
} as const;

// ── tests ─────────────────────────────────────────────────────────────────────

describe("healthy tree", () => {
  it("resolves a string-literal push and exits 0", () => {
    const r = runAudit(CLEAN());
    const j = report(r);
    expect(j.routeFiles).toBe(2);
    expect(j.sites).toBe(1);
    expect(j.resolved).toBe(1);
    expect(j.dangling).toEqual([]);
    expect(j.unresolved).toEqual([]);
    expect(r.code).toBe(0);
  });

  it("prints a clean report and a zero suspicious-drop coverage line", () => {
    const r = runAudit({ ...CLEAN(), text: true });
    expect(r.out).toContain("RESOLVED 1  DANGLING 0  UNRESOLVED 0");
    expect(r.out).toContain("✅ no dangling navigation targets");
    expect(r.out).toContain('0 rejected by the router-receiver check (0 of them on a receiver named "router")');
    expect(r.code).toBe(0);
  });

  it("resolves a <Link href> JSX site", () => {
    const r = runAudit(LINK());
    const j = report(r);
    expect(j.sites).toBe(1);
    expect(j.resolved).toBe(1);
    expect(j.unresolved).toEqual([]);
  });
});

describe("route constants (the class the request names)", () => {
  it("follows a module-level const into the route file", () => {
    const r = runAudit(CONST_CLEAN());
    const j = report(r);
    expect(j.resolved).toBe(1);
    expect(j.dangling).toEqual([]);
    expect(r.code).toBe(0);
  });

  it("resolves per scope, so an inner ghost constant is NOT masked by the outer live one", () => {
    // If the resolver used a flat module-first name map, B's push would bind to
    // the module's "/(auth)/login" and report ZERO dangling. The ghost IS the
    // test: its absence is the false negative that made the old tool unsound.
    const r = runAudit(CONST_SHADOWED());
    const j = report(r);
    expect(j.dangling.map((d) => d.target)).toEqual(["/ghost"]);
    expect(j.resolved).toBe(1);
    expect(r.code).toBe(2);
  });

  it("does not resolve constants once identifier resolution is neutralised (non-vacuity)", () => {
    const r = runAudit({ ...CONST_SHADOWED(), mutate: FAULTS.routeConstant });
    const j = report(r);
    expect(j.dangling).toEqual([]);
    expect(j.unresolved.length).toBe(2);
    expect(r.code).toBe(0);
  });
});

describe("data-table navigation (the admin SPA NAV array)", () => {
  it("resolves router.push(item.route) through filter/map and marks unlisted screens", () => {
    const r = runAudit(ADMIN());
    const j = report(r);
    expect(j.sites).toBe(1);
    expect(j.resolved).toBe(2);
    expect(j.dangling).toEqual([]);
    // The nine-screen product finding is this property: a screen with no NAV
    // entry has no inbound edge and cannot be reached through the panel UI.
    expect(j.adminUnlisted).toEqual(["app/admin/orphan.tsx"]);
    expect(j.unreachable).toEqual(["app/admin/orphan.tsx"]);
    expect(r.code).toBe(0);
  });

  it("reports a NAV entry with no route file as dangling, with the banner and --gate exit 2", () => {
    const r = runAudit({ ...ADMIN(true), text: true, gate: true });
    expect(r.out).toContain("❌ DANGLING navigation targets (no matching route file): 1");
    expect(r.out).toContain("-> /admin/ghost");
    expect(r.code).toBe(2);
  });

  it("does not block once the dangling collector is neutralised (non-vacuity)", () => {
    const r = runAudit({ ...ADMIN(true), mutate: FAULTS.danglingDropped });
    const j = report(r);
    expect(j.dangling).toEqual([]);
    expect(r.code).toBe(0);
  });

  it("falls back to UNRESOLVED when array-literal resolution stops (non-vacuity)", () => {
    const r = runAudit({ ...ADMIN(true), mutate: FAULTS.tableLiteral });
    const j = report(r);
    expect(j.dangling).toEqual([]);
    expect(j.unresolved.length).toBe(1);
    expect(j.unresolved[0].reason).toContain("maps over a runtime collection");
    expect(r.code).toBe(0);
  });
});

describe("indirect forwarders (the app entry point)", () => {
  it("resolves the wrapper's call sites and does not double-count its body", () => {
    const r = runAudit(FORWARDER());
    const j = report(r);
    expect(j.resolved).toBe(2);
    expect(j.unresolved).toEqual([]);
    expect(j.dangling).toEqual([]);
    // The JSON set flow-xcheck's screen-affinity tier consumes: all three files
    // are screens, and all three are reached from the entry wrapper.
    expect(j.screens).toEqual(["app/(auth)/login.tsx", "app/(auth)/welcome.tsx", "app/index.tsx"]);
    expect(j.reachable).toEqual(["app/(auth)/login.tsx", "app/(auth)/welcome.tsx", "app/index.tsx"]);
    expect(r.code).toBe(0);
  });

  it("reports a ghost call-site target as dangling", () => {
    const r = runAudit({ ...FORWARDER(true), gate: true });
    const j = report(r);
    expect(j.dangling.map((d) => d.target)).toEqual(["/ghost"]);
    expect(r.code).toBe(2);
  });

  it("does not block once forwarder detection is neutralised (non-vacuity)", () => {
    // Without the feature the call sites are not classified at all — the
    // dangerous direction, because a dropped site hides a dangling target.
    const r = runAudit({ ...FORWARDER(true), gate: true, mutate: FAULTS.forwarder });
    const j = report(r);
    expect(j.dangling).toEqual([]);
    expect(j.resolved).toBe(0);
    // The reachability set collapses to the (edge-less) entry file: proof that
    // `reachable` tracks resolved edges rather than being a screen list.
    expect(j.reachable).toEqual(["app/index.tsx"]);
    expect(j.screens).toHaveLength(3);
    expect(r.code).toBe(0);
  });
});

describe("Stack.Screen names are relative to their layout directory", () => {
  it("binds both sibling registrations (index popped) and gives the screens an inbound edge", () => {
    const r = runAudit(STACK());
    const j = report(r);
    expect(j.resolved).toBe(2);
    expect(j.unresolved).toEqual([]);
    expect(j.unreachable).toEqual([]);
    // Both sibling screens are addressable; neither is reachable because this
    // fixture has no entry file, so the BFS is rooted nowhere. That is the
    // floor semantics the affinity tier must respect, pinned here.
    expect(j.screens).toEqual(["app/(main)/shop/[id].tsx", "app/(main)/shop/index.tsx"]);
    expect(j.reachable).toEqual([]);
    expect(r.code).toBe(0);
  });

  it("leaves the screens with no inbound edge once name resolution stops (non-vacuity)", () => {
    const r = runAudit({ ...STACK(), mutate: FAULTS.screenName });
    const j = report(r);
    expect(j.resolved).toBe(0);
    expect(j.unreachable).toEqual(["app/(main)/shop/index.tsx", "app/(main)/shop/[id].tsx"]);
    expect(r.code).toBe(0);
  });
});

describe("UNRESOLVED is the honesty budget, never a verdict", () => {
  it("reports a runtime-dependent push as unresolved and exits 0 even with --gate", () => {
    const r = runAudit(RUNTIME());
    const j = report(r);
    expect(j.dangling).toEqual([]);
    expect(j.unresolved.length).toBe(1);
    expect(j.unresolved[0].reason).toContain("computed from a function call");
    expect(r.code).toBe(0);
  });

  it("would gate, incorrectly, if unresolved sites were folded into dangling (non-vacuity)", () => {
    const r = runAudit({ ...RUNTIME(), mutate: FAULTS.unresolvedFoldsIntoDangling });
    const j = report(r);
    expect(j.dangling.map((d) => d.target)).toEqual(["/undecidable"]);
    expect(j.unresolved).toEqual([]);
    expect(r.code).toBe(2);
  });
});

describe("router-receiver validation (the silent-drop guard)", () => {
  it("rejects String.replace / Array.push without reporting them as dangling", () => {
    const r = runAudit(RECEIVERS());
    const j = report(r);
    expect(j.sites).toBe(0);
    expect(j.dangling).toEqual([]);
    expect(j.droppedByReceiverCheck).toBe(2);
    expect(r.code).toBe(0);
  });

  it("flags — but does not act on — a receiver named `router` that is not expo-router", () => {
    const r = runAudit({ ...FAKE_ROUTER(), text: true });
    expect(r.out).toContain('1 rejected by the router-receiver check (1 of them on a receiver named "router")');
    expect(r.out).toContain("that were NOT treated as navigation");
    expect(r.code).toBe(0);
  });

  it("would fabricate a dangling target if any receiver counted as a router (non-vacuity)", () => {
    const r = runAudit({ ...FAKE_ROUTER(), gate: true, mutate: FAULTS.receiverCheck });
    const j = report(r);
    expect(j.dangling.map((d) => d.target)).toEqual(["/not/checked"]);
    expect(r.code).toBe(2);
  });
});

describe("fault-injection contract", () => {
  it("every anchor still matches the shipped tool", () => {
    // If a refactor moves any of these lines, the non-vacuity tests above would
    // fail with an opaque "expected 0, received 2" from an UNMUTATED script.
    // This names the drift instead.
    const src = fs.readFileSync(TOOL, "utf8").replace(/\r\n/g, "\n");
    for (const [name, anchor] of Object.entries(ANCHORS)) {
      expect([name, src.includes(anchor)]).toEqual([name, true]);
    }
  });

  it("mutates the sandbox copy only, never the repo's tool", () => {
    const before = fs.readFileSync(TOOL, "utf8");
    runAudit({ ...ADMIN(true), mutate: FAULTS.tableLiteral });
    expect(fs.readFileSync(TOOL, "utf8")).toBe(before);
  });
});
