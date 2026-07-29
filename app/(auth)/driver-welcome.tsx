import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function DriverWelcome() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="flex-1 items-center justify-center">
        <Text className="text-[40px] font-JakartaBold text-goPrimary mb-2">Ride Driver</Text>
        <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center">Start earning today. Sign up or log in to continue.</Text>
      </View>
      <View className="w-full pb-[40px] gap-3">
        <TouchableOpacity className="bg-goPrimary rounded-full w-full py-[16px] items-center" onPress={() => router.replace("/(auth)/phone-entry")}>
          <Text className="text-[18px] font-JakartaBold text-goWhite">Driver Sign In</Text>
        </TouchableOpacity>
        <TouchableOpacity className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center" onPress={() => router.replace("/(auth)/phone-entry")}>
          <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Driver Sign Up</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
