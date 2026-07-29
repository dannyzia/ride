import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function DriverSupport() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Support</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        <TouchableOpacity
          className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-3"
          onPress={() => router.push("/(main)/(rider)/faq")}
        >
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">FAQ</Text>
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">Frequently asked questions</Text>
            </View>
            <Text className="text-[18px] text-goTextSecondaryLight dark:text-goTextSecondaryDark">›</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-3"
          onPress={() => router.push("/(main)/(rider)/contact-support")}
        >
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Contact support</Text>
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">Chat with our team</Text>
            </View>
            <Text className="text-[18px] text-goTextSecondaryLight dark:text-goTextSecondaryDark">›</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-3"
          onPress={() => router.push("/(main)/(rider)/report-issue")}
        >
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Report an issue</Text>
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">Report a bug or problem</Text>
            </View>
            <Text className="text-[18px] text-goTextSecondaryLight dark:text-goTextSecondaryDark">›</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}