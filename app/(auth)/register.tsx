import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppearance } from "@/lib/useAppearance";
import CustomButton from "@/components/CustomButton";

export default function RegisterScreen() {
  const { phone: phoneParam, role: roleParam } = useLocalSearchParams<{ phone?: string; role?: string }>();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { theme } = useAppearance();
  const isDark = theme === "dark" || theme === "system";

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

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phoneParam ?? "",
          name,
          role: (roleParam ?? "rider") as "rider" | "driver",
          password,
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
        router.replace("/(main)/(rider)");
      } else {
        router.replace("/(auth)/enable-location");
      }
    } catch (e: any) {
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
        />
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
        />
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
        title={loading ? "Registering..." : "Register"}
        onPress={handleRegister}
        disabled={loading}
      />
    </SafeAreaView>
  );
}
