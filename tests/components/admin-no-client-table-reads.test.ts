/**
 * ISSUE-81 zero-policy conversion: the admin panel must have ZERO direct
 * client-side table reads. The T6 RLS audit found 4 anon-key `users` reads
 * (silently dead under RLS default-deny); all role resolution now goes
 * through the server endpoint POST /api/auth/verify-token (Drizzle/owner
 * path). This guard keeps it that way — a regression here would silently
 * blank the admin role UI again, and blocks the users_self_read policy drop.
 *
 * Source-scan tier (readFileSync, no module graph) over the three converted
 * files plus the shared helper; logic tier exercises fetchAdminRole's
 * decision table against a mocked adminFetch.
 */
/* eslint-disable import/first */
jest.mock("@/lib/adminFetch", () => ({
  adminFetch: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import fs from "fs";
import path from "path";
import { adminFetch } from "@/lib/adminFetch";
import { fetchAdminRole } from "@/lib/adminRoleClient";

const ROOT = path.resolve(__dirname, "../..");
const FILES = [
  "components/admin/AdminShell.tsx",
  "app/admin/fare-config.tsx",
  "app/admin/_layout.tsx",
].map((p) => path.join(ROOT, p));

describe("admin panel — zero client-side table reads (ISSUE-81)", () => {
  it.each(FILES)("has no .from( table access in %s", (file) => {
    const src = fs.readFileSync(file, "utf8");
    expect(src).not.toMatch(/\.from\(\s*['"]/);
  });

  it.each(FILES)("resolves role via verify-token in %s", (file) => {
    const src = fs.readFileSync(file, "utf8");
    expect(
      src.includes("verify-token") || src.includes("fetchAdminRole"),
    ).toBe(true);
  });

  it("AdminShell + fare-config use the shared helper", () => {
    for (const file of FILES.slice(0, 2)) {
      expect(fs.readFileSync(file, "utf8")).toContain("fetchAdminRole");
    }
  });

  it("_layout.tsx no longer carries the removed Method 1 block", () => {
    const src = fs.readFileSync(FILES[2], "utf8");
    expect(src).not.toContain("Method 1");
    expect(src).not.toContain("anon key baked into bundle");
  });
});

describe("fetchAdminRole decision table", () => {
  beforeEach(() => {
    (adminFetch as jest.Mock).mockReset();
  });

  it("returns the role on a successful verify-token response", async () => {
    (adminFetch as jest.Mock).mockResolvedValue({
      data: { exists: true, role: "owner" },
      error: null,
      status: 200,
    });
    await expect(fetchAdminRole()).resolves.toBe("owner");
  });

  it("returns null when the user has no DB row (exists: false)", async () => {
    (adminFetch as jest.Mock).mockResolvedValue({
      data: { exists: false },
      error: null,
      status: 200,
    });
    await expect(fetchAdminRole()).resolves.toBeNull();
  });

  it("returns null on API error", async () => {
    (adminFetch as jest.Mock).mockResolvedValue({
      data: null,
      error: "request_failed",
      status: 500,
    });
    await expect(fetchAdminRole()).resolves.toBeNull();
  });

  it("returns null when role is missing or not a string", async () => {
    (adminFetch as jest.Mock).mockResolvedValue({
      data: { exists: true },
      error: null,
      status: 200,
    });
    await expect(fetchAdminRole()).resolves.toBeNull();
  });
});
