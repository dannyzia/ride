import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsDark } from "@/lib/useAppearance";
import CustomButton from "@/components/CustomButton";

function stripCountryCode(phone: string): string {
  if (phone.startsWith("+880")) return phone.slice(4);
  if (phone.startsWith("880")) return phone.slice(3);
  return phone.replace(/^0+/, "");
}

export default function LoginScreen() {
  const { phone: phoneParam } = useLocalSearchParams<{ phone?: string }>();
  const [phone, setPhone] = useState(stripCountryCode(phoneParam ?? ""));
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isDark = useIsDark();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const placeholderColor = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const handleLogin = async () => {
    const fullPhone = `+880${phone}`;
    if (fullPhone.length !== 14) {
      setError("Enter a valid phone number");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        phone: fullPhone,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        logger.error("[auth] signInWithPassword failed", signInError);
        return;
      }

      // Auth gate in _layout.tsx handles redirect — do NOT navigate manually here.
    } catch (e: any) {
      setError("Login failed. Please try again.");
      logger.error("[auth] login error", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 px-6 justify-center" style={{ backgroundColor: bg }}>
      <Text
        className="text-[28px] font-JakartaBold font-bold mb-1"
        style={{ color: textPrimary }}
      >
        Welcome Back
      </Text>
      <Text
        className="text-[14px] font-JakartaBold mb-6"
        style={{ color: textSecondary }}
      >
        Enter your phone number and password to login
      </Text>

      {/* Phone Input */}
      <View
        className="flex-row items-center rounded-xl border px-4 mb-4"
        style={{ backgroundColor: surfaceBg, borderColor: borderColor }}
      >
        <Text
          className="text-[15px] font-JakartaBold mr-2"
          style={{ color: textSecondary }}
        >
          +880
        </Text>
        <TextInput
          className="flex-1 py-4 text-[15px] font-JakartaBold"
          style={{ color: textPrimary }}
          placeholder="1XXXXXXXXX"
          placeholderTextColor={placeholderColor}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={(text) => {
            setPhone(text.replace(/\D/g, "").replace(/^0+/, "").slice(0, 10));
            if (error) setError("");
          }}
          maxLength={10}
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
          placeholder="Password"
          placeholderTextColor={placeholderColor}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          value={password}
          onChangeText={setPassword}
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
        title={loading ? "Logging in..." : "Login"}
        onPress={handleLogin}
        disabled={loading}
      />

      <TouchableOpacity
        onPress={() => router.push("/(auth)/forgot-password")}
        className="items-center mt-4"
      >
        <Text
          className="text-[14px] font-JakartaBold"
          style={{ color: colors.primary }}
        >
          Forgot Password?
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
