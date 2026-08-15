import { colors, spacing } from "@/theme/goRide";
import { View, Text, Animated } from "react-native";
import React, { useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import CustomButton from "@/components/CustomButton";
import { useRideOfferStore, useWSStore } from "@/store";
import { router } from "expo-router";
import { OtpInput } from "react-native-otp-entry";
import { useIsDark } from "@/lib/useAppearance";

const EnterOtp = () => {
  const [pinInput, setPinInput] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const { ws } = useWSStore();
  const { activeRideId } = useRideOfferStore();
  const isDark = useIsDark();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const pinBorder = isDark ? colors.borderDark : colors.textDisabledLight;

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
          setError("Incorrect Ride Pin. Ask your rider and try again.");
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
      setError("Please enter the 4-digit Ride Pin.");
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError("Not connected to server. Please try again.");
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
      setError("No response from server. Please try again.");
    }, 15_000);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing["2xl"] }}>
        <Text
          style={{
            fontSize: 24,
            fontFamily: "Jakarta-Bold",
            color: textPrimary,
            marginBottom: spacing.md,
          }}
        >
          Ride Pin
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
          Enter the 4-digit Ride Pin your rider gave you to start the ride.
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
          }}
        >
          <OtpInput
            numberOfDigits={4}
            onTextChange={setPinInput}
            focusColor={colors.primary}
            placeholder="*"
            type="numeric"
            theme={{
              containerStyle: {
                width: "100%",
                justifyContent: "space-between",
                flexDirection: "row",
                marginBottom: spacing["2xl"],
              },
              pinCodeContainerStyle: {
                borderWidth: 1,
                borderColor: pinBorder,
                borderRadius: 8,
                paddingVertical: 12,
                width: 60,
                height: 60,
                justifyContent: "center",
                alignItems: "center",
              },
              pinCodeTextStyle: {
                fontSize: 18,
                textAlign: "center",
                letterSpacing: 6,
                color: textPrimary,
              },
              focusStickStyle: {
                backgroundColor: colors.primary,
                width: 2,
                height: 24,
              },
              focusedPinCodeContainerStyle: {
                borderColor: colors.primary,
              },
              filledPinCodeContainerStyle: {
                borderColor: isDark ? colors.textSecondaryDark : colors.gray600,
              },
              disabledPinCodeContainerStyle: {
                backgroundColor: isDark ? colors.surfaceElevatedDark : colors.gray200,
              },
              placeholderTextStyle: {
                color: textSecondary,
              },
            }}
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
          title={verifying ? "Starting..." : "Start Ride"}
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
