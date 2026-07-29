import { View, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SchedulingUserRide() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="items-center">
        <View className="w-24 h-24 rounded-full bg-goAccentLight dark:bg-goAccentLight items-center justify-center mb-4">
          <Text className="text-[40px]">⏳</Text>
        </View>
        <ActivityIndicator size="large" color="#0CC25F" className="mb-4" />
        <Text className="text-[24px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Scheduling your ride...</Text>
        <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center">
          Please wait while we confirm your scheduled ride.
        </Text>
      </View>
    </SafeAreaView>
  );
}