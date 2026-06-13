import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

const supabaseUrl =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  "";
const supabaseAnonKey =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  "";

// Detect SSR / Node.js environment where the "ws" package is not available
// for Metro bundling.  During expo export:embed, Metro evaluates modules in
// Node.js but can't resolve Node.js built-ins that "ws" depends on (stream,
// zlib, etc.).  We skip createClient entirely on the server and only
// instantiate it on the client (React Native / browser).
const isServer =
  typeof window === "undefined" &&
  typeof process !== "undefined" &&
  !!process.versions?.node;

export const supabase: SupabaseClient = isServer
  ? ({} as SupabaseClient)
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
