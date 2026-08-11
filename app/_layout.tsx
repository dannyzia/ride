import "../global.css";
import { useEffect, useRef, useState } from "react";
import { Platform, View, ActivityIndicator, Appearance } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import * as Application from "expo-application";
import SplashAnimation from "@/components/SplashAnimation";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useAppearance } from "@/lib/useAppearance";
import "@/i18n/i18n";
import { API_URL } from "@/lib/config";

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
            // Register push token after successful auth (fire-and-forget)
            registerPushForUser(session.access_token).catch(() => {});

            if (data.exists && inAuthGroup && !isAdminRoute) {
              router.replace(
                data.role === "driver"
                  ? "/(main)/(rider)"
                  : "/(main)/(customer)",
              );
            } else if (!data.exists && !isAdminRoute) {
              router.replace("/(auth)/phone-entry");
            }
          } else if (res.status === 401 || res.status === 403) {
            // Actual auth failure — sign out and redirect
            if (segmentsRef.current[0] !== "admin") {
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
        const inAuthGroup = segmentsRef.current[0] === "(auth)";
        const isAdminRoute = segmentsRef.current[0] === "admin";
        // Only redirect to auth for non-auth, non-admin routes.
        // Admin routes handle their own authentication.
        if (!inAuthGroup && !isAdminRoute) {
          router.replace("/(auth)/phone-entry");
        }
      }
      setInitializing(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
     
  }, []);

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
          router.push(`/(main)/(customer)/final-page?ride_id=${data.ride_id}`);
        }
      }
    });

    return () => sub.remove();
  }, []);

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
          backgroundColor: "#181A20",
        }}
      >
        <ActivityIndicator size="large" color="#0CC25F" />
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

  return <Slot />;
}
