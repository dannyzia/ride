import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import CustomButton from "@/components/CustomButton";

export default function DriverEnableLocation() {
  const isDark = useIsDark();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const allow = async () => {
    await Location.requestForegroundPermissionsAsync();
    router.replace("/(main)/(rider)/select-active-vehicle");
  };

  const skip = () => router.replace("/(main)/(rider)/select-active-vehicle");

  return (
    <SafeAreaView className="flex-1 px-6" style={{ backgroundColor: bg }}>
      {/* Top spacer */}
      <View className="flex-1" />

      {/* Icon */}
      <View className="items-center mb-8">
        <View
          className="w-20 h-20 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.primary + "18" }}
        >
          <Ionicons name="location-outline" size={32} color={colors.primary} />
        </View>
      </View>

      {/* Title */}
      <Text
        className="text-[24px] font-JakartaBold text-center mb-3 px-4"
        style={{ color: textPrimary }}
      >
        Enable Location
      </Text>

      {/* Description */}
      <Text
        className="text-[16px] font-Jakarta text-center px-6"
        style={{ color: textSecondary }}
      >
        Location is required to receive ride requests and navigate.
      </Text>

      {/* Bottom spacer */}
      <View className="flex-1" />

      {/* Buttons */}
      <View className="w-full pb-10 gap-3">
        <CustomButton
          title="Allow"
          onPress={allow}
        />
        <CustomButton
          title="Not Now"
          bgVariant="secondary"
          onPress={skip}
        />
      </View>
    </SafeAreaView>
  );
}
