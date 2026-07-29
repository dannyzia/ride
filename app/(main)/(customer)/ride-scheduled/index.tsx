import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function RideScheduled() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="items-center mb-8">
        <View className="w-24 h-24 rounded-full bg-goAccentLight dark:bg-goAccentLight items-center justify-center mb-4">
          <Text className="text-[40px] text-goPrimary">✓</Text>
        </View>
        <Text className="text-[24px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Ride Scheduled</Text>
        <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-6">
          Your ride has been scheduled successfully.
        </Text>
      </View>
      <View className="w-full gap-3">
        <TouchableOpacity
          className="bg-goPrimary rounded-full w-full py-[16px] items-center"
          onPress={() => router.replace("/(main)/(customer)/(tabs)/activity")}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">View Schedule</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center"
          onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}
        >
          <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Back to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}