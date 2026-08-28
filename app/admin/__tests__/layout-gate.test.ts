/**
 * Integration check: Layout gate — admin role admission.
 *
 * Verifies the exact same logic used by app/admin/_layout.tsx:
 * (a) All 4 admin-family roles are admitted via ADMIN_ROLES.includes()
 * (b) Rider/driver roles are denied
 * (c) Error strings contain zero SQL text (DELETE/UPDATE/INSERT/SELECT)
 * (d) Error strings all contain "Contact the owner" guidance
 */

// Mock supabase to avoid env var requirements.
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: {}, from: jest.fn() },
}));
jest.mock('@/lib/supabaseServer', () => ({
  supabaseAdmin: {},
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { ADMIN_ROLES } from '@/lib/adminRbac';
import type { AdminRole } from '@/lib/auth';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── (a) Admin roles admitted ──

describe('Layout gate — role admission', () => {
  const ADMITTED_ROLES: string[] = ['owner', 'admin', 'ops_manager', 'moderator'];
  const DENIED_ROLES: string[] = ['rider', 'driver'];

  test.each(ADMITTED_ROLES)(
    'role "%s" is admitted by ADMIN_ROLES.includes()',
    (role) => {
      // This is the exact check in _layout.tsx:
      //   if (profile && ADMIN_ROLES.includes(profile.role as AdminRole))
      expect(ADMIN_ROLES.includes(role as AdminRole)).toBe(true);
    },
  );

  test.each(DENIED_ROLES)(
    'role "%s" is denied by ADMIN_ROLES.includes()',
    (role) => {
      // This is the exact check in _layout.tsx:
      //   if (profile && !ADMIN_ROLES.includes(profile.role as AdminRole))
      expect(ADMIN_ROLES.includes(role as AdminRole)).toBe(false);
    },
  );

  test('ADMIN_ROLES has exactly 4 entries', () => {
    expect(ADMIN_ROLES).toHaveLength(4);
    expect(ADMIN_ROLES.sort()).toEqual(['admin', 'moderator', 'ops_manager', 'owner'].sort());
  });
});

// ── (b) Error strings — no SQL, must have "Contact the owner" ──

describe('Layout gate — error string safety', () => {
  let layoutSource: string;

  beforeAll(() => {
    // Read the actual layout source file.
    const layoutPath = resolve(__dirname, '../_layout.tsx');
    layoutSource = readFileSync(layoutPath, 'utf-8');
  });

  test('layout source contains zero SQL DML statements', () => {
    // Must not contain any SQL that could demote roles or create accounts.
    const sqlPatterns = [
      /UPDATE\s+users\s+SET/i,
      /INSERT\s+INTO\s+users/i,
      /DELETE\s+FROM\s+users/i,
      /SELECT\s+\*\s+FROM\s+users/i,
    ];
    for (const pattern of sqlPatterns) {
      expect(layoutSource).not.toMatch(pattern);
    }
  });

  test('all non-admin error paths include "Contact the owner"', () => {
    // Every error message shown to denied users must guide them to the owner.
    // Count occurrences of the guidance text — one per error path.
    const ownerGuidance = 'Contact the owner to be granted panel access';
    const count = layoutSource.split(ownerGuidance).length - 1;
    // At least 5 error paths (Method 1 role mismatch, Method 2 role mismatch,
    // Method 2 not-in-DB, fallback RLS-blocked, fallback not-found).
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('layout uses ADMIN_ROLES.includes() for gate check', () => {
    // Verify the layout actually uses ADMIN_ROLES.includes() — not a hardcoded
    // "admin" string check.
    expect(layoutSource).toContain('ADMIN_ROLES.includes(profile.role as AdminRole)');
    expect(layoutSource).toContain('ADMIN_ROLES.includes(data.role)');
  });

  test('layout does not contain hardcoded role === "admin" gate', () => {
    // The old code had: if (profile?.role === "admin")
    // The new code uses: ADMIN_ROLES.includes(...)
    // Verify the old pattern is gone.
    const hardcodedAdminCheck = /profile\?\.role\s*===\s*["']admin["']/;
    expect(layoutSource).not.toMatch(hardcodedAdminCheck);

    const hardcodedDataCheck = /data\.role\s*===\s*["']admin["']/;
    expect(layoutSource).not.toMatch(hardcodedDataCheck);
  });
});

// ── (c) Method 2 fallback logic ──

describe('Layout gate — Method 2 server fallback', () => {
  let layoutSource: string;

  beforeAll(() => {
    const layoutPath = resolve(__dirname, '../_layout.tsx');
    layoutSource = readFileSync(layoutPath, 'utf-8');
  });

  test('Method 2 uses ADMIN_ROLES.includes() not hardcoded check', () => {
    // The server fallback path must also use ADMIN_ROLES.
    // Find the verify-token block and check it uses ADMIN_ROLES.
    const verifyTokenBlock = layoutSource.slice(
      layoutSource.indexOf('/api/auth/verify-token'),
      layoutSource.indexOf('/api/auth/verify-token') + 500,
    );
    expect(verifyTokenBlock).toContain('ADMIN_ROLES.includes(data.role)');
  });

  test('no self-registration SQL in Method 2 "not in DB" path', () => {
    // The "data.exists === false" path must NOT tell users to INSERT themselves.
    const notInDbPath = layoutSource.slice(
      layoutSource.indexOf('data.exists === false'),
      layoutSource.indexOf('data.exists === false') + 300,
    );
    expect(notInDbPath).not.toMatch(/INSERT/i);
    expect(notInDbPath).toContain('Contact the owner');
  });
});
