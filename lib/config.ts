import { Platform } from "react-native";

/**
 * Resolves the correct dev/prod server URLs at runtime.
 *
 * Uses EXPO_PUBLIC_DEV_LAN_IP for physical device testing (set in .env.local).
 * Falls back to 10.0.2.2 for Android emulators.
 * Production domains pass through from EXPO_PUBLIC_SERVER_URL.
 */

function isAndroidEmulator(): boolean {
  if (Platform.OS !== "android") return false;
  const constants = (Platform as any).constants ?? {};
  const model: string = constants.Model ?? "";
  return (
    model.includes("sdk_") ||
    model.includes("google_sdk") ||
    model.includes("Emulator")
  );
}

function isProdUrl(url: string): boolean {
  return url.length > 0 && !url.includes("localhost") && !url.includes("10.0.2.2");
}

// ── Env vars ──────────────────────────────────────────────────
const DEV_LAN_IP = process.env.EXPO_PUBLIC_DEV_LAN_IP ?? "";
const ENV_API = process.env.EXPO_PUBLIC_SERVER_URL ?? "";
const ENV_WS = process.env.EXPO_PUBLIC_WEB_SOCKET_SERVER_URL ?? "";

// ── Resolve API URL ───────────────────────────────────────────
function resolveApiUrl(): string {
  // 1. If DEV_LAN_IP is set, use it (physical devices on same WiFi)
  if (DEV_LAN_IP) {
    return `http://${DEV_LAN_IP}:8081`;
  }

  // 2. Production domain
  if (isProdUrl(ENV_API)) return ENV_API;

  // 3. Emulator fallback
  return isAndroidEmulator() ? "http://10.0.2.2:8081" : "http://localhost:8081";
}

// ── Resolve WebSocket URL ─────────────────────────────────────
function resolveWsUrl(): string {
  if (DEV_LAN_IP) {
    return `ws://${DEV_LAN_IP}:3001`;
  }
  if (isProdUrl(ENV_WS)) return ENV_WS;
  return isAndroidEmulator() ? "ws://10.0.2.2:3001" : "ws://localhost:3001";
}

export const API_URL = resolveApiUrl();
export const WS_URL = resolveWsUrl();
