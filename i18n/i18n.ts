import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en/common.json';
import bn from './locales/bn/common.json';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { useAppearance } from '@/lib/useAppearance';

const resources = { en: { common: en }, bn: { common: bn } };

/**
 * Language codes used by the app. 'en' is the default fallback;
 * 'bn' is Bangla (Bengali).
 */
export type SupportedLanguage = 'en' | 'bn';

/**
 * Load the persisted language choice from AsyncStorage.
 * Returns 'en' (default) if nothing is stored or if the read fails.
 */
async function loadPersistedLanguage(): Promise<SupportedLanguage> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.LANGUAGE);
    if (stored === 'en' || stored === 'bn') return stored;
  } catch {
    // AsyncStorage read failure — fall back to 'en'
  }
  return 'en';
}

/**
 * The ONE language-switch primitive every write path uses (settings screens,
 * the floating LanguageToggle).
 *
 * Ordering is deliberate (plan D2): `changeLanguage` FIRST, in its own try —
 * the previous `setLanguage` awaited the AsyncStorage write before switching,
 * so a storage failure silently skipped the live switch ("tap does nothing").
 * Resources are bundled, so resolution is immediate once the language changes.
 *
 * Key exclusivity: `ride:i18n:language` (STORAGE_KEYS.LANGUAGE) is the SOLE
 * i18n persistence key — the zustand mirror persists separately under
 * `appearance-storage`; no other mechanism writes either.
 */
export function applyLanguage(lang: SupportedLanguage): void {
  try {
    void i18next.changeLanguage(lang);
  } catch {
    // changeLanguage is async internally; a synchronous throw would be an
    // i18next wiring bug — nothing actionable here.
  }
  // Best-effort persistence — must not block or fail the live switch.
  void AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, lang).catch(() => {});
  // Write-through mirror: services-hub + customer-home vehicle pills read
  // `useAppearance.language` for display_* label selection.
  useAppearance.getState().setLanguage(lang);
}

/**
 * One-tap flip used by the floating LanguageToggle.
 * Label semantics (plan D8): the button shows the TARGET language.
 */
export function toggleLanguage(): void {
  // Read the language off the DEFAULT-IMPORTED i18next instance. A namespace
  // import (`import * as i18n`) exposes no `language` property (it is undefined
  // under jest/expo interop), which made this ternary resolve 'bn' forever.
  const next: SupportedLanguage = i18next.language === 'bn' ? 'en' : 'bn';
  applyLanguage(next);
}

/**
 * Initialize i18next with AsyncStorage-backed language persistence.
 *
 * Call this once at app startup (in the root layout or _layout.tsx).
 * The init is intentionally async: we read the stored language before
 * the first render so the correct locale is used for the initial UI
 * strings.
 */
export async function initI18n(): Promise<void> {
  const lng = await loadPersistedLanguage();

  // Boot reconciliation (plan D3): heal the pre-existing split where a user
  // switched language via a settings screen that only wrote the i18n side —
  // zustand said 'en', i18n said 'bn', and the two display_* screens stayed
  // stale for the whole session. Known theoretical race: zustand persist
  // rehydrate could overwrite this afterwards (worst case = the pre-feature
  // behavior; the next toggle re-syncs). Not engineered around.
  useAppearance.getState().setLanguage(lng);

  // The synchronous init at the bottom of this module always runs first
  // (lng: 'en'), and i18next makes a second init() call on an already
  // initialized instance a no-op — so passing `lng` to init() here never
  // hydrated the persisted choice. On startup that reverted every reload
  // (and cold start) to English even though `ride:i18n:language` held 'bn'
  // (device-verified). Hydrate via changeLanguage on the live instance.
  if (i18next.isInitialized) {
    await i18next.changeLanguage(lng);
    return;
  }

  await i18next.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    react: {
      useSuspense: false,
    },
  });
}

// Also init synchronously so components that import i18n directly still work
// before the async init resolves. The async init will re-set the language
// once AsyncStorage responds.
i18next.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  react: {
    useSuspense: false,
  },
});

export default i18next;
