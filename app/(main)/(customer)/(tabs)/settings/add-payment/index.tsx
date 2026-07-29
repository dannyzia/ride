import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function AddPaymentMethod() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Add Payment Method</Text>
        <View className="w-[50px]" />
      </View>
      <View className="flex-1 items-center justify-center px-[24px]">
        <View className="w-24 h-24 rounded-full bg-goAccentLight items-center justify-center mb-6">
          <Text className="text-[48px]">💳</Text>
        </View>
        <Text className="text-[22px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Coming Soon</Text>
        <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center">
          Secure card payment via PortPos hosted checkout will be available soon. Your card details are never stored in the app.
        </Text>
      </View>
    </SafeAreaView>
  );
}