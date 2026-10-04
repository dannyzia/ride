/**
 * Unit tests for maestro/tools/testid-flow-currency.cjs (pre-commit stage 6).
 *
 * The end-to-end blocking behaviour is proved by fault injection in a throwaway
 * repo (a rename + correctly regenerated map + no flow staged -> exit 1). What
 * these cover is the part fault injection cannot cheaply re-run on every commit:
 * the pure diff/parse logic, and the two silent-pass traps that were actually hit
 * while writing the tool and would otherwise ship as a gate that always passes.
 *
 * TRAP 1 (regression guard, read-only against this repo): SELECTOR_RE was first
 * written with the POSIX class `[[:space:]]`, copied from the git grep -E
 * pattern. In JAVASCRIPT that bracket expression means "one of [ : s p a c e
 * followed by a literal ]", so it matched no indent and flowSelectors() returned
 * an EMPTY map. The gate then reported "0 flow-selected testIDs ... clean" and
 * exited 0 on every commit — a security gate that never fires. Nothing failed
 * loudly; only a hardcoded expectation on a non-zero selector count catches it.
 *
 * TRAP 2: `git grep --cached` exits 1 when nothing matches. That is an empty
 * result, not a failure, and must not become a BrokenInputError.
 */
const path = require("path");

const gate = require(path.join(__dirname, "..", "..", "maestro", "tools", "testid-flow-currency.cjs"));

const MAP_A = JSON.stringify({
  total: 3,
  screens: {
    "s.tsx": [
      { id: "a.one", line: 1 },
      { id: "a.two", line: 2 },
    ],
    "t.tsx": [{ id: "t.three", line: 5 }],
  },
});

const MAP_RENAMED = JSON.stringify({
  total: 3,
  screens: {
    "s.tsx": [
      { id: "b.one", line: 1 },
      { id: "a.two", line: 2 },
    ],
    "t.tsx": [{ id: "t.three", line: 5 }],
  },
});

describe("testid-flow-currency: map parsing", () => {
  it("collects every id across screens", () => {
    const ids = gate.parseMap(MAP_A, "test");
    expect([...ids].sort()).toEqual(["a.one", "a.two", "t.three"]);
  });

  it("rejects invalid JSON rather than reporting an empty id set", () => {
    expect(() => gate.parseMap("NOT JSON {{{", "bad map")).toThrow(gate.BrokenInputError);
  });

  it("rejects a map with no screens key", () => {
    expect(() => gate.parseMap(JSON.stringify({ total: 0 }), "bad map")).toThrow(
      gate.BrokenInputError
    );
  });

  it("rejects a screens entry that is not an array", () => {
    const bad = JSON.stringify({ total: 1, screens: { "s.tsx": { id: "x" } } });
    expect(() => gate.parseMap(bad, "bad map")).toThrow(gate.BrokenInputError);
  });

  it("accepts a bare-string id as well as an object with an id", () => {
    const ids = gate.parseMap(JSON.stringify({ screens: { "s.tsx": ["plain.id"] } }), "t");
    expect([...ids]).toEqual(["plain.id"]);
  });
});

describe("testid-flow-currency: removed-id diff", () => {
  it("reports an id the staged map drops", () => {
    const removed = gate.diffRemoved(gate.parseMap(MAP_A, "a"), gate.parseMap(MAP_RENAMED, "b"));
    expect(removed).toEqual(["a.one"]);
  });

  it("reports nothing when the maps are identical", () => {
    expect(gate.diffRemoved(gate.parseMap(MAP_A, "a"), gate.parseMap(MAP_A, "b"))).toEqual([]);
  });

  it("treats a rename as one removal plus one addition", () => {
    const after = gate.parseMap(MAP_RENAMED, "b");
    const removed = gate.diffRemoved(gate.parseMap(MAP_A, "a"), after);
    // b.one is ADDED, not "moved" — this gate only ever diffs identity.
    expect(removed).toEqual(["a.one"]);
    expect(after.has("b.one")).toBe(true);
  });

  it("does not report an id still present under another screen", () => {
    const after = JSON.stringify({
      screens: { "z.tsx": [{ id: "a.one" }, { id: "a.two" }, { id: "t.three" }] },
    });
    expect(gate.diffRemoved(gate.parseMap(MAP_A, "a"), gate.parseMap(after, "b"))).toEqual([]);
  });
});

describe("testid-flow-currency: selector regex", () => {
  it("captures a quoted id", () => {
    expect(gate.SELECTOR_RE.exec('    id: "phone-entry.set-phone')).toBeTruthy();
    expect(gate.SELECTOR_RE.exec('    id: "phone-entry.set-phone')[1]).toBe(
      "phone-entry.set-phone"
    );
  });

  it("captures an unquoted id", () => {
    expect(gate.SELECTOR_RE.exec("- id: some.id")[1]).toBe("some.id");
  });

  it("is the id in group 1 (the optional list dash is non-capturing)", () => {
    // Guards the real bug: when the dash group was capturing, m[1] was "-" and
    // m[2] the id; every id came back as undefined or "-" and the gate passed.
    expect(gate.SELECTOR_RE.exec("- id: some.id")[1]).not.toBe("-");
  });

  it("ignores a text tapOn line", () => {
    expect(gate.SELECTOR_RE.exec('    tapOn: "Submit"')).toBeNull();
  });
});

describe("testid-flow-currency: live repo selector set (TRAP 1 regression guard)", () => {
  it("finds a non-zero number of flow-selected testIDs", () => {
    // If SELECTOR_RE ever regresses to a POSIX class (or the -z record parse
    // misaligns), this returns 0 and the gate becomes a permanent no-op.
    const selectors = gate.flowSelectors();
    expect(selectors.size).toBeGreaterThan(0);
  });

  it("finds the well-known login selector", () => {
    // The live index currently selects 93 ids; this checks one well-known one.
    const selectors = gate.flowSelectors();
    expect(selectors.has("phone-entry.set-phone")).toBe(true);
  });

  it("attributes each selector to a real flow file, not to match text", () => {
    // TRAP 2's sibling bug: with the wrong record split, the "file" was the
    // previous record's match text. Every value must look like a path.
    for (const files of gate.flowSelectors().values()) {
      for (const f of files) {
        expect(f).toMatch(/^maestro\/flows\/.*\.ya?ml$/);
      }
    }
  });

  it("agrees with the measured 93 flow-selected ids", () => {
    // Exact count is pinned deliberately: it makes a silent parser regression
    // impossible to miss. It moved 91 -> 93 when the B-3 flow rebuild landed
    // (one selector replaced by three, net +2) — a legitimate flow edit must
    // update this pin in the same commit, never relax the assertion.
    expect(gate.flowSelectors().size).toBe(93);
  });
});

describe("testid-flow-currency: exported surface", () => {
  it("exports everything the hook and harness rely on", () => {
    for (const fn of ["runCurrencyCheck", "diffRemoved", "flowSelectors", "parseMap"]) {
      expect(typeof gate[fn]).toBe("function");
    }
  });
});