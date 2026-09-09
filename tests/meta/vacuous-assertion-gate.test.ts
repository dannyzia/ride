/**
 * Meta gate: vacuous placeholder assertions must not land in test files.
 *
 * Purpose:     Fails the jest suite itself when any test file contains an
 *              assertion that cannot fail (expect(true).toBe(true),
 *              expect(N).toBeDefined(), etc.). Runs the same scanner as the
 *              pre-commit hook and `npm run check:vacuous`, so the rule is
 *              enforced at three levels: edit-time (hook), CI/test-time (this),
 *              and ad-hoc (CLI). Born from the 2026-09-08/09 staleness audits —
 *              placeholder tests kept passing while pinning nothing.
 * Owner:       Coding model (test lane)
 * Status:      ACTIVE
 * Related (concrete paths):
 *   - scripts/vacuous-assertion-scanner.js — rule set + scan core
 *   - scripts/check-vacuous-assertions.js — CLI (--staged mode feeds the pre-commit hook)
 *   - scripts/smoke-vacuous-scanner.cjs — dev smoke (not part of the jest suite)
 *   - scripts/git-hooks/pre-commit — commit-time fence
 * Last verified: 2026-09-09, coding model — mutation check: a planted vacuous
 *   test trips this gate; the same scan is green on the cleaned tree.
 * How to update: new always-pass assertion classes go into PATTERNS in the
 *   scanner first, then get a sentinel case here. Never weaken a rule without
 *   recording why.
 */

import {
  scanContent,
  scanPaths,
  DEFAULT_ROOTS,
  GATE_SELF_FILES,
} from '../../scripts/vacuous-assertion-scanner';

describe('vacuous-assertion gate (meta)', () => {
  describe('full-tree scan (the actual gate)', () => {
    it('all test files in the repo are free of vacuous assertions', () => {
      const violations = scanPaths([...DEFAULT_ROOTS]);
      expect(violations).toEqual([]);
    });
  });

  describe('rule set sentinels (each rule must trip its fixture)', () => {
    const flagged = (line: string) => scanContent('fixture.test.ts', line);
    const notFlagged = (line: string) => expect(scanContent('fixture.test.ts', line)).toEqual([]);

    it('V1: expect(<literal>).toBe(<same literal>) is flagged', () => {
      expect(flagged('expect(true).toBe(true);')).toHaveLength(1);
      expect(flagged('expect(false).toBe(false);')).toHaveLength(1);
      expect(flagged('expect(51).toBe(51);')).toHaveLength(1);
      expect(flagged('expect(9.5).toBe(9.5);')).toHaveLength(1);
      expect(flagged('expect(true).toStrictEqual(true);')[0].rule).toBe('V1-same-literal');
    });

    it('V1: differing literals are NOT flagged (strict, can fail)', () => {
      notFlagged('expect(true).toBe(false);');
      notFlagged('expect(1).toBe(2);');
    });

    it('V2a: expect(<literal>).toBeDefined() is flagged (nothing literal is undefined)', () => {
      expect(flagged('expect(51).toBeDefined();')).toHaveLength(1);
      expect(flagged('expect(false).toBeDefined();')).toHaveLength(1);
      expect(flagged('expect("x").toBeDefined();')[0].rule).toBe('V2-toBeDefined-literal');
    });

    it('V2b: expect(<truthy literal>).toBeTruthy() is flagged; falsy literals are not (strict)', () => {
      expect(flagged('expect(true).toBeTruthy();')).toHaveLength(1);
      expect(flagged('expect(1).toBeTruthy();')).toHaveLength(1);
      expect(flagged('expect("x").toBeTruthy();')).toHaveLength(1);
      // false / 0 / '' can only FAIL toBeTruthy — strict, not vacuous:
      notFlagged('expect(false).toBeTruthy();');
      notFlagged('expect(0).toBeTruthy();');
      notFlagged("expect('').toBeTruthy();");
    });

    it('variable-based assertions are never flagged (only literals are vacuous by shape)', () => {
      notFlagged('const x = true; expect(x).toBe(true);');
      notFlagged('expect(highIntensity).toBe(false);');
      notFlagged('expect(rows).toBeTruthy();');
      notFlagged('expect(rows).toBeDefined();');
    });

    it('comments mentioning the patterns are not flagged (the gate is comment-blind)', () => {
      notFlagged('// expect(true).toBe(true)');
      notFlagged(' * Replaces the vacuous `expect(51).toBeDefined()` pattern');
      notFlagged('/* expect(true).toBe(true) */');
      // …but a trailing comment does not hide a real violation:
      expect(flagged('expect(true).toBe(true); // placeholder')).toHaveLength(1);
    });

    it("'//' inside string literals is not treated as a comment boundary", () => {
      expect(flagged('const url = "http://a//b"; expect(true).toBe(true);')).toHaveLength(1);
      expect(scanContent('f', 'const u = "https://x.test//y"; // comment')).toEqual([]);
    });

    it('this meta file is the single scanPaths exemption (self-exclusion is scoped to the gate itself)', () => {
      expect([...GATE_SELF_FILES]).toEqual(['tests/meta/vacuous-assertion-gate.test.ts']);
    });
  });
});
