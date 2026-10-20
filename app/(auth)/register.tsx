import { useState } from "react";
import { API_URL } from "@/lib/config";
import { setRegistrationHandoff } from "@/lib/registrationHandoff";
import { View, Text, TextInput, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import type { Gender } from "@/src/db/schema";

// S8 §4.1: required gender picker. "Prefer not to say" maps to 'unspecified'.
const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "unspecified", label: "Prefer not to say" },
];
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsDark } from "@/lib/useAppearance";
import CustomButton from "@/components/CustomButton";

export default function RegisterScreen() {
  const { phone: phoneParam, role: roleParam, terms: termsParam } = useLocalSearchParams<{
    phone?: string;
    role?: string;
    terms?: string;
  }>();
  // C1-1: consent flag carried from the phone-entry gate via otp-verify.
  const termsAccepted = termsParam === "1";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isDark = useIsDark();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const placeholderColor = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const handleRegister = async () => {
    if (name.length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // S8 §4.1: gender is required at signup (Prefer not to say is explicit).
    if (!gender) {
      setError("Please select your gender");
      return;
    }

    setLoading(true);
    setError("");

    // §2c/d/e: the three verification-gated roles have their own onboarding
    // wizard (documents → PENDING → admin queue, §7). The wizard owns the
    // submit for those roles because the payload carries the documents.
    const ROLE_WIZARD: Record<string, string> = {
      shop_owner: "/(auth)/register-shop-owner",
      fleet_owner: "/(auth)/register-fleet-owner",
      delivery_man: "/(auth)/register-delivery-man",
    };
    // C1-1: without the carried consent flag the server 400s terms_required.
    if (!termsAccepted) {
      setError("Please accept the Terms of Service and Privacy Policy to continue.");
      setLoading(false);
      return;
    }

    if (roleParam && ROLE_WIZARD[roleParam]) {
      // M-6 (§16): the password rides the registrationHandoff (never route
      // params — URLs leak into history/devtools/crash reports). A missing
      // handoff on the wizard side re-prompts here.
      // C1-1: consent rides the handoff so the wizard's submit carries it.
      setRegistrationHandoff({ phone: phoneParam ?? "", name, password, terms_accepted: true, gender });
      router.push(
        `${ROLE_WIZARD[roleParam]}?phone=${encodeURIComponent(phoneParam ?? "")}&role=${encodeURIComponent(roleParam)}`,
      );
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phoneParam ?? "",
          name,
          // Only rider/driver reach this POST — the wizard branch above owns
          // the other three roles (they submit their documents themselves).
          role: (roleParam ?? "rider") as "rider" | "driver",
          password,
          // C1-1: consent flag — register+api 400s terms_required without it.
          terms_accepted: true,
          // S8 §4.1: self-declared gender carried in POST /api/register body.
          gender,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || data.error || "Registration failed");
        logger.error("[auth] register failed", data);
        setLoading(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        phone: phoneParam ?? "",
        password,
      });

      if (signInError) {
        setError("Registration successful but login failed. Please login manually.");
        logger.error("[auth] signInWithPassword failed", signInError);
        router.replace(`/(auth)/login?phone=${encodeURIComponent(phoneParam ?? "")}`);
        return;
      }

      if (roleParam === "driver") {
        router.replace("/(main)/(rider)/d");
      } else {
        router.replace("/(auth)/enable-location");
      }
    } catch (e) {
      setError("Registration failed. Please try again.");
      logger.error("[auth] register error", e);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 px-6 justify-center" style={{ backgroundColor: bg }}>
      <Text
        className="text-[28px] font-JakartaBold font-bold mb-1"
        style={{ color: textPrimary }}
      >
        Complete Registration
      </Text>
      <Text
        className="text-[14px] font-JakartaBold mb-6"
        style={{ color: textSecondary }}
      >
        Enter your details to create your account
      </Text>

      {/* Name Input */}
      <View
        className="flex-row items-center rounded-xl border px-4 mb-4"
        style={{ backgroundColor: surfaceBg, borderColor: borderColor }}
      >
        <TextInput
          className="flex-1 py-4 text-[15px] font-JakartaBold"
          style={{ color: textPrimary }}
          placeholder="Full Name"
          placeholderTextColor={placeholderColor}
          value={name}
          onChangeText={setName}
         testID="register.set-name"/>
      </View>

      {/* Password Input */}
      <View
        className="flex-row items-center rounded-xl border px-4 mb-4"
        style={{ backgroundColor: surfaceBg, borderColor: borderColor }}
      >
        <TextInput
          className="flex-1 py-4 text-[15px] font-JakartaBold"
          style={{ color: textPrimary }}
          placeholder="Password (min 6 characters)"
          placeholderTextColor={placeholderColor}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
         testID="register.set-password"/>
      </View>

      {/* Confirm Password Input */}
      <View
        className="flex-row items-center rounded-xl border px-4 mb-4"
        style={{ backgroundColor: surfaceBg, borderColor: borderColor }}
      >
        <TextInput
          className="flex-1 py-4 text-[15px] font-JakartaBold"
          style={{ color: textPrimary }}
          placeholder="Confirm Password"
          placeholderTextColor={placeholderColor}
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
         testID="register.set-confirm-password"/>
      </View>

      {/* S8 §4.1: Required gender picker */}
      <Text
        className="text-[14px] font-JakartaBold mb-2"
        style={{ color: textSecondary }}
      >
        Gender
      </Text>
      <View className="flex-row flex-wrap mb-4" testID="register.gender-picker">
        {GENDER_OPTIONS.map((opt) => {
          const selected = gender === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setGender(opt.value)}
             
              className="rounded-xl border px-4 py-3 mr-2 mb-2"
              style={{
                backgroundColor: selected ? colors.primary : surfaceBg,
                borderColor: selected ? colors.primary : borderColor,
              }}
             testID="register.set-gender">
              <Text
                className="text-[14px] font-JakartaBold"
                style={{ color: selected ? colors.textPrimaryDark : textPrimary }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
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
        title={loading ? "Registering..." : "Register"}
        onPress={handleRegister}
        disabled={loading}
       testID="register.handle-register"/>
    </SafeAreaView>
  );
}
