import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StatusBar,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { API_URL } from "@/lib/config";

interface VerifyTokenResponse {
  exists: boolean;
  role?: string;
}

type CheckStatus = "idle" | "checking" | "error";

// Logo asset: assets/logo/logo.png — the app icon / Android adaptive-icon
// foreground referenced from app.config.js. SplashAnimation.tsx renders a
// text lockup (no image), so this is the canonical brand asset.
const LOGO = require("../assets/logo/logo.png");

export default function Splash() {
  const router = useRouter();
  const isDark = useIsDark();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;

  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1, {
      duration: 300,
      easing: Easing.out(Easing.back(1.5)),
    });
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) });
  }, [scale, opacity]);

  const [status, setStatus] = useState<CheckStatus>("idle");

  // Guard: navigate at most once, and never after unmount (e.g. if the root
  // layout's auth gate already redirected the user away from this screen).
  const redirectedRef = useRef(false);
  const mountedRef = useRef(true);

  const redirect = useCallback(
    (href: string) => {
      if (redirectedRef.current || !mountedRef.current) return;
      redirectedRef.current = true;
      router.replace(href);
    },
    [router],
  );

  const runAuthCheck = useCallback(async () => {
    if (redirectedRef.current || !mountedRef.current) return;
    setStatus("checking");
    try {
      // Unconfigured Supabase stub (missing env) — treat as signed out.
      if (!supabase?.auth?.getSession) {
        redirect("/(auth)/welcome");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        // §9.3 SPLASH→WELCOME — no session means first-run; the welcome
        // screen owns onboarding entry.
        redirect("/(auth)/welcome");
        return;
      }

      const res = await fetch(`${API_URL}/api/auth/verify-token`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.status === 401 || res.status === 403) {
        // Session rejected — registration/auth flow must restart.
        redirect("/(auth)/phone-entry");
        return;
      }

      if (!res.ok) {
        // 5xx / server error — the user IS signed in; do not dump them into
        // the auth flow. Stay here and offer a retry.
        logger.warn(`[splash] verify-token failed with status ${res.status}`);
        setStatus("error");
        return;
      }

      const data: VerifyTokenResponse = await res.json();
      if (!data.exists) {
        // Signed in via Supabase but the users row never landed — the
        // registration flow picks up at phone-entry.
        redirect("/(auth)/phone-entry");
      } else if (data.role === "driver") {
        redirect("/(main)/(rider)");
      } else {
        redirect("/(main)/(customer)/services-hub");
      }
    } catch {
      // Network error — keep the session and let the user retry.
      logger.warn("[splash] verify-token network error");
      setStatus("error");
    }
  }, [redirect]);

  // Hold the splash for 1.5s before the auth check. Timer is cleared on
  // unmount so a navigate-away during the wait never fires a stale check.
  useEffect(() => {
    const timer = setTimeout(() => {
      void runAuthCheck();
    }, 1500);
    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, [runAuthCheck]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View className="flex-1 justify-center items-center" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
        translucent
      />

      <Animated.View style={logoStyle} className="items-center">
        <Image
          source={LOGO}
          style={{ width: 150, height: 150, resizeMode: "contain" }}
        />
        <Text
          className="text-[16px] font-Jakarta mt-4"
          style={{ color: textPrimary }}
        >
          Your ride, your way
        </Text>
      </Animated.View>

      {status === "checking" && (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 32 }} />
      )}

      {status === "error" && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry"
          onPress={() => void runAuthCheck()}
          hitSlop={8}
          style={{
            marginTop: 32,
            minHeight: 48,
            minWidth: 48,
            paddingHorizontal: 16,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View className="flex-row items-center gap-2">
            <Ionicons name="refresh-outline" size={18} color={textPrimary} />
            <Text
              className="text-[14px] font-JakartaSemiBold"
              style={{ color: textPrimary }}
            >
              Retry
            </Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}
