import { useState } from "react";
import { API_URL } from "@/lib/config";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PhoneEntryScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"rider" | "driver">("rider");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    const fullPhone = `+880${phone.replace(/^0+/, "")}`;
    if (fullPhone.length < 13) {
      setError("Enter a valid phone number");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const checkResponse = await fetch(
        `${API_URL}/api/auth/check-user`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: fullPhone }),
        },
      );

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
        setError(
          "No account found with this phone number. Tap Register to create one.",
        );
      }
    } catch (e: any) {
      setError("Network error. Please try again.");
      logger.error("[auth] login check error", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    const fullPhone = `+880${phone.replace(/^0+/, "")}`;
    if (fullPhone.length < 13) {
      setError("Enter a valid phone number");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const checkResponse = await fetch(
        `${API_URL}/api/auth/check-user`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: fullPhone }),
        },
      );

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
        router.push(
          `/(auth)/otp-verify?phone=${encodeURIComponent(fullPhone)}&role=${role}`,
        );
      }
    } catch (e: any) {
      setError("Network error. Please try again.");
      logger.error("[auth] register check error", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgDark">
      <StatusBar barStyle="light-content" backgroundColor={colors.bgDark} />
      <View className="flex-1 px-6 justify-center">
        {/* Logo */}
        <View className="items-center mb-10">
          <Image
            source={require("@/assets/logo/logo.png")}
            className="w-24 h-24 rounded-xl"
            resizeMode="contain"
          />
          <Text className="text-[28px] font-JakartaBold font-bold text-goTextPrimaryDark mb-3 leading-[1.2] tracking-[-0.5px]">
            Ride
          </Text>
          <Text className="text-[15px] font-JakartaBold text-goTextSecondaryDark mb-1">
            Your ride, your way
          </Text>
        </View>

        <Text className="text-[22px] font-JakartaBold font-bold text-goTextPrimaryDark mb-1">
          Get Started
        </Text>
        <Text className="text-[14px] font-JakartaBold text-goTextSecondaryDark mb-6">
          Enter your phone number to continue
        </Text>

        {/* Phone Input */}
        <View className="flex-row items-center bg-goSurfaceElevatedDark rounded-lg border border-goBorderDark px-4 mb-4">
          <Text className="text-[15px] font-JakartaBold text-goTextSecondaryDark mr-2">
            +880
          </Text>
          <TextInput
            className="flex-1 py-4 text-goTextPrimaryDark text-[15px] font-JakartaBold"
            placeholder="1XXXXXXXXX"
            placeholderTextColor={colors.textDisabledDark}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            maxLength={10}
          />
        </View>

        {/* Role Selector */}
        <View className="flex-row mb-6">
          <TouchableOpacity
            className={`flex-1 py-3 rounded-lg mr-1 items-center justify-center border border-goBorderDark
                       ${role === "rider" ? "bg-goPrimary" : "bg-goSurfaceElevatedDark"}`}
            onPress={() => setRole("rider")}
          >
            <Text
              className={`text-[14px] font-JakartaBold font-bold ${role === "rider" ? "text-goWhite" : "text-goTextSecondaryDark"}`}
            >
              Rider
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 py-3 rounded-lg ml-1 items-center justify-center border border-goBorderDark
                       ${role === "driver" ? "bg-goPrimary" : "bg-goSurfaceElevatedDark"}`}
            onPress={() => setRole("driver")}
          >
            <Text
              className={`text-[14px] font-JakartaBold font-bold ${role === "driver" ? "text-goWhite" : "text-goTextSecondaryDark"}`}
            >
              Driver
            </Text>
          </TouchableOpacity>
        </View>

        {error ? (
          <Text className="text-[14px] font-JakartaBold text-goDanger text-center mb-3">
            {error}
          </Text>
        ) : null}

        <View className="flex-row gap-x-3">
          <TouchableOpacity
            className={`flex-1 py-4 rounded-lg items-center justify-center
                         ${loading ? "bg-goBorderDark" : "bg-goPrimary"}`}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size={20} color={colors.white} />
            ) : (
              <Text className="text-[16px] font-JakartaBold font-bold text-goWhite">
                Login
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 py-4 rounded-lg items-center justify-center
                         ${loading ? "bg-goBorderDark" : "bg-goSurfaceElevatedDark"}`}
            onPress={handleRegister}
            disabled={loading}
            style={{ borderWidth: 1, borderColor: colors.borderDark }}
          >
            {loading ? null : (
              <Text className="text-[16px] font-JakartaBold font-bold text-goTextSecondaryDark">
                Register
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
