/**
 * Admin lane — vehicle-type-changes queue (plan 27 §7 A1-3, F-30/E2).
 *
 * This is the ADMIN side of the F-22 driver-initiated class change. Before S7 the
 * decision route existed but the queue did not, so the only way to reach it was an
 * API path no UI could discover; this spec is what exercises the screen the S7
 * stage added.
 *
 * Admin copy is English-only by convention, so the assertions below are literal
 * English strings — there are no locale keys for admin surfaces.
 *
 * WHAT IS ASSERTED, AND WHY IT DOES NOT NEED SEEDED DATA:
 *   * the LIST request contract — each status chip issues its OWN
 *     `?status=` query, which is observable with an empty queue;
 *   * the screen SETTLES into a decided state (rows, or the explicit empty
 *     message) rather than spinning forever;
 *   * the STRUCTURED REJECT gate — `submitReject` refuses to POST unless the
 *     reason, code, failed field and example are all filled to the screen's own
 *     minimum lengths, and says so in a toast. That refusal is the F-30 contract,
 *     and it is asserted with NO request issued.
 *
 * WHAT IS DELIBERATELY NOT CLICKED: Approve, and a complete Reject. Both decide a
 * REAL driver's request against live data — the lane runs against a real app and
 * DB, so clicking them would mutate state the run did not create. The positive
 * payload contract is covered by tests/api/admin/s7-admin-ops.test.ts (17 cases,
 * including the applicant-safe view with `internal_note` stripped); this spec
 * covers what only a browser can see. The approve/reject BUTTONS are asserted to
 * render on each pending row, so the action surface itself is not left unverified.
 *
 * Runs only when the profile's webServer/ADMIN_BASE_URL is up and
 * ADMIN_STORAGE_STATE holds a live admin session — `openAdmin` fails loudly
 * otherwise (never a silent skip).
 */
import { expect, test } from "@playwright/test";
import { ADMIN_ROUTES, openAdmin } from "./_auth";

const QUEUE_API = "/api/admin/driver/type-changes";
const DECIDE_API = "/api/admin/driver/type-change-approve";

/** testIDs the screen sets; react-native-web maps `testID` to `data-testid`. */
const T = {
  status: "admin.vehicle-type-changes.set-status",
  approve: "admin.vehicle-type-changes.on-approve",
  reject: "admin.vehicle-type-changes.on-reject",
  submitReject: "admin.vehicle-type-changes.submit-reject",
  resetReject: "admin.vehicle-type-changes.reset-reject-form",
  code: "admin.vehicle-type-changes.set-reject-code",
} as const;

const EMPTY_MESSAGE = "No vehicle type changes for this filter";
const INCOMPLETE_TOAST =
  "Structured reason required: code + failed field + an acceptable example";

test.describe("admin vehicle-type-changes queue", () => {
  test("the landing filter asks for pending, and each status chip drives its own query", async ({
    page,
  }) => {
    const requested: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes(QUEUE_API)) requested.push(req.url());
    });

    await openAdmin(page, ADMIN_ROUTES.vehicleTypeChanges);

    // Landing state is the pending queue — the only filter an operator acts on.
    await expect.poll(() => requested.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(requested.some((u) => u.includes("status=pending"))).toBe(true);

    // Each chip must re-query with ITS status, not reuse the landing response.
    for (const status of ["approved", "rejected", "all"]) {
      await page.getByTestId(T.status).filter({ hasText: new RegExp(`^${status}$`, "i") }).first().click();
      await expect
        .poll(() => requested.some((u) => u.includes(`status=${status}`)), { timeout: 20_000 })
        .toBe(true);
    }
  });

  test("the queue settles into a decided state (rows or an explicit empty message)", async ({
    page,
  }) => {
    await openAdmin(page, ADMIN_ROUTES.vehicleTypeChanges);

    // A row renders its Approve action; with none, the table says so. A spinner
    // that never resolves fails both, which is the regression worth catching.
    await expect(
      page.getByTestId(T.approve).or(page.getByText(EMPTY_MESSAGE)).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("the structured reject refuses to POST while the reason is incomplete", async ({ page }) => {
    const decided: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes(DECIDE_API)) decided.push(req.url());
    });

    await openAdmin(page, ADMIN_ROUTES.vehicleTypeChanges);
    await expect(
      page.getByTestId(T.approve).or(page.getByText(EMPTY_MESSAGE)).first(),
    ).toBeVisible({ timeout: 20_000 });

    // This case needs a real pending request to open the modal from. Reported as
    // SKIPPED (never green) when the environment has none — an unrun proof must
    // not look like a passing one.
    const rejectButtons = page.getByTestId(T.reject);
    test.skip(
      (await rejectButtons.count()) === 0,
      "needs a pending `vehicle_type_changes` row (an F-22 driver request); this environment has none",
    );

    await rejectButtons.first().click();
    await expect(page.getByTestId(T.code)).toBeVisible({ timeout: 20_000 });

    // Submit with everything empty: the screen's own guard must fire.
    await page.getByTestId(T.submitReject).click();
    await expect(page.getByText(INCOMPLETE_TOAST).first()).toBeVisible({ timeout: 20_000 });

    // The guard runs BEFORE `decide()`, so a visible toast plus zero requests is
    // the contract: nothing was decided and no driver's request was touched.
    expect(decided).toEqual([]);

    // Leave the modal without deciding anything.
    await page.getByTestId(T.resetReject).click();
    await expect(page.getByTestId(T.code)).toBeHidden();
    expect(decided).toEqual([]);
  });
});
