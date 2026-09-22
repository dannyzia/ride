/**
 * Language toggle unit tests (ISSUE-65, plan §4).
 *
 * Logic-level tests — no @testing-library/react-native (jest-expo preset,
 * no RNTL in this repo). Copies the `mockStore` AsyncStorage mock AND its
 * reset discipline from lib/__tests__/sosQueue.test.ts:9-23, 63-73.
 */
jest.mock("@react-native-async-storage/async-storage", () => {
  const mockStore = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        mockStore.set(k, v);
      }),
      removeItem: jest.fn(async (k: string) => {
        mockStore.delete(k);
      }),
      // Exposed so tests can reset between cases.
      __mockStore: mockStore,
    },
  };
});

import AsyncStorage from "@react-native-async-storage/async-storage";
import i18next, { changeLanguage as rawChange } from "i18next";
import * as i18nModule from "@/i18n/i18n";
import { useAppearance } from "@/lib/useAppearance";
import { STORAGE_KEYS } from "@/lib/storageKeys";

const mockStore = (AsyncStorage as unknown as { __mockStore: Map<string, string> })
  .__mockStore;

/** changeLanguage resolves through a promise chain even with bundled
 * resources — flush microtasks AND a macrotask before asserting
 * i18n.language (back-to-back flips queue inside i18next and need the
 * full drain). */
const flush = async () => {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  await Promise.resolve();
};

describe("language toggle", () => {
  beforeEach(async () => {
    mockStore.clear();
    jest.clearAllMocks();
    // Reset to the en baseline — prevents cross-test leakage through the
    // shared i18n singleton and the zustand store.
    await rawChange("en");
    useAppearance.setState({ language: "en" });
  });

  describe("toggleLanguage", () => {
    it("flips en → bn in i18n, AsyncStorage and the zustand mirror", async () => {
      i18nModule.toggleLanguage();
      await flush();

      expect(i18next.language).toBe("bn");
      expect(mockStore.get(STORAGE_KEYS.LANGUAGE)).toBe("bn");
      expect(useAppearance.getState().language).toBe("bn");
    });

    it("round-trips bn → en", async () => {
      i18nModule.toggleLanguage();
      await flush();
      expect(i18next.language).toBe("bn");

      i18nModule.toggleLanguage();
      await flush();
      expect(i18next.language).toBe("en");
      expect(mockStore.get(STORAGE_KEYS.LANGUAGE)).toBe("en");
      expect(useAppearance.getState().language).toBe("en");
    });
  });

  describe("applyLanguage hardening (plan D2)", () => {
    it("still switches live language when AsyncStorage.setItem REJECTS", async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
        new Error("disk full"),
      );

      expect(() => i18nModule.applyLanguage("bn")).not.toThrow();
      await flush();

      // The live switch and the mirror must both survive the storage failure.
      expect(i18next.language).toBe("bn");
      expect(useAppearance.getState().language).toBe("bn");
    });

    it("writes the mirror and storage on the happy path", async () => {
      i18nModule.applyLanguage("bn");
      await flush();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.LANGUAGE,
        "bn",
      );
      expect(useAppearance.getState().language).toBe("bn");
      expect(i18next.language).toBe("bn");
    });
  });

  describe("initI18n boot reconciliation (plan D3)", () => {
    it("syncs the zustand mirror to the persisted i18n language", async () => {
      mockStore.set(STORAGE_KEYS.LANGUAGE, "bn");
      useAppearance.setState({ language: "en" }); // the stale-mirror split

      await i18nModule.initI18n();
      await flush();

      expect(i18next.language).toBe("bn");
      expect(useAppearance.getState().language).toBe("bn");
    });

    it("falls back to en for garbage stored values", async () => {
      mockStore.set(STORAGE_KEYS.LANGUAGE, "xx");
      useAppearance.setState({ language: "bn" });

      await i18nModule.initI18n();
      await flush();

      expect(i18next.language).toBe("en");
      expect(useAppearance.getState().language).toBe("en");
    });
  });

  describe("structural mounts (plan §4 — i18n-smoke style file scans)", () => {
    const fs = require("fs");
    const path = require("path");
    const ROOT = path.resolve(__dirname, "../..");
    const read = (p: string) =>
      fs.readFileSync(path.join(ROOT, p), "utf8");

    it("(auth) layout mounts LanguageToggle", () => {
      expect(read("app/(auth)/_layout.tsx")).toContain("LanguageToggle");
    });

    it("GlobalActionButtons mounts LanguageToggle in the draggable stack", () => {
      const src = read("components/GlobalActionButtons.tsx");
      expect(src).toContain("LanguageToggle");
      expect(src).toContain("hasLang");
    });

    it("LanguageToggle calls toggleLanguage", () => {
      expect(read("components/LanguageToggle.tsx")).toContain("toggleLanguage");
    });

    it("both settings screens write through applyLanguage", () => {
      expect(
        read("app/(main)/(customer)/(tabs)/settings/app-language/index.tsx"),
      ).toContain("applyLanguage");
      expect(
        read("app/(main)/(rider)/settings/language/index.tsx"),
      ).toContain("applyLanguage");
    });
  });
});
