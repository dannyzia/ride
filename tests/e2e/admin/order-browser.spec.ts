/**
 * Admin lane — marketplace order browser (plan 27 §7 A6 + A1).
 *
 * The state filters are the read-across contract: each one must reach the API
 * as its own query parameter. That assertion holds with an empty order table,
 * so it is not vacuous — it is exactly the "read-across with filters" claim.
 *
 * Force-cancel is asserted structurally: when the queue HAS a cancellable row,
 * its button must open the modal and the modal must refuse to submit without a
 * reason code (the A1 requirement). With no rows there is nothing to cancel, so
 * that half is guarded on a row existing — never asserted vacuously.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_ROUTES, openAdmin } from "./_auth";

test.describe("admin order browser", () => {
  test("state filters reach the API as query parameters", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/api/admin/marketplace/orders")) requested.push(url);
    });

    await openAdmin(page, ADMIN_ROUTES.orderBrowser);

    // The default view (all) loads the list.
    await expect.poll(() => requested.length, { timeout: 20_000 }).toBeGreaterThan(0);

    // The chips share one derived testID (a computed testID is invisible to the
    // manifest, so the codemod collapses `.map()` ids to a single literal) —
    // select by the chip's own label instead.
    await page.getByText("delivered", { exact: true }).first().click();
    await expect
      .poll(() => requested.some((u) => u.includes("status=delivered")), { timeout: 20_000 })
      .toBe(true);

    await page.getByText("cancelled", { exact: true }).first().click();
    await expect
      .poll(() => requested.some((u) => u.includes("status=cancelled")), { timeout: 20_000 })
      .toBe(true);
  });

  test("force-cancel opens a modal that will not submit without a reason code", async ({ page }) => {
    await openAdmin(page, ADMIN_ROUTES.orderBrowser);

    const forceCancel = page.getByTestId("admin.marketplace.orders.set-target").first();
    const hasRow = await forceCancel.isVisible().catch(() => false);
    test.skip(!hasRow, "no force-cancellable order in this environment");

    await forceCancel.click();
    await expect(page.getByText("Force cancel order", { exact: false })).toBeVisible();

    // Submitting with no code selected must NOT produce a successful response.
    let mutations = 0;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/admin/marketplace/orders")) {
        mutations++;
      }
    });
    await page.getByText("Force cancel", { exact: true }).last().click();
    await page.waitForTimeout(750);
    expect(mutations).toBe(0);

    // The modal is still open, still demanding a code.
    await expect(page.getByText("Force cancel order", { exact: false })).toBeVisible();
  });

  test("the browser settles into a decided state (rows or an explicit empty state)", async ({ page }) => {
    await openAdmin(page, ADMIN_ROUTES.orderBrowser);
    await expect(
      page
        .getByText(/no orders|none|empty/i)
        .or(page.getByRole("row"))
        .first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
