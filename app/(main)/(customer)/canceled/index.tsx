import { Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function RideCanceled() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <Text className="text-[48px] mb-4">❌</Text>
      <Text className="text-[28px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-3">Ride Canceled</Text>
      <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-12">
        Your ride has been canceled. Any charges will be refunded.
      </Text>
      <TouchableOpacity
        className="bg-goPrimary rounded-full w-full py-[16px] items-center"
        onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}
      >
        <Text className="text-[18px] font-JakartaBold text-goWhite">Back to Home</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
