/**
 * Playwright ADMIN LANE (plan 27 §7 A6).
 *
 * Scope: the admin panel only. Admin surfaces are English-only by convention —
 * no locale keys, no i18n assertions here. App-side journeys stay on Maestro.
 *
 * Why a separate lane (not Maestro): the admin panel is React Native Web, and
 * its screens are reached by a URL + a Supabase admin session, not by a device
 * tap path. Playwright drives that natively and headlessly.
 *
 * NOT self-starting by default. The lane needs the Expo web app running and an
 * authenticated admin session, so it is OPT-IN:
 *   ADMIN_BASE_URL   — default http://localhost:8081
 *   ADMIN_STORAGE_STATE — a Playwright storage-state JSON holding the admin
 *                         session (produced once per environment, never committed)
 * Running without a reachable app FAILS loudly (see tests/e2e/admin/_auth.ts)
 * rather than skipping to a false green.
 */
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.ADMIN_BASE_URL ?? "http://localhost:8081";

export default defineConfig({
  testDir: "./tests/e2e",
  // jest ignores this directory (jest.config.js testPathIgnorePatterns) — the
  // two runners must never claim the same files.
  outputDir: "admin-test-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: process.env.ADMIN_STORAGE_STATE,
  },
  projects: [
    {
      name: "admin-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
