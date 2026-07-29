import { View, Text, TouchableOpacity, ScrollView, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useRiderStore } from "@/store/useRiderStore";

export default function DriverInfo() {
  const { activeRide } = useRiderStore();
  const driver = activeRide?.driver;

  const handleCall = () => {
    if (driver?.phone) {
      Linking.openURL(`tel:${driver.phone}`);
    }
  };

  const handleChat = () => {
    if (activeRide?.id) {
      router.push(`/(main)/(customer)/chat/${activeRide.id}`);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <Text className="text-[16px] font-Jakarta text-goPrimary" onPress={() => router.back()}>Back</Text>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Driver Information</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        <View className="items-center mb-6">
          <View className="w-20 h-20 rounded-full bg-goAccentLight items-center justify-center mb-3">
            <Text className="text-[28px] font-JakartaBold tracking-tight text-goPrimary">{driver?.name?.charAt(0) ?? "D"}</Text>
          </View>
          <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark">{driver?.name ?? "Driver"}</Text>
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">
            ★ {driver?.rating ?? "N/A"} · {driver?.vehicle_type ?? ""}
          </Text>
        </View>
        <View className="flex-row gap-4">
          <TouchableOpacity className="flex-1 bg-goPrimary rounded-full py-[14px] items-center" onPress={handleCall}>
            <Text className="text-[16px] font-JakartaBold text-goWhite">Call</Text>
          </TouchableOpacity>
          <TouchableOpacity className="flex-1 border border-goBorderLight dark:border-goBorderDark rounded-full py-[14px] items-center" onPress={handleChat}>
            <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Chat</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
