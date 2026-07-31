import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useRiderStore } from "@/store/useRiderStore";
import { useTranslation } from "react-i18next";

export default function RideCompleted() {
  const { t } = useTranslation();
  const { activeRide } = useRiderStore();
  const fare = activeRide?.fare_breakdown?.total_bdt;
  const fareDisplay = fare ? (Number(fare) / 100).toFixed(0) : "—";

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="items-center mb-8">
        <View className="w-20 h-20 rounded-full bg-goAccentLight items-center justify-center mb-4">
          <Text className="text-[40px] text-goPrimary">✓</Text>
        </View>
        <Text className="text-[28px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark">{t('ride.ride_completed')}</Text>
      </View>
      <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[16px] p-[20px] w-full mb-8">
        <View className="flex-row justify-between mb-2">
          <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{t('ride.total_fare')}</Text>
          <Text className="text-[18px] font-JakartaBold text-goPrimary">৳{fareDisplay}</Text>
        </View>
      </View>
      <TouchableOpacity
        className="bg-goPrimary rounded-full w-full py-[16px] items-center mb-3"
        onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}
      >
        <Text className="text-[18px] font-JakartaBold text-goWhite">{t('ride.back_to_home')}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}