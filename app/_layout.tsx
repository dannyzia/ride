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
import { processQueue } from "@/lib/sosQueue";
import NetInfo from "@react-native-community/netinfo";
import { routeNotification } from "@/lib/notificationRouter";

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

  // ── Auth gate ──────────────────────────────────────────────────
  useEffect(() => {
    const timeout = setTimeout(() => {
      setInitializing(false);
    }, 8000);

    if (!supabase?.auth?.onAuthStateChange) {
      logger.warn("[auth] Supabase client not configured — skipping auth gate");
      setInitializing(false);
      return () => clearTimeout(timeout);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!event || event === "INITIAL_SESSION") {
        if (session?.user) {
          registerPushForUser(session.access_token).catch(() => {});
        }
        setInitializing(false);
        return;
      }

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
            const isAdminRoute = segmentsRef.current[0] === "admin";
            const isPublicRoute = isAdminRoute || segmentsRef.current[0] === "track";
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
            if (segmentsRef.current[0] !== "admin" && segmentsRef.current[0] !== "track") {
              router.replace("/(auth)/phone-entry");
            }
          } else {
            logger.warn(`[auth] verify-token failed with status ${res.status} — keeping session`);
          }
        } catch {
          logger.warn("[auth] verify-token network error — keeping session");
        }
      } else {
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

  // ── Theme persistence ──────────────────────────────────────────
  const { theme } = useAppearance();

  useEffect(() => {
    if (theme === "system") {
      Appearance.setColorScheme(null);
    } else {
      Appearance.setColorScheme(theme);
    }
  }, [theme]);

  // ── SOS queue ──────────────────────────────────────────────────
  useEffect(() => {
    processQueue().catch(() => {});
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected === true) {
        processQueue().catch(() => {});
      }
    });
    return () => unsubscribe();
  }, []);

  // ── Push notification routing ───────────────────────────────────
  // Uses centralized notificationRouter for type → route mapping.
  // Handles three states:
  //   1. Foreground: notification arrives while app is open (banner shown by handler)
  //   2. Background: user taps notification while app is backgrounded
  //   3. Cold start: app is launched by tapping a notification
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

    // ── Background / cold-start tap handler ───────────────────────
    // This fires when the user taps a notification that opened the app.
    // Expo Router's initial URL is already handled by the linking config
    // below, so we only need to handle the notification data payload.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | Record<string, string>
        | undefined;
      if (!data) return;

      // Route via the centralized router (handles all notification types)
      const routed = routeNotification(data, "driver");
      if (!routed) {
        // Fallback: legacy ride_id handling for backward compatibility
        if (data.ride_id) {
          if (data.type === "ride:offer") {
            router.push("/(main)/(rider)" as never);
          } else {
            router.push(`/(main)/(customer)/ride-tracking/${data.ride_id}` as never);
          }
        }
      }
    });

    return () => sub.remove();
  }, [router]);

  // ── Deep-link handling ──────────────────────────────────────────
  // Expo Router's `linking` config handles the initial URL on cold start.
  // For runtime deep links (while app is open), we use the
  // `Linking.addEventListener` in the linking config's `getStateFromPath`.
  // The linking config below defines all valid URL patterns.

  // On web: skip the Reanimated splash animation
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
