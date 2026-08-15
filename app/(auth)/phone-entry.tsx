import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity, Image } from "react-native";
import { useRouter } from "expo-router";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsDark } from "@/lib/useAppearance";
import CustomButton from "@/components/CustomButton";

export default function PhoneEntryScreen() {
  const router = useRouter();
  const isDark = useIsDark();

  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"rider" | "driver">("rider");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const handleLogin = async () => {
    const fullPhone = `+880${phone}`;
    if (fullPhone.length !== 14) {
      setError("Enter a valid phone number");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const checkResponse = await fetch(`${API_URL}/api/auth/check-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });

      const checkData = await checkResponse.json();

      if (!checkResponse.ok) {
        const msg =
          typeof checkData.message === "string"
            ? checkData.message
            : checkData.error || "Failed to check phone number";
        setError(msg);
        return;
      }

      if (checkData.exists) {
        router.push(`/(auth)/login?phone=${encodeURIComponent(fullPhone)}`);
      } else {
        setError("No account found with this phone number. Tap Register to create one.");
      }
    } catch (e: any) {
      setError("Network error. Please try again.");
      logger.error("[auth] login check error", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    const fullPhone = `+880${phone}`;
    if (fullPhone.length !== 14) {
      setError("Enter a valid phone number");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const checkResponse = await fetch(`${API_URL}/api/auth/check-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });

      const checkData = await checkResponse.json();

      if (!checkResponse.ok) {
        const msg =
          typeof checkData.message === "string"
            ? checkData.message
            : checkData.error || "Failed to check phone number";
        setError(msg);
        return;
      }

      if (checkData.exists) {
        setError("An account with this phone already exists. Please login.");
      } else {
        router.push(`/(auth)/otp-verify?phone=${encodeURIComponent(fullPhone)}&role=${role}`);
      }
    } catch (e: any) {
      setError("Network error. Please try again.");
      logger.error("[auth] register check error", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 px-6 justify-center" style={{ backgroundColor: bg }}>
      {/* Logo */}
      <View className="items-center mb-10">
        <Image
          source={require("@/assets/logo/logo.png")}
          className="w-24 h-24 rounded-xl"
          resizeMode="contain"
        />
        <Text
          className="text-[28px] font-JakartaBold font-bold mb-3 leading-[1.2] tracking-[-0.5px]"
          style={{ color: textPrimary }}
        >
          Ride
        </Text>
        <Text
          className="text-[15px] font-JakartaBold mb-1"
          style={{ color: textSecondary }}
        >
          Your ride, your way
        </Text>
      </View>

      <Text
        className="text-[22px] font-JakartaBold font-bold mb-1"
        style={{ color: textPrimary }}
      >
        Get Started
      </Text>
      <Text
        className="text-[14px] font-JakartaBold mb-6"
        style={{ color: textSecondary }}
      >
        Enter your phone number to continue
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
          placeholderTextColor={isDark ? colors.textDisabledDark : colors.textDisabledLight}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={(text) => {
            setPhone(text.replace(/\D/g, "").replace(/^0+/, "").slice(0, 10));
            if (error) setError("");
          }}
          maxLength={10}
        />
      </View>

      {/* Role Selector - Pill Shape */}
      <View
        className="flex-row mb-6 rounded-full p-1"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor: borderColor }}
      >
        <TouchableOpacity
          className="flex-1 py-3 rounded-full items-center justify-center"
          style={{
            backgroundColor: role === "rider" ? colors.primary : "transparent",
          }}
          onPress={() => setRole("rider")}
        >
          <Text
            className="text-[14px] font-JakartaBold font-bold"
            style={{ color: role === "rider" ? colors.white : textSecondary }}
          >
            Rider
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 py-3 rounded-full items-center justify-center"
          style={{
            backgroundColor: role === "driver" ? colors.primary : "transparent",
          }}
          onPress={() => setRole("driver")}
        >
          <Text
            className="text-[14px] font-JakartaBold font-bold"
            style={{ color: role === "driver" ? colors.white : textSecondary }}
          >
            Driver
          </Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <Text className="text-[14px] font-JakartaBold text-center mb-3" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}

      <View className="gap-y-3">
        <CustomButton
          title={loading ? "Loading..." : "Login"}
          onPress={handleLogin}
          disabled={loading}
        />
        <CustomButton
          title={loading ? "" : "Register"}
          bgVariant="secondary"
          onPress={handleRegister}
          disabled={loading}
        />
      </View>
    </SafeAreaView>
  );
}
