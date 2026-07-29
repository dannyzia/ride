import { useEffect } from "react";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function DriverSplash() {
  useEffect(() => {
    const timer = setTimeout(() => router.replace("/(auth)/driver-walkthrough-1"), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center">
      <Text className="text-[40px] font-JakartaBold text-goPrimary mb-2">Ride Driver</Text>
      <Text className="text-[18px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Drive and earn with us</Text>
    </SafeAreaView>
  );
}
