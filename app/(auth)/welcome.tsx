import { View, Text, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import CustomButton from "@/components/CustomButton";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

export default function WelcomeScreen() {
  const isDark = useIsDark();

  return (
    <SafeAreaView
      className="flex-1 px-6"
      style={{
        backgroundColor: isDark ? colors.bgDark : colors.bgLight,
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
            color: isDark ? colors.textPrimaryDark : colors.textPrimaryLight,
          }}
        >
          Welcome to Ride
        </Text>
        <Text
          className="text-[16px] font-Jakarta text-center mb-12"
          style={{
            color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
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
            backgroundColor: isDark ? colors.primary + "1A" : colors.primary + "14",
          }}
        >
          <Ionicons name="car" size={64} color={colors.primary} />
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
