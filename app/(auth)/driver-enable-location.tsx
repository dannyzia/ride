import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Location from "expo-location";

export default function DriverEnableLocation() {
  const allow = async () => {
    await Location.requestForegroundPermissionsAsync();
    router.replace("/(main)/(rider)/select-active-vehicle");
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="flex-1 items-center justify-center">
        <View className="w-24 h-24 rounded-full bg-goAccentLight items-center justify-center mb-8"><Text className="text-[40px]">📍</Text></View>
        <Text className="text-[24px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark text-center mb-3">Enable Location</Text>
        <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center">Location is required to receive ride requests and navigate.</Text>
      </View>
      <TouchableOpacity className="bg-goPrimary rounded-full w-full py-[16px] items-center mb-3" onPress={allow}>
        <Text className="text-[18px] font-JakartaBold text-goWhite">Allow</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.replace("/(main)/(rider)/select-active-vehicle")}>
        <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Not Now</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
