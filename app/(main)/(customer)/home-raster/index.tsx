import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useCustomer } from "@/store";

export default function HomeRasterCar() {
  const { userLatitude, userLongitude } = useCustomer();

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-1 items-center justify-center">
        <Text className="text-[40px]">🗺️</Text>
        <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mt-2">
          Your location
        </Text>
        <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
          {userLatitude?.toFixed(4) ?? "—"}, {userLongitude?.toFixed(4) ?? "—"}
        </Text>
      </View>
      <View className="p-[24px]">
        <TouchableOpacity
          className="bg-goPrimary rounded-full w-full py-[16px] items-center"
          onPress={() => router.push("/(main)/(customer)/autocomplete")}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">Where to?</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}