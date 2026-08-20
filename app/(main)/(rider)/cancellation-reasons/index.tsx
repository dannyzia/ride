import { useState } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors, spacing, radii } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useRideOfferStore } from "@/store";

const REASONS = [
  "Rider no-show",
  "Wrong address shown",
  "Vehicle issue",
  "Personal emergency",
  "Other",
];

const OTHER_REASON = "Other";

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

export default function CancellationReasons() {
  const isDark = useIsDark();
  const { rideId: rideIdParam } = useLocalSearchParams<{
    rideId: string;
  }>();
  const { activeRideId, removeRideOffer } = useRideOfferStore();
  const rideId = rideIdParam || activeRideId;

  const [selected, setSelected] = useState("");
  const [otherText, setOtherText] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const goHome = () => router.replace("/(main)/(rider)");

  const handleConfirm = async () => {
    if (!selected) return;
    if (!rideId) {
      setError("No active ride to cancel");
      return;
    }
    const reason =
      selected === OTHER_REASON ? otherText.trim() || OTHER_REASON : selected;
    setCancelling(true);
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
      const res = await fetch(`${API_URL}/api/ride/${rideId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && data.error === "ride_not_cancellable") {
          Alert.alert(
            "Cannot cancel",
            "This ride can no longer be cancelled because it is already in progress or finished.",
            [{ text: "OK", onPress: goHome }],
          );
          return;
        }
        setError(data.message || data.error || "Failed to cancel ride");
        return;
      }
      removeRideOffer(rideId);
      goHome();
    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)) || "Network error");
      logger.error("Cancel ride failed", err);
    } finally {
      setCancelling(false);
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
          Cancel Ride
        </Text>
        <HeaderThemeToggle />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 14,
              color: textSecondary,
              marginBottom: spacing.md,
            }}
          >
            Please select a reason for cancellation
          </Text>
          {REASONS.map((r) => {
            const isSelected = selected === r;
            return (
              <TouchableOpacity
                key={r}
                onPress={() => setSelected(r)}
                accessibilityRole="button"
                accessibilityLabel={`Reason: ${r}${isSelected ? ", selected" : ""}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: spacing.md,
                  marginBottom: spacing.sm,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  backgroundColor: surfaceBg,
                  borderColor: isSelected ? colors.danger : borderColor,
                }}
              >
                <Ionicons
                  name={
                    isSelected ? "radio-button-on" : "radio-button-off"
                  }
                  size={20}
                  color={isSelected ? colors.danger : colors.gray600}
                  style={{ marginRight: spacing.md }}
                />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "Jakarta-Medium",
                    fontSize: 15,
                    color: textPrimary,
                  }}
                >
                  {r}
                </Text>
              </TouchableOpacity>
            );
          })}
          {selected === OTHER_REASON ? (
            <TextInput
              value={otherText}
              onChangeText={setOtherText}
              multiline
              maxLength={255}
              placeholder="Tell us what happened (optional)"
              placeholderTextColor={textSecondary}
              accessibilityLabel="Other cancellation reason"
              accessibilityHint="Describe the reason for cancellation, up to 255 characters"
              style={{
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor,
                borderRadius: radii.md,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                fontFamily: "Jakarta-Regular",
                fontSize: 15,
                color: textPrimary,
                minHeight: 90,
                textAlignVertical: "top",
                marginTop: spacing.sm,
                marginBottom: spacing.sm,
              }}
            />
          ) : null}
          {error ? (
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 14,
                color: colors.danger,
                marginBottom: spacing.md,
                marginTop: spacing.sm,
              }}
            >
              {error}
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={handleConfirm}
            accessibilityRole="button"
            accessibilityLabel="Confirm cancellation"
            disabled={!selected || cancelling}
            style={{
              width: "100%",
              paddingVertical: spacing.lg,
              borderRadius: radii.pill,
              alignItems: "center",
              backgroundColor: colors.danger,
              opacity: !selected || cancelling ? 0.5 : 1,
              marginTop: spacing.md,
            }}
          >
            {cancelling ? (
              <ActivityIndicator size={20} color={colors.white} />
            ) : (
              <Text
                style={{
                  fontFamily: "Jakarta-Bold",
                  fontSize: 18,
                  color: colors.white,
                }}
              >
                Confirm Cancellation
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
