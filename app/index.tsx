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
import { useTranslation } from "react-i18next";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { API_URL } from "@/lib/config";
import {
  applyVerifyTokenFlags,
  fetchRideVerticalFlag,
  getRideVerticalEnabled,
  RIDE_FLAG_RESOLVE_TIMEOUT_MS,
  waitForRideVerticalFlag,
} from "@/lib/verticalFlags";

interface VerifyTokenResponse {
  exists: boolean;
  role?: string;
  /**
   * S2.1 D-1: ACTIVE-only role list — >1 routes to the Login-as chooser.
   * `null` means the server could NOT resolve the set (roles_unknown), which is
   * not the same as "one role" and must not be routed as if it were.
   */
  active_roles?: string[] | null;
  /** verify-token could not resolve roles in budget — route to the chooser. */
  roles_unknown?: boolean;
  phone?: string | null;
  /** Node launch (Component A): additive boot flags; existing consumers ignore it. */
  flags?: { ride_vertical_enabled?: boolean };
}

type CheckStatus = "idle" | "checking" | "error";

// Logo asset: assets/logo/node_icon_1024.png — the Node mark (Stage 2 T2
// asset mapping; was the pre-launch GoRide logo.png, which T3 dispositioned
// for text only — this require is the image side of that same defect,
// found live by the device walk). SplashAnimation.tsx renders a text lockup
// (no image), so this is the canonical brand asset render.
const LOGO = require("../assets/logo/node_icon_1024.png");

export default function Splash() {
  const router = useRouter();
  const isDark = useIsDark();
  const { t } = useTranslation();

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
        // Component A: the flag must be resolved before the login screen
        // paints — consume the boot fetch (bounded; fail-closed) first.
        await waitForRideVerticalFlag(RIDE_FLAG_RESOLVE_TIMEOUT_MS);
        redirect("/(auth)/phone-entry");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      logger.info('[splash] runAuthCheck session', { hasSession: !!session, hasUser: !!session?.user });
      if (!session?.user) {
        // §9.3 SPLASH→WELCOME — no session means first-run; the welcome
        // screen owns onboarding entry. Component A: consume the resolved
        // flag (bounded; fail-closed) so it is always settled before the
        // login screen first paints — no flicker.
        const ride_vertical_enabled = await waitForRideVerticalFlag(
          RIDE_FLAG_RESOLVE_TIMEOUT_MS,
        );
        logger.info('[splash] no session, redirecting to phone-entry', {
          ride_vertical_enabled,
        });
        redirect("/(auth)/phone-entry");
        return;
      }

      logger.info('[splash] calling verify-token', { url: `${API_URL}/api/auth/verify-token` });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      let res: Response;
      try {
        res = await fetch(`${API_URL}/api/auth/verify-token`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      logger.info('[splash] verify-token status', { status: res.status });

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
      // Component A: the authenticated boot consumes the verify-token flags
      // field; the resolver keeps the unconditional mount fetch as the
      // authoritative boot read. Routing is unchanged in this stage.
      applyVerifyTokenFlags(data.flags);
      if (!data.exists) {
        // Signed in via Supabase but the users row never landed — the
        // registration flow picks up at phone-entry.
        redirect("/(auth)/phone-entry");
      } else if (
        data.roles_unknown === true ||
        (Array.isArray(data.active_roles) && data.active_roles.length > 1)
      ) {
        // S2.1 D-1 (§16): a cold boot with a persisted session routes multi-
        // role accounts through the chooser too — same authority as the gate.
        // `roles_unknown` counts as "multi": guessing a single role here is how
        // a fleet_owner who also drives was silently dropped into the driver
        // surface and could never reach the fleet portal (2026-11-10).
        redirect(
          `/(auth)/login-as?phone=${encodeURIComponent(data.phone ?? "")}`,
        );
      } else if (data.role === "driver") {
        // Stage 5 (#7): flag off → services-hub (the (main) mount guard also
        // backstops (rider) navigation); flag on ⇒ unchanged.
        redirect(
          getRideVerticalEnabled() ? "/(main)/(rider)/d" : "/(main)/(customer)/services-hub",
        );
      } else if (data.role === "shop_owner") {
        // S3: the shop surface is live — a single-any-role owner lands here.
        redirect("/(main)/(shop-owner)");
      } else if (data.role === "fleet_owner") {
        // Stage 4: single-role fleet_owner lands on fleet dashboard (asymmetry fix).
        redirect("/(main)/(fleet)/(tabs)/dashboard");
      } else if (data.role === "delivery_man") {
        // S6: the Delivery Man surface is live — offers inbox is the landing.
        redirect("/(main)/(delivery)");
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
    mountedRef.current = true;
    // Component A: resolve the ride-hide flag on EVERY boot — fired
    // unconditionally at mount, in parallel with the 1.5 s hold timer
    // (session state is only learned after the timer). The resolver caches
    // the read for the session.
    void fetchRideVerticalFlag();
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
          {t("auth.tagline")}
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
         testID=".run-auth-check">
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
