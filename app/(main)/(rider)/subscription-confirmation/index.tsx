import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function SubscriptionConfirmation() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="w-24 h-24 rounded-full bg-goAccentLight items-center justify-center mb-6">
        <Text className="text-[48px]">✅</Text>
      </View>
      <Text className="text-[24px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Subscription active</Text>
      <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-8">Your call package has been activated. Start receiving ride requests now.</Text>
      <TouchableOpacity
        className="bg-goPrimary rounded-full w-full py-[16px] items-center"
        onPress={() => router.replace("/(main)/(rider)/")}
      >
        <Text className="text-[18px] font-JakartaBold text-goWhite">Go online</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}