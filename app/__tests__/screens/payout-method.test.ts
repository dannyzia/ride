/**
 * T1 (D10): payout-method management screen — contract guards.
 *
 * Source-scan tier: the screen file is read as text (no module graph) so the
 * assertions hold without mocking RN/Supabase. Guards the wiring the payout
 * API depends on:
 *  - PATCH and DELETE both target the `?id=` query-param contract
 *  - phone-format enforcement (^01\d{9}$) happens before POST/PATCH
 *  - the delete confirm dialog carries the auto-promotion copy when the
 *    method is the default (server promotes the newest remaining method)
 *  - every t('...') literal on the screen resolves in BOTH locale files
 *
 * Logic tier: the phone regex and maskAccount are extracted following the
 * find-customer.test.ts convention (copy the core logic, then exercise it).
 */

import fs from "fs";
import path from "path";

const SCREEN = path.resolve(
  __dirname,
  "../../../app/(main)/(rider)/payout-method/index.tsx",
);
const EN_LOCALE = path.resolve(__dirname, "../../../i18n/locales/en/common.json");
const BN_LOCALE = path.resolve(__dirname, "../../../i18n/locales/bn/common.json");

const screenSource = fs.readFileSync(SCREEN, "utf8");

function resolveKey(key: string, locale: Record<string, unknown>): boolean {
  let node: unknown = locale;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return false;
    }
  }
  return typeof node === "string";
}

describe("payout-method screen source contract (D10)", () => {
  it("declares the exact server-side phone regex", () => {
    expect(screenSource).toContain("/^01\\d{9}$/");
  });

  it("PATCHes through the ?id= query-param contract", () => {
    expect(screenSource).toContain('method: "PATCH"');
    expect(screenSource).toContain("payout-method?id=");
  });

  it("DELETEs through the ?id= query-param contract", () => {
    expect(screenSource).toContain('method: "DELETE"');
    expect(screenSource).toContain("payout-method?id=");
  });

  it("does not attempt a set-default PATCH (API updateSchema has no is_default field)", () => {
    // The PATCH body is built as `body` — asserting the body never carries
    // is_default (interface field declarations elsewhere are fine).
    expect(screenSource).not.toContain("body.is_default");
  });

  it("delete confirm surfaces the auto-promotion copy for the default method", () => {
    // Server behavior: deleting the default promotes the newest remaining
    // method — Copy Truth Rule requires the confirm dialog to say so.
    expect(screenSource).toContain("delete_confirm_body_promotes");
  });

  it("resolves every t() literal in both locales", () => {
    const keys = [...screenSource.matchAll(/\bt\(\s*"([^"]+\.){2,}[^"]+"/g)].map(
      (m) => m[0].match(/"([^"]+)"/)![1],
    );
    expect(keys.length).toBeGreaterThan(10);

    const en = JSON.parse(fs.readFileSync(EN_LOCALE, "utf8"));
    const bn = JSON.parse(fs.readFileSync(BN_LOCALE, "utf8"));
    const missing = keys.filter((k) => !resolveKey(k, en) || !resolveKey(k, bn));
    expect(missing).toEqual([]);
  });
});

describe("payout-method validation logic (extracted)", () => {
  // Copied verbatim from the screen + app/api/driver/payout-method+api.ts
  const PHONE_REGEX = /^01\d{9}$/;
  const maskAccount = (num: string): string => {
    if (num.length <= 4) return num;
    const visible = num.slice(-4);
    const masked = "*".repeat(Math.max(0, num.length - 4));
    return masked + visible;
  };

  it.each(["01712345678", "01812345678", "01900000000"])(
    "accepts valid bKash/Nagad number %s",
    (num) => {
      expect(PHONE_REGEX.test(num)).toBe(true);
    },
  );

  it.each(["0212345678", "0171234567", "017123456789", "0171234567a"])(
    "rejects invalid number %s",
    (num) => {
      expect(PHONE_REGEX.test(num)).toBe(false);
    },
  );

  it("masks all but the last 4 digits", () => {
    expect(maskAccount("01712345678")).toBe("*******5678");
    expect(maskAccount("12345678901234567890")).toBe("****************7890");
  });

  it("leaves short numbers unmasked", () => {
    expect(maskAccount("1234")).toBe("1234");
    expect(maskAccount("")).toBe("");
  });
});
