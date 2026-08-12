import { View, Text, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import CustomButton from "@/components/CustomButton";
import { useAppearance } from "@/lib/useAppearance";

export default function WelcomeScreen() {
  const { theme } = useAppearance();
  const isDark = theme === "dark" || theme === "system";

  return (
    <SafeAreaView
      className="flex-1 px-6"
      style={{
        backgroundColor: isDark ? "#181A20" : "#F8FAFC",
      }}
    >
      {/* Top spacer */}
      <View className="flex-1" />

      {/* Logo + Title */}
      <View className="items-center">
        <Image
          source={require("@/assets/logo/logo.png")}
          className="w-24 h-24 rounded-xl mb-6"
          resizeMode="contain"
        />
        <Text
          className="text-[32px] font-JakartaBold mb-2 text-center"
          style={{
            color: isDark ? "#FFFFFF" : "#1C1E23",
          }}
        >
          Welcome to Ride
        </Text>
        <Text
          className="text-[16px] font-Jakarta text-center mb-12"
          style={{
            color: isDark ? "#9CA3AF" : "#6B7280",
          }}
        >
          Your ride, your way. Get started in seconds.
        </Text>
      </View>

      {/* Illustration placeholder */}
      <View className="items-center mb-12">
        <View
          className="w-48 h-48 rounded-full items-center justify-center"
          style={{
            backgroundColor: isDark ? "rgba(12,194,95,0.1)" : "rgba(12,194,95,0.08)",
          }}
        >
          <Text className="text-[64px]">🚗</Text>
        </View>
      </View>

      {/* Bottom spacer */}
      <View className="flex-1" />

      {/* Buttons */}
      <View className="w-full pb-10 gap-3">
        <CustomButton
          title="Sign In"
          onPress={() => router.replace("/(auth)/phone-entry")}
        />
        <CustomButton
          title="Create Account"
          bgVariant="secondary"
          onPress={() => router.replace("/(auth)/phone-entry")}
        />
      </View>
    </SafeAreaView>
  );
}
