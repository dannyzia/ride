import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function NoDriversAvailable() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="items-center mb-8">
        <View className="w-24 h-24 rounded-full bg-goDanger/10 dark:bg-goDanger/10 items-center justify-center mb-4">
          <Text className="text-[40px]">🚫</Text>
        </View>
        <Text className="text-[24px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">No Drivers Available</Text>
        <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-6">
          There are no drivers available in your area right now. Please try again in a few minutes or schedule a ride for later.
        </Text>
      </View>
      <View className="w-full gap-3">
        <TouchableOpacity
          className="bg-goPrimary rounded-full w-full py-[16px] items-center"
          onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center"
          onPress={() => router.push("/(main)/(customer)/schedule-ride")}
        >
          <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Schedule for Later</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}