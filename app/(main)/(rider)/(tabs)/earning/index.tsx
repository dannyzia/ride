import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function EarningScreen() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark">Earnings</Text>
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        <TouchableOpacity className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]" onPress={() => router.push("/(main)/(rider)/earnings")}>
          <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Earnings Overview</Text>
        </TouchableOpacity>
        <TouchableOpacity className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]" onPress={() => router.push("/(main)/(rider)/earnings-breakdown")}>
          <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Earnings Breakdown</Text>
        </TouchableOpacity>
        <TouchableOpacity className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]" onPress={() => router.push("/(main)/(rider)/commission-statement")}>
          <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Commission Statement</Text>
        </TouchableOpacity>
        <TouchableOpacity className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]" onPress={() => router.push("/(main)/(rider)/performance-stats")}>
          <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Performance Stats</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
