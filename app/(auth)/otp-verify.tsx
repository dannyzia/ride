import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsDark } from "@/lib/useAppearance";
import CustomButton from "@/components/CustomButton";

export default function OtpVerifyScreen() {
  const { phone: phoneParam, role: roleParam, terms: termsParam } = useLocalSearchParams<{
    phone?: string;
    role?: string;
    terms?: string;
  }>();
  const phone = phoneParam ?? "";
  // C1-1: consent flag carried from the phone-entry gate → register.
  const termsCarried = termsParam === "1";
  // C1-9: bilingual copy (D3 rider) — no hardcoded screen strings.
  const { t } = useTranslation();

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const otpSentRef = useRef(false);
  // C1-3a: 30s client-side resend cooldown (the server 5/5min cap stays
  // the abuse bound — this is UX pacing, not security).
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const isDark = useIsDark();

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
        setError(data.message || t("auth.otp_verify.err_failed"));
        logger.error("[auth] send-otp failed", data);
        return;
      }

      setSessionId(data.sessionId);
      // C1-3a: start the 30s cooldown on every successful send.
      setCooldown(30);
    } catch (e) {
      setError(t("auth.otp_verify.err_failed"));
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

  // C1-3b escape (REPAIR-1): named so the testID codemod derives
  // otp-verify.change-number from source (an inline router.back() arrow
  // derives nothing and falls back to el-1, which does not round-trip).
  const changeNumber = () => router.back();

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setError(t("auth.otp_verify.err_invalid"));
      return;
    }

    if (!sessionId) {
      setError(t("auth.otp_verify.err_wait"));
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
        setError(data.message || t("auth.otp_verify.err_failed"));
        logger.error("[auth] verify-otp failed", data);
        return;
      }

      // S2.1 D-1 (§16): this app has exactly ONE session mechanism —
      // signInWithPassword (the custom dpRelay OTP proves phone ownership,
      // never mints a Supabase session). So for an EXISTING account the OTP
      // completes on the password screen, where SIGNED_IN fires and the auth
      // gate routes: multi-role → Login-as chooser (OWNER-DECISION #9),
      // single-role → its surface directly. Previously an existing phone that
      // reached this screen pushed register — a duplicate-phone API error.
      try {
        const checkRes = await fetch(`${API_URL}/api/auth/check-user`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const check = await checkRes.json();
        if (checkRes.ok && check.exists) {
          router.replace(`/(auth)/login?phone=${encodeURIComponent(phone)}`);
          return;
        }
      } catch (checkErr) {
        // fall through to register — check-user failing must not strand a
        // genuine first-time registration.
        logger.warn("[auth] check-user failed, continuing to register", checkErr);
      }

      // C1-1: carry the consent flag forward — register+api 400s without it.
      router.push(
        `/(auth)/register?phone=${encodeURIComponent(phone)}&role=${roleParam ?? "rider"}${termsCarried ? "&terms=1" : ""}`,
      );
    } catch (e) {
      setError(t("auth.otp_verify.err_failed"));
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
        {t("auth.otp_verify.title")}
      </Text>
      <Text
        className="text-[14px] font-JakartaBold mb-6"
        style={{ color: textSecondary }}
      >
        {t("auth.otp_verify.subtitle", { phone })}
      </Text>

      <View
        className="flex-row items-center rounded-xl border px-4 mb-4"
        style={{ backgroundColor: surfaceBg, borderColor: borderColor }}
      >
        <TextInput
          className="flex-1 py-4 text-[15px] font-JakartaBold"
          style={{ color: textPrimary }}
          placeholder={t("auth.otp_verify.placeholder")}
          placeholderTextColor={placeholderColor}
          keyboardType="number-pad"
          value={otp}
          onChangeText={(text) => {
            setOtp(text);
            if (error) setError("");
          }}
          maxLength={6}
         testID="otp-verify.set-otp"/>
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
        title={loading ? t("auth.otp_verify.verifying") : t("auth.otp_verify.verify")}
        onPress={handleVerifyOtp}
        disabled={isLoading || !sessionId}
       testID="otp-verify.handle-verify-otp"/>

      <TouchableOpacity
        onPress={sendOtp}
        disabled={isLoading || cooldown > 0}
        className="items-center mt-4"
       testID="otp-verify.send-otp">
        <Text
          className="text-[14px] font-JakartaBold"
          style={{ color: cooldown > 0 ? textSecondary : colors.primary }}
        >
          {cooldown > 0
            ? t("auth.otp_verify.resend_in", { seconds: cooldown })
            : t("auth.otp_verify.resend")}
        </Text>
      </TouchableOpacity>

      {/* C1-3b: change-number escape — the auth layout hides the header,
          so a wrong-number user would otherwise be stranded here. */}
      <TouchableOpacity
        onPress={changeNumber}
        className="items-center mt-3"
        testID="otp-verify.change-number">
        <Text
          className="text-[14px] font-JakartaBold"
          style={{ color: textSecondary }}
        >
          {t("auth.otp_verify.change_number")}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
