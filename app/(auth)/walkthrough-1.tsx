import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function Walkthrough1() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="flex-1 items-center justify-center">
        <Text className="text-[32px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
          Welcome to Ride
        </Text>
        <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center">
          Book rides instantly with verified drivers near you.
        </Text>
      </View>
      <View className="flex-row justify-between w-full pb-[40px]">
        <TouchableOpacity onPress={() => router.replace("/(auth)/phone-entry")}>
          <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-goPrimary rounded-full px-[24px] py-[12px]"
          onPress={() => router.push("/(auth)/walkthrough-2")}
        >
          <Text className="text-[16px] font-JakartaBold text-goWhite">Next</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
