/** Type declarations for scripts/vacuous-assertion-scanner.js (CI gate core). */

export interface Violation {
  rule: string;
  file: string;
  line: number;
  snippet: string;
}

export declare const PATTERNS: ReadonlyArray<{
  rule: string;
  re: RegExp;
  /** Optional negation: when it returns true the match is NOT a violation. */
  except?: (match: RegExpMatchArray) => boolean;
}>;

export declare const DEFAULT_ROOTS: readonly string[];

/** Files exempt from scanPaths (the gate's own rule-set meta-test). */
export declare const GATE_SELF_FILES: ReadonlySet<string>;

export declare function isTestFile(relPath: string): boolean;

/**
 * Strips trailing // comments with a quote-aware scan ('//' inside string
 * literals is preserved; block-comment lines are dropped by the caller).
 */
export declare function stripComments(line: string): string;

export declare function scanContent(file: string, content: string): Violation[];

export declare function collectTestFiles(roots: string[]): string[];

export declare function scanPaths(roots: string[]): Violation[];
