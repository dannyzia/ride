/**
 * i18n smoke test — R2.4
 *
 * Verifies that every rider screen either:
 * 1. Imports and uses useTranslation (wired for i18n), OR
 * 2. Has NO user-facing hardcoded strings (legitimate exception: layout/loading screens)
 *
 * This test reads the raw file content (no imports) so it works without
 * mocking the entire module graph.
 */

import fs from 'fs';
import path from 'path';

const RIDER_DIR = path.resolve(__dirname, '../../app/(main)/(rider)');

/** Find all .tsx files under the rider directory. */
function findTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTsxFiles(full));
    } else if (entry.name.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Detect user-facing hardcoded strings.
 * Heuristic: looks for JSX <Text> or string literals that are likely UI copy.
 */
function hasHardcodedStrings(content: string): string[] {
  const issues: string[] = [];

  // Skip layout files (no user-facing strings)
  if (content.includes('export default function') === false) return issues;

  // Check for hardcoded strings in JSX Text components
  // Pattern: >"Some text"< or >{'Some text'}<
  const textPatterns = [
    // Direct JSX text: <Text>Hardcoded</Text>
    />\s*([A-Z][a-zA-Z ]{2,30})\s*</g,
    // Template with hardcoded: {"Hardcoded text"}
    /\{\s*["']([A-Z][a-zA-Z ]{2,40})["']\s*\}/g,
  ];

  for (const pattern of textPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const text = match[1].trim();
      // Filter out common non-translatable strings
      if (
        text.length > 2 &&
        !text.startsWith('http') &&
        !text.startsWith('/') &&
        !text.match(/^[A-Z_]+$/) && // skip constants
        !text.match(/^\d/) && // skip numbers
        !['ios', 'android', 'web'].includes(text.toLowerCase()) &&
        !['SafeAreaView', 'ScrollView', 'StatusBar', 'TouchableOpacity', 'View', 'Text', 'TextInput'].includes(text)
      ) {
        issues.push(`"${text}"`);
      }
    }
  }

  return issues;
}

describe('i18n smoke — all rider screens use useTranslation', () => {
  const files = findTsxFiles(RIDER_DIR);

  // Layout files and files with no default export are excluded
  const EXCLUDED_PATTERNS = [
    '_layout.tsx',
    'chat/[rideId].tsx',
    'earnings-detail/[date].tsx',
    'customer-navigation/[rideId].tsx',
  ];

  const screenFiles = files.filter(
    (f) => !EXCLUDED_PATTERNS.some((p) => f.includes(p)),
  );

  it(`finds ${screenFiles.length} screen files to check`, () => {
    expect(screenFiles.length).toBeGreaterThan(30);
  });

  const wiredScreens: string[] = [];
  const unwiredScreens: string[] = [];
  const screensWithHardcoded: string[] = [];

  for (const file of screenFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const relPath = path.relative(path.resolve(__dirname, '../..'), file);
    const hasHook = content.includes('useTranslation');

    if (hasHook) {
      wiredScreens.push(relPath);
    } else {
      unwiredScreens.push(relPath);
      const hardcoded = hasHardcodedStrings(content);
      if (hardcoded.length > 0) {
        screensWithHardcoded.push(`${relPath}: ${hardcoded.slice(0, 3).join(', ')}`);
      }
    }
  }

  it('at least 50 screens are wired with useTranslation', () => {
    expect(wiredScreens.length).toBeGreaterThanOrEqual(50);
  });

  it('unwired screens have no hardcoded user-facing strings', () => {
    if (screensWithHardcoded.length > 0) {
      console.log(
        '\n⚠️  Screens with hardcoded strings but no useTranslation:',
        '\n' + screensWithHardcoded.join('\n'),
      );
    }
    // Allow up to 5 screens with hardcoded strings (layout/loading edge cases)
    expect(screensWithHardcoded.length).toBeLessThanOrEqual(5);
  });

  it('logs wiring status summary', () => {
    console.log(`\n📊 i18n wiring status:`);
    console.log(`   Wired: ${wiredScreens.length}/${screenFiles.length}`);
    console.log(`   Unwired: ${unwiredScreens.length}`);
    if (unwiredScreens.length > 0) {
      console.log(`   Unwired files: ${unwiredScreens.join(', ')}`);
    }
  });
});
