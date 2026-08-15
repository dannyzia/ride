import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

interface AppearanceState {
  theme: 'light' | 'dark' | 'system';
  language: 'en' | 'bn';
  setTheme: (t: AppearanceState['theme']) => void;
  setLanguage: (l: AppearanceState['language']) => void;
}

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'en',
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
    }),
    { name: 'appearance-storage', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export function useIsDark(): boolean {
  const theme = useAppearance((s) => s.theme);
  const device = useColorScheme();
  return theme === "system" ? device === "dark" : theme === "dark";
}
