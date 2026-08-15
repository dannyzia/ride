import { useRef, useState } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { showToast } from "@/components/Toast";
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

export default function RateRider() {
  const isDark = useIsDark();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [rating, setRating] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submitted = useRef(false);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const goHomeDelayed = () => {
    // Non-blocking toast (spec §4.4: submit → toast → router.replace); brief
    // pause lets the driver register the confirmation before navigating.
    setTimeout(() => router.replace("/(main)/(rider)"), 1400);
  };

  const handleSubmit = async () => {
    if (submitted.current) return;
    if (rating === 0) {
      setError("Please select a rating");
      return;
    }
    if (!rideId) {
      setError("No ride to rate");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not authenticated");
        return;
      }
      const res = await fetch(`${API_URL}/api/ride/${rideId}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rating, role: "driver" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && data.error === "already_rated") {
          showToast("You have already rated this ride.", "info");
          goHomeDelayed();
          return;
        }
        setError(data.message || data.error || "Failed to submit rating");
        return;
      }
      submitted.current = true;
      showToast("Rating submitted — thank you!");
      goHomeDelayed();
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Rate rider failed", err);
    } finally {
      setLoading(false);
    }
  };

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
          Rate Rider
        </Text>
        <HeaderThemeToggle />
      </View>
      <View
        style={{ flex: 1, alignItems: "center", paddingHorizontal: spacing["2xl"], paddingTop: 40 }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing.md,
          }}
        >
          <Ionicons name="person" size={32} color={textSecondary} />
        </View>
        <Text
          style={{
            fontFamily: "Jakarta-Bold",
            fontSize: 20,
            color: textPrimary,
            marginBottom: spacing["2xl"],
          }}
        >
          Rider
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: spacing.sm,
            marginBottom: spacing["2xl"],
          }}
        >
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity
              key={star}
              onPress={() => setRating(star)}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${star} ${star === 1 ? "star" : "stars"}`}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Ionicons
                name={star <= rating ? "star" : "star-outline"}
                size={36}
                color={star <= rating ? colors.amber : colors.gray600}
              />
            </TouchableOpacity>
          ))}
        </View>
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
          onPress={handleSubmit}
          accessibilityRole="button"
          accessibilityLabel="Submit rating"
          disabled={loading || rating === 0}
          style={{
            width: "100%",
            paddingVertical: spacing.lg,
            borderRadius: radii.pill,
            alignItems: "center",
            backgroundColor: colors.primary,
            opacity: rating === 0 ? 0.5 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 18,
                color: colors.white,
              }}
            >
              Submit Rating
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
