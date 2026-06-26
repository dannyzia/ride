import "../global.css";
import { useEffect, useState } from "react";
import { Platform, View, ActivityIndicator } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import SplashAnimation from "@/components/SplashAnimation";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const isWeb = Platform.OS === "web";

// Only prevent auto-hide on native — on web the splash is handled differently.
if (!isWeb) {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

const API_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "";

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
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
            const inAuthGroup = segments[0] === "(auth)";
            // Allow admin routes through — the admin layout has its own
            // auth guard (role === "admin"). Do NOT redirect admin here.
            const isAdminRoute = segments[0] === "admin";
            if (data.exists && inAuthGroup && !isAdminRoute) {
              router.replace(
                data.role === "driver"
                  ? "/(main)/(rider)"
                  : "/(main)/(customer)",
              );
            } else if (!data.exists && !isAdminRoute) {
              router.replace("/(auth)/phone-entry");
            }
          } else if (segments[0] !== "admin") {
            router.replace("/(auth)/phone-entry");
          }
        } catch {
          if (segments[0] !== "admin") {
            router.replace("/(auth)/phone-entry");
          }
        }
      } else {
        const inAuthGroup = segments[0] === "(auth)";
        const isAdminRoute = segments[0] === "admin";
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
  }, [router, segments, API_URL]);

  useEffect(() => {
    if (fontsLoaded && !isWeb) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

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
