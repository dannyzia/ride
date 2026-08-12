import { View, Text, Image } from "react-native";
import { icons } from "@/constants/data";
import CustomButton from "./CustomButton";
import { useRouter } from "expo-router";
import { colors } from "@/theme/goRide";
import { useAppearance } from "@/lib/useAppearance";

export default function ErrorFindDriver() {
  const router = useRouter();
  const { theme } = useAppearance();
  const isDark = theme === "dark" || theme === "system";

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <View
      className="flex-1 justify-center items-center px-6 py-10"
      style={{ backgroundColor: bg }}
    >
      {/* Cab icon */}
      <View className="w-24 h-24 mb-6">
        <Image
          source={icons.cab}
          className="w-full h-full"
          resizeMode="contain"
        />
      </View>

      {/* User not found + title */}
      <View className="flex-row items-center mb-4 gap-3">
        <Image
          source={icons.userNotFound}
          className="w-12 h-12"
          resizeMode="contain"
        />
        <Text
          className="font-JakartaBold text-2xl"
          style={{ color: colors.danger }}
        >
          No Drivers Found
        </Text>
      </View>

      {/* Description */}
      <Text
        className="font-Jakarta text-center text-base mb-4"
        style={{ color: textPrimary }}
      >
        We couldn't find any available drivers for your ride request at the moment.
        This might be due to high demand or network issues.
      </Text>

      <Text
        className="font-Jakarta text-center text-sm"
        style={{ color: textSecondary }}
      >
        Please try again in a few minutes or return to the home screen to explore other options.
      </Text>

      <CustomButton
        title="Find Other"
        className="w-7/12 mt-10"
        bgVariant="secondary"
        onPress={() => router.replace("/(main)/(customer)/book-ride")}
      />
    </View>
  );
}
