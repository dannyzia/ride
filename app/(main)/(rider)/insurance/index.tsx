import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function InsuranceInfo() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        <View className="items-center mb-8">
          <View className="w-24 h-24 rounded-full bg-goAccentLight items-center justify-center mb-4">
            <Text className="text-[48px]">🛡️</Text>
          </View>
          <Text className="text-[22px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark text-center">
            Insurance Coverage
          </Text>
          <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mt-2">
            Partner insurance information
          </Text>
        </View>
        <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] p-[16px]">
          <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
            Coverage Details
          </Text>
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark leading-5">
            All active drivers are covered under our partner insurance policy. Coverage includes accidental damage, third-party liability, and personal injury during active rides.
          </Text>
        </View>
        <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] p-[16px] mt-4">
          <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
            Claims & Support
          </Text>
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark leading-5">
            For insurance claims or questions, contact support through the app or call our support line. Keep your ride receipts and incident reports ready.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
