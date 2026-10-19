/**
 * **Purpose:**     Client-safe launch_free plan identity. The ONLY module that
 *                  defines the stable machine code — importable from screens
 *                  (no DB/driver imports, safe for the mobile bundle).
 * **Owner:**       Coding model — keep in sync with lib/launchFreeSubscription.ts
 * **Status:**      ACTIVE
 * **Related (concrete paths):**
 *   - lib/launchFreeSubscription.ts — server grant path (re-exports the code)
 *   - src/db/migrations/0081_packages_code.sql — `packages.code` column + backfill
 *   - app/api/package/active+api.ts — serves `package_code` to clients
 * **Last verified:** 2026-10-17, by coding model (created for C10-1).
 * **How to update:** the code value is stable — never change it. The display
 *                    NAME lives in launchFreeSubscription.ts and is admin-editable.
 */

/**
 * Stable machine identity of the launch_free plan (`packages.code`).
 * Clients match on THIS, never on the admin-editable display name.
 */
export const LAUNCH_FREE_PACKAGE_CODE = "launch_free";
