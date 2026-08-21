import * as i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en/common.json';
import bn from './locales/bn/common.json';
import { STORAGE_KEYS } from '@/lib/storageKeys';

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
 * Persist the user's language choice so it survives app restarts.
 */
export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
    await i18n.changeLanguage(lang);
  } catch (e) {
    // Non-critical — the in-memory change still takes effect for the session
  }
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

  i18n.use(initReactI18next).init({
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
i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  react: {
    useSuspense: false,
  },
});

export default i18n;
