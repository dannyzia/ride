import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Location from "expo-location";

export default function EnableLocation() {
  const allow = async () => {
    await Location.requestForegroundPermissionsAsync();
    router.replace("/(auth)/notifications-permission");
  };
  const skip = () => router.replace("/(auth)/notifications-permission");

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="flex-1 items-center justify-center">
        <View className="w-24 h-24 rounded-full bg-goAccentLight items-center justify-center mb-8">
          <Text className="text-[40px]">📍</Text>
        </View>
        <Text className="text-[24px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark text-center mb-3">
          Allow Ride to access your location
        </Text>
        <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center">
          We need your location to find drivers near you.
        </Text>
      </View>
      <View className="flex-row w-full pb-[40px]">
        <TouchableOpacity className="flex-1 border border-goBorderLight dark:border-goBorderDark rounded-full py-[16px] items-center mr-2" onPress={skip}>
          <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Not Now</Text>
        </TouchableOpacity>
        <TouchableOpacity className="flex-1 bg-goPrimary rounded-full py-[16px] items-center ml-2" onPress={allow}>
          <Text className="text-[18px] font-JakartaBold text-goWhite">Allow</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
