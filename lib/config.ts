import { Platform } from "react-native";

/**
 * Resolves the correct dev/prod server URLs at runtime.
 *
 * Priority chain:
 *   1. EXPO_PUBLIC_DEV_LAN_IP (for physical devices on the same WiFi as the dev machine)
 *   2. getBundleHost() auto-detection (works when Metro runs on 0.0.0.0 and the
 *      dev client connects via the LAN IP)
 *   3. Production domain from EXPO_PUBLIC_SERVER_URL
 *   4. Emulator fallback: 10.0.2.2
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

/**
 * Try to extract the host from the JS bundle's source URL.
 * Returns null if it's localhost (which doesn't work on physical devices).
 */
function getBundleHost(): string | null {
  if (!__DEV__) return null;
  try {
    const { getDevServer } = require("react-native/Libraries/Utilities/getDevServer");
    const devServer = getDevServer();
    if (devServer?.url) {
      const parsed = new URL(devServer.url);
      const host = parsed.hostname;
      // If the bundle was loaded from localhost, we can't use it on physical
      // devices. Only useful on emulators (where localhost → 10.0.2.2 rewrite).
      if (host === "localhost" || host === "127.0.0.1") {
        return isAndroidEmulator() ? "http://10.0.2.2:8081" : null;
      }
      return `${parsed.protocol}//${parsed.host}`;
    }
  } catch {
    // Internal API not available
  }
  return null;
}

function deriveWsUrl(apiUrl: string): string {
  try {
    const parsed = new URL(apiUrl);
    const wsProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${parsed.hostname}:3001`;
  } catch {
    return "ws://localhost:3001";
  }
}

// ── Env vars ──────────────────────────────────────────────────
const DEV_LAN_IP = process.env.EXPO_PUBLIC_DEV_LAN_IP ?? "";
const ENV_API = process.env.EXPO_PUBLIC_SERVER_URL ?? "";
const ENV_WS = process.env.EXPO_PUBLIC_WEB_SOCKET_SERVER_URL ?? "";

// ── Resolve API URL ───────────────────────────────────────────
// Priority: DEV_LAN_IP (physical devices) → bundle host → production → emulator fallback
function resolveApiUrl(): string {
  // 1. If DEV_LAN_IP is set, use it (most reliable for physical devices)
  if (DEV_LAN_IP) {
    return `http://${DEV_LAN_IP}:8081`;
  }

  // 2. Try bundle host auto-detection
  const bundleHost = getBundleHost();
  if (bundleHost) return bundleHost;

  // 3. Production domain
  if (isProdUrl(ENV_API)) return ENV_API;

  // 4. Emulator fallback
  return isAndroidEmulator() ? "http://10.0.2.2:8081" : "http://localhost:8081";
}

function resolveWsUrl(apiUrl: string): string {
  // If DEV_LAN_IP is set, derive WS from it
  if (DEV_LAN_IP) {
    return `ws://${DEV_LAN_IP}:3001`;
  }

  // If production WS URL is set, use it
  if (isProdUrl(ENV_WS)) return ENV_WS;

  // Derive from API URL
  return deriveWsUrl(apiUrl);
}

const RESOLVED_API = resolveApiUrl();

export const API_URL = RESOLVED_API;
export const WS_URL = resolveWsUrl(RESOLVED_API);
