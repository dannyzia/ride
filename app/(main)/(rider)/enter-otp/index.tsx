import { colors, spacing } from "@/theme/goRide";
import { View, Text, Animated, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import CustomButton from "@/components/CustomButton";
import PinInput from "@/components/PinInput";
import { useRideOfferStore, useWSStore } from "@/store";
import { router } from "expo-router";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

const EnterOtp = () => {
  const [pinInput, setPinInput] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const { ws } = useWSStore();
  const { activeRideId } = useRideOfferStore();
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const shakeAnim = useRef(new Animated.Value(0)).current;
  // N4: guard against a half-open socket swallowing ride:started — without a
  // timeout the button stays "Starting..." forever and the retry guard blocks
  // re-submission.
  const verifyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearVerifyTimeout = () => {
    if (verifyTimeoutRef.current) {
      clearTimeout(verifyTimeoutRef.current);
      verifyTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearVerifyTimeout();
  }, []);

  useEffect(() => {
    if (!error) return;
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [error, shakeAnim]);

  // The server is the source of truth for the Ride Pin (rides.start_pin).
  // We send what the driver typed and react to the server's verdict — the
  // driver app never holds the correct PIN itself.
  useEffect(() => {
    if (!ws) return;
    const onMessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data);
        if (!activeRideId || msg.ride_id !== activeRideId) return;
        if (msg.type === "ride:started") {
          clearVerifyTimeout();
          setVerifying(false);
          router.replace("/(main)/(rider)/finish-ride");
        } else if (msg.type === "ride:start_failed") {
          clearVerifyTimeout();
          setVerifying(false);
          setError(t("enter_otp.incorrect_pin"));
          setPinInput("");
        }
      } catch {
        // ignore non-JSON messages
      }
    };
    ws.addEventListener("message", onMessage);
    return () => ws.removeEventListener("message", onMessage);
  }, [ws, activeRideId]);

  const handleVerify = () => {
    if (verifying) return;
    setError("");
    if (pinInput.length !== 4 || !activeRideId) {
      setError(t("enter_otp.enter_pin"));
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError(t("enter_otp.not_connected"));
      return;
    }
    setVerifying(true);
    ws.send(
      JSON.stringify({
        type: "ride:start",
        ride_id: activeRideId,
        pin: pinInput,
      }),
    );
    verifyTimeoutRef.current = setTimeout(() => {
      setVerifying(false);
      setError(t("enter_otp.no_response"));
    }, 15_000);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      {/* M-6: appearance toggle — this screen has no header row, so it floats
          top-right like find-customer's. */}
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        accessibilityRole="button"
        accessibilityLabel={isDark ? "Switch to light theme" : "Switch to dark theme"}
        style={{
          position: "absolute",
          top: 64,
          right: spacing.xl,
          zIndex: 11,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
          borderWidth: 1,
          borderColor: isDark ? colors.borderDark : colors.borderLight,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name={isDark ? "moon-outline" : "sunny-outline"}
          size={18}
          color={textPrimary}
        />
      </TouchableOpacity>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing["2xl"] }}>
        <Text
          style={{
            fontSize: 24,
            fontFamily: "Jakarta-Bold",
            color: textPrimary,
            marginBottom: spacing.md,
          }}
        >
          {t("enter_otp.title")}
        </Text>
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontSize: 14,
            color: textSecondary,
            textAlign: "center",
            marginBottom: spacing["2xl"],
          }}
        >
          {t("enter_otp.description")}
        </Text>

        <Animated.View
          style={{
            width: "100%",
            transform: [
              {
                translateX: shakeAnim.interpolate({
                  inputRange: [-1, 1],
                  outputRange: [-8, 8],
                }),
              },
            ],
            borderWidth: error ? 1.5 : 0,
            borderColor: colors.danger,
            borderRadius: 12,
            paddingBottom: spacing.xs,
            marginBottom: spacing["2xl"],
          }}
        >
          <PinInput
            value={pinInput}
            onChange={setPinInput}
            length={4}
            error={!!error}
            accessibilityLabel="Ride PIN"
          />
        </Animated.View>

        {error && (
          <View style={{ alignItems: "center", justifyContent: "center", marginBottom: spacing.md }}>
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 15,
                color: colors.danger,
                textAlign: "center",
              }}
            >
              {error}
            </Text>
          </View>
        )}

        <CustomButton
          title={verifying ? t("enter_otp.starting") : t("enter_otp.start_ride")}
          onPress={handleVerify}
          bgVariant="primary"
          textVariant="primary"
          className="w-full"
        />
      </View>
    </SafeAreaView>
  );
};

export default EnterOtp;
