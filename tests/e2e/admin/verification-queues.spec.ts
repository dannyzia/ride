/**
 * Admin lane — verification queues (plan 27 §7 A6).
 *
 * Admin copy is English-only by convention: assertions here are English literals
 * on purpose, and there are no locale keys for admin surfaces.
 *
 * Each case asserts the SCREEN ISSUES THE RIGHT REQUEST and renders a decided
 * state — that is a real behavioural claim that holds with an empty queue, so
 * the lane is not silently vacuous when no applicant is pending.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_ROUTES, openAdmin } from "./_auth";

test.describe("admin verification queues", () => {
  test("shop / fleet / delivery-man tabs each drive their own queue request", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/api/admin/verification/pending")) requested.push(url);
    });

    await openAdmin(page, ADMIN_ROUTES.verification);

    // Shops is the landing tab.
    await expect.poll(() => requested.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(requested.some((u) => u.includes("kind=shop"))).toBe(true);

    await page.getByText("Fleets", { exact: true }).first().click();
    await expect
      .poll(() => requested.some((u) => u.includes("kind=fleet")), { timeout: 20_000 })
      .toBe(true);

    await page.getByText("Delivery Men", { exact: true }).first().click();
    await expect
      .poll(() => requested.some((u) => u.includes("kind=delivery_man")), { timeout: 20_000 })
      .toBe(true);
  });

  test("the queue settles into a decided state (rows or an explicit empty state)", async ({ page }) => {
    await openAdmin(page, ADMIN_ROUTES.verification);

    // Either applicant rows rendered, or the screen states there are none.
    // A spinner that never resolves fails both and is the real regression.
    await expect(
      page
        .getByText(/no |none|empty|waiting|pending applicants/i)
        .or(page.getByRole("row"))
        .first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
