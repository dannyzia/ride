import { useEffect } from "react";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

export default function DriverSplash() {
  const isDark = useIsDark();

  useEffect(() => {
    const timer = setTimeout(() => router.replace("/(auth)/driver-walkthrough-1"), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaView
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: isDark ? colors.bgDark : colors.bgLight }}
    >
      <Text
        className="text-[40px] font-JakartaBold mb-2"
        style={{ color: colors.primary }}
      >
        Ride Driver
      </Text>
      <Text
        className="text-[18px] font-Jakarta"
        style={{ color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight }}
      >
        Drive and earn with us
      </Text>
    </SafeAreaView>
  );
}