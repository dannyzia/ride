/**
 * C2 riders (STAGE C2-FIX):
 * - C2-5: export scope aligned to the delete policy (shop/fleet/courier
 *   datasets join the customer-only export).
 * - C2-6: linked-accounts copy gains a dormant qualifier (Copy Truth).
 * - C2-7: share_usage_data default flagged to owner, not changed (pin).
 */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "sup-1" })),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn() },
}));

import { db } from "@/src/db";
import { POST as requestData } from "@/app/api/user/request-data+api";
import { GET as linkedAccounts } from "@/app/api/user/linked-accounts+api";

function queuedSelects(rows: unknown[][]) {
  let i = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.limit = async () => rows[i++] ?? [];
    return c;
  });
}

const req = () =>
  ({ headers: { get: () => "Bearer tok" } }) as unknown as Request;

describe("C2-5 export scope", () => {
  beforeEach(() => jest.clearAllMocks());

  it("includes shop / fleet / courier datasets alongside the customer ones", async () => {
    queuedSelects([
      [{ id: "u1" }], // users
      [], // rides
      [], // rider wallet txns
      [], // promos
      [], // driver (none → skips payments/subs/ledger)
      [{ id: "s1" }], // owned shops
      [{ id: "o1" }], // shop orders placed
      [{ fleet_id: "f1", user_id: "u1" }], // fleet memberships
      [{ id: "f1" }], // fleets
      [], // courier dues
      [], // courier earnings
    ]);
    const res = await requestData(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const key of [
      "profile",
      "rides",
      "wallet_transactions",
      "promo_redemptions",
      "shops",
      "shop_orders",
      "fleet_memberships",
      "fleets",
      "courier_remittance_dues",
      "delivery_earnings",
    ]) {
      expect(body).toHaveProperty(key);
    }
    expect(body.shops).toHaveLength(1);
    expect(body.fleet_memberships).toHaveLength(1);
  });
});

describe("C2-6 linked-accounts dormant qualifier", () => {
  beforeEach(() => jest.clearAllMocks());

  it("GET carries dormant:true and the screen renders the dormant copy", async () => {
    queuedSelects([[{ linked_accounts: [] }]]);
    const res = await linkedAccounts(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ linked_accounts: [], dormant: true });

    const fs = require("fs");
    const path = require("path");
    const screen: string = fs.readFileSync(
      path.join(__dirname, "../../../app/(main)/(customer)/(tabs)/settings/linked-accounts/index.tsx"),
      "utf8",
    );
    expect(screen).toContain("linked_accounts.add_account_dormant");
    const en = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../../i18n/locales/en/common.json"), "utf8"),
    );
    const bn = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../../i18n/locales/bn/common.json"), "utf8"),
    );
    expect(en.linked_accounts.add_account_dormant).toMatch(/coming soon/i);
    expect(typeof bn.linked_accounts.add_account_dormant).toBe("string");
  });
});

describe("C2-7 share_usage_data default", () => {
  it("default stays flagged-to-owner, unchanged (source pin)", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../../../app/api/user/data-controls+api.ts"),
      "utf8",
    );
    expect(src).toContain("C2-7");
    expect(src).toContain("share_usage_data: true");
  });
});
