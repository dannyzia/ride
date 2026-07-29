import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
