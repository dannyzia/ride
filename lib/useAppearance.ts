import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

interface AppearanceState {
  theme: 'light' | 'dark' | 'system';
  language: 'en' | 'bn';
  /**
   * Bengali-numeral preference for taka display (Bengali Numerals plan P2.1).
   * Tri-state, default 'auto': zustand persist writes the FULL state on the
   * first setTheme/setLanguage call, so a boolean default would be baked into
   * AsyncStorage for every user and silently defeat the later 'auto' flip.
   * 'auto' currently means latn (no visual change); an explicit 'on'/'off'
   * set by the user is NEVER overridden.
   * Currently applies to taka formatting only; dates and relative time
   * intentionally remain Latin-digit (see follow-ups).
   */
  bengaliNumerals: 'auto' | 'on' | 'off';
  setTheme: (t: AppearanceState['theme']) => void;
  setLanguage: (l: AppearanceState['language']) => void;
  setBengaliNumerals: (v: AppearanceState['bengaliNumerals']) => void;
}

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'en',
      bengaliNumerals: 'auto',
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setBengaliNumerals: (bengaliNumerals) => set({ bengaliNumerals }),
    }),
    { name: 'appearance-storage', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export function useIsDark(): boolean {
  const theme = useAppearance((s) => s.theme);
  const device = useColorScheme();
  return theme === "system" ? device === "dark" : theme === "dark";
}
