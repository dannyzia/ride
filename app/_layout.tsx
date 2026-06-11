import { useEffect, useState } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import SplashAnimation from "@/components/SplashAnimation";
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";
import { logger } from "@/lib/logger";

SplashScreen.preventAutoHideAsync().catch(() => {});

// Conditional Sentry init — @sentry/react-native may not be installed in dev
try {
  const Sentry = require("@sentry/react-native");
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.2,
    // Do not log PII
    beforeSend: (event: any) => {
      if (event.request?.url)
        event.request.url = event.request.url.replace(
          /\/api\/(?:ride|driver|auth)\/\S+/,
          "/api/[redacted]",
        );
      return event;
    },
  });
} catch {
  logger.info("[sentry] @sentry/react-native not available");
}

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL;

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [initializing, setInitializing] = useState(true);
  const [splashVisible, setSplashVisible] = useState(true);

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
            const inAuthGroup = segments[0] === "(auth)";
            if (data.exists && inAuthGroup) {
              router.replace(
                data.role === "driver"
                  ? "/(main)/(rider)"
                  : "/(main)/(customer)",
              );
            } else if (!data.exists) {
              router.replace("/(auth)/phone-entry");
            }
          } else {
            router.replace("/(auth)/phone-entry");
          }
        } catch {
          router.replace("/(auth)/phone-entry");
        }
      } else {
        const inAuthGroup = segments[0] === "(auth)";
        if (!inAuthGroup) {
          router.replace("/(auth)/phone-entry");
        }
      }
      setInitializing(false);
    });

    return () => subscription.unsubscribe();
  }, [router, segments, API_URL]);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (splashVisible) {
    return (
      <SplashAnimation
        loadComplete={!initializing && fontsLoaded}
        onHidden={() => setSplashVisible(false)}
      />
    );
  }

  return <Slot />;
}
