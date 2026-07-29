import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

export default function TopUpSuccess() {
  const { amount } = useLocalSearchParams<{ amount: string }>();

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="w-24 h-24 rounded-full bg-goAccentLight items-center justify-center mb-6">
        <Text className="text-[48px]">✅</Text>
      </View>
      <Text className="text-[24px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
        Top Up Successful
      </Text>
      <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-2">
        ৳{amount ?? "500"} has been added to your wallet.
      </Text>
      <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-8">
        You can now use this balance for rides and packages.
      </Text>
      <TouchableOpacity
        className="bg-goPrimary rounded-full w-full py-[16px] items-center mb-3"
        onPress={() => router.replace("/(main)/(customer)/(tabs)/rides")}
      >
        <Text className="text-[18px] font-JakartaBold text-goWhite">View Transactions</Text>
      </TouchableOpacity>
      <TouchableOpacity
        className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center"
        onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}
      >
        <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Back to Home</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}