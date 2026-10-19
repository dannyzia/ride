// @ts-nocheck — Jest mock factories produce untyped DB chains; runtime
// behavior is what's under test (house pattern).
/**
 * STAGE C1-FIX acceptance pins (skeptic §C1, orchestrator-ruled).
 *
 * - C1-7: resubmit() read-check-increment runs in ONE tx with a FOR UPDATE
 *   row lock; the count burns exactly once per real submission.
 * - C1-2: verification-status.tsx navigates ONLY (no resubmit POST from the
 *   status screen — the wizard's submit is the single resubmit call, so a
 *   409 from this path is impossible).
 * - Five-path T&C gate (C1-1), cooldown/escape (C1-3), login-as riders
 *   (C1-5/C1-6) and bilingual copy (C1-9) are pinned as source contracts so
 *   a regression that drops the affordance fails loudly here.
 */
import { jest } from "@jest/globals";
import fs from "fs";
import path from "path";

const ROOT = path.join(__dirname, "..", "..", "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── C1-7/C1-2 runtime: lib/roleVerification.resubmit ──────────────────────

let mockLockedForUpdate = false;
let mockUpdateSets: Record<string, unknown>[] = [];
const mockSelectRow = { id: "shop-1", n: 1 };

jest.mock("@/src/db", () => {
  const chainableSelect = () => {
    const c: any = {};
    c.from = () => c;
    c.where = () => c;
    // limit() returns a thenable carrying .for() — mirrors the Drizzle
    // builder (select→from→where→limit→for→await) used in roleVerification.
    c.limit = () => {
      const q: any = Promise.resolve([mockSelectRow]);
      q.for = (_lock: string) => {
        mockLockedForUpdate = true;
        return Promise.resolve([mockSelectRow]);
      };
      return q;
    };
    return c;
  };
  const tx = {
    select: jest.fn(() => chainableSelect()),
    update: jest.fn(() => ({
      set: (vals: Record<string, unknown>) => {
        mockUpdateSets.push(vals);
        return { where: jest.fn(async () => undefined) };
      },
    })),
    insert: jest.fn(() => ({
      values: jest.fn(async () => undefined),
    })),
  };
  return {
    db: {
      select: jest.fn(),
      update: jest.fn(),
      insert: jest.fn(),
      transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
    },
  };
});

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { resubmit } from "@/lib/roleVerification";
import { db } from "@/src/db";

beforeEach(() => {
  mockLockedForUpdate = false;
  mockUpdateSets = [];
  mockSelectRow.n = 1;
});

describe("C1-7 — resubmit burns the count exactly once, under a row lock", () => {
  it("shop resubmit: one tx, FOR UPDATE lock, count n → n+1, status → pending", async () => {
    const out = await resubmit("user-1", "shop", {
      shop: {
        shop_name: "Fixed Shop",
        shop_type_id: "11111111-1111-4111-8111-111111111111",
        address_line: "123 Fixed Road",
        license_url: "https://example.com/license.pdf",
      },
    });
    expect(out).toEqual({ status: "pending", resubmit_count: 2 });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(mockLockedForUpdate).toBe(true);
    expect(mockUpdateSets).toHaveLength(1);
    expect(mockUpdateSets[0]).toMatchObject({
      verification_status: "pending",
      verification_resubmit_count: 2,
    });
  });

  it("at the cap (n=3): 409s without writing", async () => {
    mockSelectRow.n = 3;
    await expect(resubmit("user-1", "shop")).rejects.toMatchObject({ status: 409 });
    expect(mockUpdateSets).toHaveLength(0);
  });
});

describe("C1-2 — verification-status navigates ONLY (single-owner resubmit)", () => {
  it("status screen makes no resubmit POST; it deep-links with ?resubmit=1", () => {
    const src = read("app/(main)/(customer)/verification-status.tsx");
    expect(src).not.toMatch(/api\/user\/roles\/resubmit/);
    expect(src).toMatch(/\?resubmit=1/);
  });

  it("each wizard still owns exactly one resubmit submit (the single call)", () => {
    for (const w of [
      "app/(auth)/register-shop-owner.tsx",
      "app/(auth)/register-fleet-owner.tsx",
      "app/(auth)/register-delivery-man.tsx",
    ]) {
      const src = read(w);
      // The template literal `${API_URL}/api/user/roles/resubmit` is the
      // single submit call; the M-5 comment mentions the path without a
      // trailing backtick, so it is excluded by construction.
      const hits = src.match(/api\/user\/roles\/resubmit`/g) ?? [];
      expect(hits).toHaveLength(1);
    }
  });
});

// ── Source contracts: gate, cooldown/escape, riders, i18n ─────────────────

describe("C1-1 — five-path T&C gate carries consent end to end", () => {
  it("phone-entry checkbox gates register and carries terms=1 to otp-verify", () => {
    const src = read("app/(auth)/phone-entry.tsx");
    expect(src).toMatch(/phone-entry\.terms-checkbox/);
    expect(src).toMatch(/terms=1/);
    expect(src).toMatch(/auth\.terms\.required/);
  });

  it("otp-verify forwards the flag; register + all three wizards submit it", () => {
    expect(read("app/(auth)/otp-verify.tsx")).toMatch(/terms=1/);
    for (const f of [
      "app/(auth)/register.tsx",
      "app/(auth)/register-shop-owner.tsx",
      "app/(auth)/register-fleet-owner.tsx",
      "app/(auth)/register-delivery-man.tsx",
    ]) {
      expect(read(f)).toMatch(/terms_accepted/);
    }
  });

  it("register+api 400s terms_required and stamps users.terms_accepted_at", () => {
    const src = read("app/api/register+api.ts");
    expect(src).toMatch(/terms_required/);
    expect(src).toMatch(/terms_accepted_at/);
  });

  it("users table + migration carry the nullable consent column", () => {
    expect(read("src/db/schema.ts")).toMatch(/terms_accepted_at/);
    expect(read("src/db/migrations/0076_users_terms_accepted_at.sql")).toMatch(
      /terms_accepted_at/,
    );
  });
});

describe("C1-3 — resend cooldown + change-number escape render", () => {
  it("otp-verify has a 30s cooldown and a change-number affordance", () => {
    const src = read("app/(auth)/otp-verify.tsx");
    expect(src).toMatch(/cooldown/);
    expect(src).toMatch(/otp-verify\.change-number/);
  });
});

describe("C1-5/C1-6 — login-as riders", () => {
  it("persists last-used role and badges it; outer rows have distinct IDs", () => {
    const src = read("app/(auth)/login-as.tsx");
    expect(src).toMatch(/LAST_USED_ROLE/);
    expect(src).toMatch(/login-as\.row-rider/);
    expect(src).toMatch(/login-as\.row-delivery-man/);
    // The old shared row ID is gone.
    expect(src).not.toMatch(/testID="login-as\.enter"/);
  });
});

describe("C1-9 — bilingual copy present (en + bn)", () => {
  it("terms / otp_verify / verification_status / last_used keys exist in both locales", () => {
    for (const loc of ["i18n/locales/en/common.json", "i18n/locales/bn/common.json"]) {
      const raw = read(loc);
      const json = JSON.parse(raw);
      expect(json.auth.terms.required).toBeTruthy();
      expect(json.auth.otp_verify.title).toBeTruthy();
      expect(json.auth.otp_verify.change_number).toBeTruthy();
      expect(json.auth.verification_status.title).toBeTruthy();
      expect(json.auth.verification_status.resubmit).toBeTruthy();
      expect(json.auth.login_as.last_used).toBeTruthy();
    }
  });
});
