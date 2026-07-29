import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function SettingsLogoutConfirmation() {
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.replace("/(auth)/phone-entry");
    } catch (err) {
      logger.error("Logout failed", err);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="items-center mb-8">
        <View className="w-24 h-24 rounded-full bg-goAccentLight dark:bg-goAccentLight items-center justify-center mb-4">
          <Text className="text-[40px]">👋</Text>
        </View>
        <Text className="text-[24px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Log Out</Text>
        <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center">
          Are you sure you want to log out? You will need to enter your phone number and OTP to sign in again.
        </Text>
      </View>
      <View className="w-full gap-4">
        <TouchableOpacity className="bg-goDanger rounded-full w-full py-[16px] items-center" onPress={handleLogout}>
          <Text className="text-[18px] font-JakartaBold text-goWhite">Log Out</Text>
        </TouchableOpacity>
        <TouchableOpacity className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center" onPress={() => router.back()}>
          <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}