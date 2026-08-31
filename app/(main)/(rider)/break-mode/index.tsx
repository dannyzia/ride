import { useState, useEffect, useRef } from "react";
import { API_URL } from "@/lib/config";
import { useDriverStore } from "@/store/useDriverStore";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Animated,
  AccessibilityInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors, spacing, radii } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

function HeaderThemeToggle() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;

  return (
    <TouchableOpacity
      onPress={() => setTheme(isDark ? "light" : "dark")}
      accessibilityRole="button"
      accessibilityLabel={isDark ? "Switch to light theme" : "Switch to dark theme"}
      style={{
        width: 40,
        height: 40,
        borderRadius: radii.lg,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: surfaceBg,
        borderWidth: 1,
        borderColor,
      }}
    >
      <Ionicons
        name={isDark ? "sunny-outline" : "moon-outline"}
        size={20}
        color={textPrimary}
      />
    </TouchableOpacity>
  );
}

export default function BreakMode() {
  const isDark = useIsDark();
  const [breakStartedAt, setBreakStartedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          setError("Not authenticated");
          return;
        }
        const meRes = await fetch(`${API_URL}/api/driver/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const meData = await meRes.json().catch(() => null);
        if (cancelled) return;
        if (
          meRes.ok &&
          meData?.driver?.on_break &&
          meData.driver.break_started_at
        ) {
          setBreakStartedAt(meData.driver.break_started_at);
          setElapsed(
            Math.floor(
              (Date.now() - new Date(meData.driver.break_started_at).getTime()) /
                1000,
            ),
          );
          return;
        }
        const res = await fetch(`${API_URL}/api/driver/break/start`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && data?.break_started_at) {
          setBreakStartedAt(data.break_started_at);
          setElapsed(0);
        } else {
          setError(data?.error || "Failed to start break");
        }
      } catch (err) {
        logger.error("BreakMode start failed", err);
        if (!cancelled) setError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!breakStartedAt) return;
    setElapsed(
      Math.floor(
        (Date.now() - new Date(breakStartedAt).getTime()) / 1000,
      ),
    );
    const interval = setInterval(() => {
      setElapsed(
        Math.floor(
          (Date.now() - new Date(breakStartedAt).getTime()) / 1000,
        ),
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [breakStartedAt]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    return () => {
      scaleAnim.stopAnimation();
      scaleAnim.setValue(1);
    };
  }, [scaleAnim]);

  useEffect(() => {
    if (reduceMotion) {
      scaleAnim.stopAnimation();
      scaleAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.05,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      scaleAnim.setValue(1);
    };
  }, [reduceMotion, scaleAnim]);

  const handleEndBreak = async () => {
    setEnding(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not authenticated");
        return;
      }
      const res = await fetch(`${API_URL}/api/driver/break/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      // LOW-7: a failed /break/end used to navigate back anyway, leaving the
      // server on_break while dispatch kept the driver off the pool silently.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.message || "Failed to end break — please try again");
        return;
      }
      // Sync store state after successful break end
      useDriverStore.getState().setOnBreak(false, null);
      router.back();
    } catch (err) {
      logger.error("BreakMode end failed", err);
      setError("Network error — please try again");
    } finally {
      setEnding(false);
    }
  };

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={bg}
        />
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: borderColor,
          gap: spacing.md,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            fontFamily: "Jakarta-Bold",
            fontSize: 18,
            color: textPrimary,
          }}
        >
          Break Mode
        </Text>
        <HeaderThemeToggle />
      </View>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: spacing["2xl"],
        }}
      >
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            backgroundColor: isDark
              ? colors.surfaceElevatedDark
              : colors.primaryLight,
            borderWidth: 1,
            borderColor,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing["2xl"],
          }}
        >
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <Ionicons name="cafe" size={48} color={colors.amber} />
          </Animated.View>
        </View>
        <Text
          style={{
            fontFamily: "Jakarta-Bold",
            fontSize: 22,
            color: textPrimary,
            marginBottom: spacing.sm,
          }}
        >
          On a break
        </Text>
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontSize: 15,
            color: textSecondary,
            textAlign: "center",
            marginBottom: spacing.xl,
          }}
        >
          You won&apos;t receive ride requests while on break.
        </Text>
        <Text
          accessibilityLabel={`Total break time ${hours} hours ${minutes} minutes ${secs} seconds`}
          style={{
            fontFamily: "Jakarta-Bold",
            fontSize: 36,
            color: textPrimary,
            fontVariant: ["tabular-nums"],
            marginBottom: spacing.xs,
          }}
        >
          {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:
          {String(secs).padStart(2, "0")}
        </Text>
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontSize: 12,
            color: textSecondary,
            marginBottom: spacing["3xl"],
          }}
        >
          Total break time
        </Text>
        {error ? (
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 14,
              color: colors.danger,
              marginBottom: spacing.md,
              textAlign: "center",
            }}
          >
            {error}
          </Text>
        ) : null}
        <TouchableOpacity
          onPress={handleEndBreak}
          accessibilityRole="button"
          accessibilityLabel="End break"
          disabled={ending}
          style={{
            width: "100%",
            paddingVertical: spacing.lg,
            borderRadius: radii.pill,
            alignItems: "center",
            backgroundColor: colors.primary,
            opacity: ending ? 0.5 : 1,
          }}
        >
          {ending ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 18,
                color: colors.white,
              }}
            >
              End Break
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
