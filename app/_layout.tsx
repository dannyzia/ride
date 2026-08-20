import "../global.css";
import { useEffect, useRef, useState } from "react";
import { Platform, View, ActivityIndicator, Appearance } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import * as Application from "expo-application";
import SplashAnimation from "@/components/SplashAnimation";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastHost } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useAppearance } from "@/lib/useAppearance";
import "@/i18n/i18n";
import { API_URL } from "@/lib/config";
import { colors } from "@/theme/goRide";

const isWeb = Platform.OS === "web";

async function registerPushForUser(token: string) {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const deviceId = Application.getAndroidId?.() ?? tokenData.data;
    await fetch(`${API_URL}/api/user/device`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        push_token: tokenData.data,
        platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web",
        device_id: deviceId,
      }),
    });
  } catch {
    // Non-blocking — push registration is best-effort
  }
}

// Only prevent auto-hide on native — on web the splash is handled differently.
if (!isWeb) {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef(segments);
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);
  const [initializing, setInitializing] = useState(true);
  const [splashVisible, setSplashVisible] = useState(!isWeb);

  const [fontsLoaded] = useFonts({
    "Jakarta-Bold": require("../assets/fonts/PlusJakartaSans-Bold.ttf"),
    "Jakarta-ExtraBold": require("../assets/fonts/PlusJakartaSans-ExtraBold.ttf"),
    "Jakarta-ExtraLight": require("../assets/fonts/PlusJakartaSans-ExtraLight.ttf"),
    "Jakarta-Light": require("../assets/fonts/PlusJakartaSans-Light.ttf"),
    "Jakarta-Medium": require("../assets/fonts/PlusJakartaSans-Medium.ttf"),
    "Jakarta-Regular": require("../assets/fonts/PlusJakartaSans-Regular.ttf"),
    "Jakarta-SemiBold": require("../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
  });

  useEffect(() => {
    // Safety timeout: if auth initialization doesn't resolve within 8 seconds,
    // force-initialize so the user isn't stuck on a blank screen.
    const timeout = setTimeout(() => {
      setInitializing(false);
    }, 8000);

    // Guard: if Supabase client is not properly configured (e.g., env vars
    // missing on the server), skip auth initialization entirely.
    if (!supabase?.auth?.onAuthStateChange) {
      logger.warn("[auth] Supabase client not configured — skipping auth gate");
      setInitializing(false);
      return () => clearTimeout(timeout);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // ── INITIAL_SESSION gate ─────────────────────────────────────────
      // INITIAL_SESSION is the first event Supabase fires (0-2 s after
      // mount) when it restores the local session.  The splash screen
      // (app/index.tsx) owns initial routing per §9.3:
      //   SPLASH → No auth → WELCOME → Get Started → PHONE_ENTRY
      // Redirecting here would bypass welcome.tsx for first-time users and
      // send them straight to phone-entry.  We also skip the verify-token
      // round-trip (unnecessary — the splash does its own check after
      // 1.5 s).  Only subsequent events (SIGNED_IN, SIGNED_OUT, etc.)
      // represent real mid-session auth changes that need a redirect.
      if (!event || event === "INITIAL_SESSION") {
        if (session?.user) {
          registerPushForUser(session.access_token).catch(() => {});
        }
        setInitializing(false);
        return;
      }

      // ── Mid-session auth changes ─────────────────────────────────────
      if (session?.user) {
        try {
          const token = session.access_token;
          const res = await fetch(`${API_URL}/api/auth/verify-token`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.ok) {
            const data = await res.json();
            const inAuthGroup = segmentsRef.current[0] === "(auth)";
            // Allow admin routes through — the admin layout has its own
            // auth guard (role === "admin"). Do NOT redirect admin here.
            const isAdminRoute = segmentsRef.current[0] === "admin";
            // /track is a public share link — logged-out friends must be able
            // to see the ride without signing in (its endpoint is public).
            const isPublicRoute = isAdminRoute || segmentsRef.current[0] === "track";
            // Register push token after successful auth (fire-and-forget)
            registerPushForUser(session.access_token).catch(() => {});

            if (data.exists && inAuthGroup && !isPublicRoute) {
              router.replace(
                data.role === "driver"
                  ? "/(main)/(rider)"
                  : "/(main)/(customer)/services-hub",
              );
            } else if (!data.exists && !isPublicRoute) {
              router.replace("/(auth)/phone-entry");
            }
          } else if (res.status === 401 || res.status === 403) {
            // Actual auth failure — sign out and redirect (never from the
            // public /track share page).
            if (segmentsRef.current[0] !== "admin" && segmentsRef.current[0] !== "track") {
              router.replace("/(auth)/phone-entry");
            }
          } else {
            // 5xx / network error — do NOT log the user out, just log.
            // The next auth event or app restart will retry.
            logger.warn(`[auth] verify-token failed with status ${res.status} — keeping session`);
          }
        } catch {
          // Network error — do NOT log the user out. The next auth event
          // or app restart will retry.
          logger.warn("[auth] verify-token network error — keeping session");
        }
      } else {
        // Session lost mid-session (e.g. sign-out from another device,
        // token revocation).  Redirect to auth unless already there.
        const inAuthGroup = segmentsRef.current[0] === "(auth)";
        const isAdminRoute = segmentsRef.current[0] === "admin";
        const isPublicRoute = isAdminRoute || segmentsRef.current[0] === "track";
        if (!inAuthGroup && !isPublicRoute) {
          router.replace("/(auth)/phone-entry");
        }
      }
      setInitializing(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (fontsLoaded && !isWeb) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // ── Theme persistence ───────────────────────────────────────────────
  const { theme } = useAppearance();

  useEffect(() => {
    if (theme === "system") {
      Appearance.setColorScheme(null);
    } else {
      Appearance.setColorScheme(theme);
    }
  }, [theme]);

  // ── Push notification setup ──────────────────────────────────────────
  // Hoisted above all early returns (rules-of-hooks requirement) and
  // registered unconditionally so the notification handler is available
  // even during splash/skeleton screens.
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      if (data?.ride_id) {
        if (data?.type === 'ride:offer') {
          router.push(`/(main)/(rider)`);
        } else {
          router.push(`/(main)/(customer)/ride-tracking/${data.ride_id}`);
        }
      }
    });

    return () => sub.remove();
  }, [router]);

  // On web: skip the Reanimated splash animation (it can hang in production
  // web builds and leave a blank screen). Show a simple loading indicator
  // instead while auth initializes.
  if (isWeb && (initializing || !fontsLoaded)) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.bgDark,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // On native: show the custom splash animation until auth resolves.
  if (!isWeb && splashVisible) {
    return (
      <SplashAnimation
        loadComplete={!initializing && fontsLoaded}
        onHidden={() => setSplashVisible(false)}
      />
    );
  }

  return (
    <ErrorBoundary>
      <Slot />
      <ToastHost />
    </ErrorBoundary>
  );
}
