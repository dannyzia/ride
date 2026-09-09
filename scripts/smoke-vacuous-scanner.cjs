/**
 * Mutation/sentinel smoke for the vacuous-assertion scanner (development aid).
 * Run: node scripts/smoke-vacuous-scanner.cjs   (expects all PASS, exit 0)
 */
'use strict';
const { scanContent, stripComments, isTestFile } = require('./vacuous-assertion-scanner.js');

let failures = 0;
const t = (name, cond) => {
  if (!cond) failures++;
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name);
};

// — V1 —
t('V1 expect(true).toBe(true)', scanContent('x', 'expect(true).toBe(true);').length === 1);
t('V1 expect(false).toBe(false)', scanContent('x', 'expect(false).toBe(false);').length === 1);
t('V1 expect(51).toBe(51)', scanContent('x', 'expect(51).toBe(51);').length === 1);
t('V1 decimal expect(9.5).toBe(9.5)', scanContent('x', 'expect(9.5).toBe(9.5);').length === 1);
t('V1 expect(true).toBe(false) allowed', scanContent('x', 'expect(true).toBe(false);').length === 0);
t('V1 expect(1).toBe(2) allowed', scanContent('x', 'expect(1).toBe(2);').length === 0);
t('toStrictEqual same literal caught', scanContent('x', 'expect(true).toStrictEqual(true);').length === 1);

// — V2 —
t('V2 expect(51).toBeDefined()', scanContent('x', 'expect(51).toBeDefined();').length === 1);
t('V2 expect("x").toBeTruthy()', scanContent('x', 'expect("x").toBeTruthy();').length === 1);
t("V2 expect('x').toBeDefined()", scanContent("x", "expect('x').toBeDefined();").length === 1);
t('V2 expect(0).toBeTruthy() allowed (not always-pass)', scanContent('x', 'expect(0).toBeTruthy();').length === 0);

// — Allowed patterns (false-positive resistance) —
t('variable-based allowed', scanContent('x', 'const x = true; expect(x).toBe(true);').length === 0);
t('expect(highIntensity).toBe(false) allowed', scanContent('x', 'expect(highIntensity).toBe(false);').length === 0);
t('expect(rows).toBeTruthy() allowed', scanContent('x', 'expect(rows).toBeTruthy();').length === 0);
t('expect(x).toBeDefined() on variable allowed', scanContent('x', 'expect(rows).toBeDefined();').length === 0);

// — Comment handling —
t('line comment allowed', scanContent('x', '// expect(true).toBe(true) here').length === 0);
t('block-comment interior allowed', scanContent('x', ' * Replaces the vacuous `expect(51).toBeDefined()` pattern').length === 0);
t('block-comment opener allowed', scanContent('x', '/* expect(true).toBe(true) */').length === 0);
t('trailing comment stripped then caught', scanContent('x', 'expect(true).toBe(true); // placeholder').length === 1);
t('url string survives strip', stripComments('const u = "https://x.test//y"; // c') === 'const u = "https://x.test//y"; ');
t("url // inside string not treated as comment", scanContent('x', 'const url = "http://a//b"; expect(true).toBe(true);').length === 1);

// — Classifier —
t('isTestFile *.test.ts', isTestFile('tests/api/x.test.ts') === true);
t('isTestFile *.spec.tsx', isTestFile('app/y.spec.tsx') === true);
t('isTestFile __tests__ dir', isTestFile('lib/__tests__/y.ts') === true);
t('isTestFile plain ts', isTestFile('src/db/schema.ts') === false);
t('isTestFile fixture (not test)', isTestFile('tests/fixtures/data.ts') === false);

process.exit(failures === 0 ? 0 : 1);
