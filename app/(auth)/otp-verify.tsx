import { useState, useEffect, useRef, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppearance } from "@/lib/useAppearance";
import CustomButton from "@/components/CustomButton";

export default function OtpVerifyScreen() {
  const { phone: phoneParam, role: roleParam } = useLocalSearchParams<{ phone?: string; role?: string }>();
  const phone = phoneParam ?? "";

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const otpSentRef = useRef(false);

  const { theme } = useAppearance();
  const isDark = theme === "dark" || theme === "system";

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const placeholderColor = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const sendOtp = useCallback(async () => {
    if (!phone) return;
    setSending(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Failed to send OTP");
        logger.error("[auth] send-otp failed", data);
        return;
      }

      setSessionId(data.sessionId);
    } catch (e: any) {
      setError("Failed to send OTP. Please try again.");
      logger.error("[auth] send otp error", e);
    } finally {
      setSending(false);
    }
  }, [phone]);

  useEffect(() => {
    if (otpSentRef.current) return;
    otpSentRef.current = true;
    sendOtp();
  }, [sendOtp]);

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setError("Enter a valid 6-digit OTP");
      return;
    }

    if (!sessionId) {
      setError("Please wait for the OTP to be sent");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, otp }),
      });

      const data = await response.json();

      if (!response.ok || !data.verified) {
        setError(data.message || "Invalid OTP");
        logger.error("[auth] verify-otp failed", data);
        return;
      }

      router.push(`/(auth)/register?phone=${encodeURIComponent(phone)}&role=${roleParam}`);
    } catch (e: any) {
      setError("Failed to verify OTP. Please try again.");
      logger.error("[auth] verify otp error", e);
    } finally {
      setLoading(false);
    }
  };

  const isLoading = loading || sending;

  return (
    <SafeAreaView className="flex-1 px-6 justify-center" style={{ backgroundColor: bg }}>
      <Text
        className="text-[28px] font-JakartaBold font-bold mb-1"
        style={{ color: textPrimary }}
      >
        Verify OTP
      </Text>
      <Text
        className="text-[14px] font-JakartaBold mb-6"
        style={{ color: textSecondary }}
      >
        Enter the 6-digit code sent to {phone}
      </Text>

      <View
        className="flex-row items-center rounded-xl border px-4 mb-4"
        style={{ backgroundColor: surfaceBg, borderColor: borderColor }}
      >
        <TextInput
          className="flex-1 py-4 text-[15px] font-JakartaBold"
          style={{ color: textPrimary }}
          placeholder="Enter 6-digit OTP"
          placeholderTextColor={placeholderColor}
          keyboardType="number-pad"
          value={otp}
          onChangeText={setOtp}
          maxLength={6}
        />
      </View>

      {error ? (
        <Text
          className="text-[14px] font-JakartaBold text-center mb-3"
          style={{ color: colors.danger }}
        >
          {error}
        </Text>
      ) : null}

      <CustomButton
        title={isLoading ? "Verifying..." : "Verify OTP"}
        onPress={handleVerifyOtp}
        disabled={isLoading || !sessionId}
      />

      <TouchableOpacity
        onPress={sendOtp}
        disabled={isLoading}
        className="items-center mt-4"
      >
        <Text
          className="text-[14px] font-JakartaBold"
          style={{ color: colors.primary }}
        >
          Resend OTP
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
