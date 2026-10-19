/**
 * Meta guard: the A2-4 public surfaces must carry the top-of-file marker.
 *
 * Purpose:     Every unauthenticated Expo API route fixed by A2-4 must carry
 *              the canonical top-of-file `// [public]` marker, so a reviewer
 *              can tell intentional-by-design surfaces from missing auth.
 * Owner:       Coding model (test lane)
 * Status:      ACTIVE
 * Related (concrete paths):
 *   - AGENTS.md — declares the shop-catalog surface public by design
 *   - app/api/shop/list+api.ts — representative public catalog route
 * Last verified: 2026-10-17, coding model — D8-2 fixture pairing.
 * How to update: if a public route is added/removed, update EXPECTED_PUBLIC
 *   here in the same change; do not weaken the marker shape.
 *
 * D8-2 (vacuous-assertion-gate pattern): the detector below is exercised
 * against fixture pairs, not just the live tree — a healthy fixture is NOT
 * flagged, a faulty one IS, and a neutralized detector flips the faulty
 * outcome (proving the gate can actually fail).
 */
import fs from "fs";
import os from "os";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const MARKER = "// [public]";

const EXPECTED_PUBLIC = [
  "app/api/faqs+api.ts",
  "app/api/fleet/webhook+api.ts",
  "app/api/payment/bkash/confirm+api.ts",
  "app/api/payment/bkash/create+api.ts",
  "app/api/ride/[id]/track+api.ts",
  "app/api/shop/[id]+api.ts",
  "app/api/shop/list+api.ts",
  "app/api/shop/products+api.ts",
  "app/api/shop/types+api.ts",
];

/** The detector: rel paths under `root` whose content lacks the marker. */
function findUnmarked(root: string, rels: string[], marker: string = MARKER): string[] {
  return rels.filter((rel) => {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    return !text.startsWith(marker);
  });
}

describe("public-route markers (meta)", () => {
  it("every A2-4 public surface carries the canonical top-of-file marker", () => {
    expect(findUnmarked(ROOT, EXPECTED_PUBLIC)).toEqual([]);
  });
});

describe("public-route markers — fixture pairs (D8-2, non-vacuity)", () => {
  let dir = "";
  const rels = ["a+api.ts", "sub/b+api.ts"];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "markers-"));
    fs.mkdirSync(path.join(dir, "sub"));
  });

  function write(rel: string, marked: boolean) {
    fs.writeFileSync(path.join(dir, rel), marked ? `${MARKER}\nexport {}` : `export {}`);
  }

  it("healthy fixture (all marked) is NOT flagged", () => {
    for (const rel of rels) write(rel, true);
    expect(findUnmarked(dir, rels)).toEqual([]);
  });

  it("faulty fixture (one unmarked) IS flagged", () => {
    write(rels[0], true);
    write(rels[1], false);
    expect(findUnmarked(dir, rels)).toEqual([rels[1]]);
  });

  it("neutralized detector flips the faulty outcome (gate is not vacuous)", () => {
    write(rels[0], true);
    write(rels[1], false);
    // Neutralization through the detector's own parameter: an empty marker
    // is a prefix of every file, so nothing can be flagged. The faulty
    // fixture from the test above must now come back clean — if it does
    // not, the pairing is broken, not the gate.
    expect(findUnmarked(dir, rels, "")).toEqual([]);
    // And the healthy fixture stays clean under the real marker (sanity
    // that the pair above measures the detector, not the fixtures).
    for (const rel of rels) write(rel, true);
    expect(findUnmarked(dir, rels)).toEqual([]);
  });
});
