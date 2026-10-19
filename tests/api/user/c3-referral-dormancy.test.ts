/**
 * C3-2 (STAGE C3-FIX, ruled): referral entry points dormant with
 * "coming soon" copy (F-26 pattern) on both customer + driver surfaces.
 * The write-less pipeline stays schema-only (P5, post-launch): the dormant
 * screens issue no API calls, no share intents, no code display — and the
 * retired referral.* keys are purged from both locales (not orphaned).
 */
describe("C3-2 referral dormancy", () => {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const root = path.join(__dirname, "../../..");
  const en = JSON.parse(
    fs.readFileSync(path.join(root, "i18n/locales/en/common.json"), "utf8"),
  ) as Record<string, Record<string, string>>;
  const bn = JSON.parse(
    fs.readFileSync(path.join(root, "i18n/locales/bn/common.json"), "utf8"),
  ) as Record<string, Record<string, string>>;
  const read = (rel: string) =>
    fs.readFileSync(path.join(root, rel), "utf8") as string;

  it("coming-soon copy lives in both locales (F-26 pattern)", () => {
    expect(en.referral.coming_soon).toMatch(/coming soon/i);
    expect(bn.referral.coming_soon).toBeTruthy();
    expect(en.referral.title).toBeTruthy();
    expect(bn.referral.title).toBeTruthy();
  });

  it("retired referral.* keys are purged, not orphaned", () => {
    const retired = [
      "share_reward", "share_message", "your_code", "no_code", "share",
      "copy", "copied", "invited", "successful", "earned", "recent",
      "recent_empty", "no_referrals", "no_referrals_sub", "load_failed",
      "unknown", "rewarded", "pending",
    ];
    for (const key of retired) {
      expect(en.referral[key]).toBeUndefined();
      expect(bn.referral[key]).toBeUndefined();
    }
    expect(Object.keys(en.referral).sort()).toEqual(["coming_soon", "title", "toggle_theme"]);
  });

  it("customer referral screen is write-less and shows the dormant copy", () => {
    const src = read("app/(main)/(customer)/(tabs)/referral/index.tsx");
    expect(src).not.toContain("/api/user/referral");
    expect(src).not.toContain("Share.share");
    expect(src).not.toContain("expo-clipboard");
    expect(src).toContain("referral.coming_soon");
    expect(src).toMatch(/disabled/);
  });

  it("driver referral screen is write-less and shows the dormant copy", () => {
    const src = read("app/(main)/(rider)/referral/index.tsx");
    expect(src).not.toContain("/api/user/referral");
    expect(src).not.toContain("sms:?body=");
    expect(src).not.toContain("expo-clipboard");
    expect(src).toContain("referral.coming_soon");
    expect(src).toMatch(/disabled/);
  });

  it("the referral API stays read-only (GET only — pipeline is schema-only)", () => {
    const src = read("app/api/user/referral+api.ts");
    expect(src).toContain("export async function GET");
    expect(src).not.toContain("export async function POST");
    expect(src).not.toContain("export async function PUT");
    expect(src).not.toContain("export async function PATCH");
  });
});

describe("C3-9 F-10 copy tracks the 48h server truth", () => {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const root = path.join(__dirname, "../../..");
  const read = (rel: string) =>
    fs.readFileSync(path.join(root, rel), "utf8") as string;

  it("USER-FLOWS F-10 promises 48h, matching the fare-dispute gate", () => {
    expect(read("docs/FeatureList/USER-FLOWS.md")).toContain("available 48h after ride");
    expect(read("docs/FeatureList/USER-FLOWS.md")).not.toContain("available 24h after ride");
    expect(read("docs/FeatureList/USER-FLOWS.html")).toContain("available 48h after ride");
    // Server truth pins, unchanged:
    expect(read("app/api/rider/fare-disputes+api.ts")).toContain("48 hours");
    expect(read("app/(main)/(customer)/ride-detail/[ride_id].tsx")).toContain("DISPUTE_WINDOW_MS = 172800000");
  });
});
