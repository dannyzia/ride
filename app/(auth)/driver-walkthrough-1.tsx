import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import CustomButton from "@/components/CustomButton";

export default function DriverWalkthrough1() {
  const isDark = useIsDark();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <SafeAreaView className="flex-1 px-6" style={{ backgroundColor: bg }}>
      {/* Top spacer */}
      <View className="flex-1" />

      {/* Illustration placeholder */}
      <View className="items-center mb-10">
        <View
          className="w-56 h-56 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.primary + "15" }}
        >
          <Ionicons name="call" size={80} color={colors.primary} />
        </View>
      </View>

      {/* Title */}
      <Text
        className="text-[28px] font-JakartaBold text-center mb-3"
        style={{ color: textPrimary }}
      >
        Earn More
      </Text>

      {/* Description */}
      <Text
        className="text-[16px] font-Jakarta text-center px-4 leading-[24px]"
        style={{ color: textSecondary }}
      >
        Buy call packages and get matched with riders instantly.
      </Text>

      {/* Dot indicators */}
      <View className="flex-row justify-center items-center mt-8 gap-2">
        <View
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: colors.primary }}
        />
        <View
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: isDark ? colors.borderDark : colors.borderLight }}
        />
        <View
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: isDark ? colors.borderDark : colors.borderLight }}
        />
      </View>

      {/* Bottom spacer */}
      <View className="flex-1" />

      {/* Buttons */}
      <View className="w-full pb-10 gap-4 items-center">
        <CustomButton
          title="Next"
          onPress={() => router.push("/(auth)/driver-walkthrough-2")}
        />

        <Text
          className="text-[16px] font-Jakarta"
          style={{ color: textSecondary }}
          onPress={() => router.replace("/(auth)/phone-entry")}
        >
          Skip
        </Text>
      </View>
    </SafeAreaView>
  );
}