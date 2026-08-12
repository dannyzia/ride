import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors } from "@/theme/goRide";
import { useAppearance } from "@/lib/useAppearance";
import CustomButton from "@/components/CustomButton";

export default function DriverWelcome() {
  const { theme } = useAppearance();
  const isDark = theme === "dark" || theme === "system";

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <SafeAreaView className="flex-1 px-6 items-center justify-center" style={{ backgroundColor: bg }}>
      <View className="flex-1 items-center justify-center">
        <Text
          className="text-[40px] font-JakartaBold mb-2"
          style={{ color: colors.primary }}
        >
          Ride Driver
        </Text>
        <Text
          className="text-[16px] font-Jakarta text-center"
          style={{ color: textSecondary }}
        >
          Start earning today. Sign up or log in to continue.
        </Text>
      </View>

      <View className="w-full pb-10 gap-3">
        <CustomButton
          title="Driver Sign In"
          onPress={() => router.replace("/(auth)/phone-entry")}
        />
        <CustomButton
          title="Driver Sign Up"
          bgVariant="secondary"
          onPress={() => router.replace("/(auth)/phone-entry")}
        />
      </View>
    </SafeAreaView>
  );
}