import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useRiderStore } from "@/store/useRiderStore";

export default function UserArrived() {
  const { activeRide } = useRiderStore();
  const driverName = activeRide?.driver?.name ?? "your driver";

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="w-24 h-24 rounded-full bg-goAccentLight items-center justify-center mb-6">
        <Text className="text-[48px]">📍</Text>
      </View>
      <Text className="text-[24px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
        You have arrived
      </Text>
      <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-8">
        Hope you enjoyed the ride with {driverName}. Please take a moment to rate your experience.
      </Text>
      <TouchableOpacity
        className="bg-goPrimary rounded-full w-full py-[16px] items-center mb-3"
        onPress={() => router.replace("/(main)/(customer)/rate-driver")}
      >
        <Text className="text-[18px] font-JakartaBold text-goWhite">Rate your driver</Text>
      </TouchableOpacity>
      <TouchableOpacity
        className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center"
        onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}
      >
        <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Skip</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}