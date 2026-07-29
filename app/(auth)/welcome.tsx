import { View, Text, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function WelcomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="flex-1 items-center justify-center">
        <Image
          source={require("@/assets/logo/logo.png")}
          className="w-24 h-24 rounded-xl mb-6"
          resizeMode="contain"
        />
        <Text className="text-[32px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
          Welcome to Ride
        </Text>
        <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-12">
          Your ride, your way. Get started in seconds.
        </Text>
      </View>
      <View className="w-full pb-[40px] gap-3">
        <TouchableOpacity
          className="bg-goPrimary rounded-full w-full py-[16px] items-center"
          onPress={() => router.replace("/(auth)/phone-entry")}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">Sign In</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center"
          onPress={() => router.replace("/(auth)/phone-entry")}
        >
          <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Create Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
