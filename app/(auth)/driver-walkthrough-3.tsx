import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
export default function DriverWalkthrough3() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="flex-1 items-center justify-center">
        <Text className="text-[32px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Safe & Secure</Text>
        <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center">Verified riders, transparent fares, SOS support built in.</Text>
      </View>
      <TouchableOpacity className="bg-goPrimary rounded-full w-full py-[16px] items-center mb-[40px]" onPress={() => router.replace("/(auth)/driver-welcome")}>
        <Text className="text-[18px] font-JakartaBold text-goWhite">Get Started</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
