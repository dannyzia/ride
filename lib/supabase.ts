import { createClient, SessionStorage } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

// ws is Node.js-only — only import when running outside React Native (e.g. SSR / EAS build)
const ws = typeof window === "undefined" ? require("ws") : undefined;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: {
      getItem: async (key) => await SecureStore.getItemAsync(key),
      setItem: async (key, value) => await SecureStore.setItemAsync(key, value),
      removeItem: async (key) => await SecureStore.deleteItemAsync(key),
    } as SessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // Fix Node 20 WebSocket error during SSR / expo export --platform web
  realtime: ws ? { transport: ws } : undefined,
});
