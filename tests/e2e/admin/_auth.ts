/**
 * Shared guard for the Playwright admin lane (plan 27 §7 A6).
 *
 * The lane is opt-in and MUST NOT report a false green: without a reachable app
 * and an authenticated admin session there is nothing to assert, so these
 * helpers fail with a precise, actionable message instead of skipping.
 *
 * The shell anchor is the sidebar brand every admin screen renders ("Ride
 * Admin") — no new testID was added to components/admin/AdminShell.tsx for the
 * lane, because a dotted testID there would sit outside the testID map's app/
 * scan and only exist to serve a test.
 */
import { expect, type Page } from "@playwright/test";

export const ADMIN_ROUTES = {
  verification: "/admin/verification",
  vehicleTypeChanges: "/admin/vehicle-type-changes",
  orderBrowser: "/admin/marketplace/orders",
  monitoring: "/admin/monitoring",
} as const;

/**
 * Navigate to an admin screen and assert the shell rendered. A login wall or a
 * blank bundle is a configuration failure, not a test failure, and says so.
 */
export async function openAdmin(page: Page, route: string): Promise<void> {
  const res = await page.goto(route, { waitUntil: "domcontentloaded" });
  if (!res) {
    throw new Error(
      `[admin-lane] no response for ${route}. Is the web app running and ADMIN_BASE_URL correct?`,
    );
  }
  if (res.status() >= 400) {
    throw new Error(`[admin-lane] ${route} returned HTTP ${res.status()}.`);
  }
  // Rendered by every admin screen's sidebar; its absence means we are on the
  // login screen (no session) or the bundle failed to evaluate.
  await expect(
    page.getByText("Ride Admin", { exact: false }).first(),
    `[admin-lane] ${route} did not render the admin shell — is ADMIN_STORAGE_STATE a live admin session?`,
  ).toBeVisible({ timeout: 20_000 });
}
