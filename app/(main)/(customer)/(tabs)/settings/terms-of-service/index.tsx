import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function SettingsTermsOfService() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <Text className="text-[16px] font-Jakarta text-goPrimary" onPress={() => router.back()}>Back</Text>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Terms of Service</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        <Text className="text-[14px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mt-4 mb-4">Last updated: July 15, 2026</Text>
        <View className="gap-6">
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">1. Acceptance of Terms</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">By using GoRide, you agree to these Terms of Service. If you do not agree, please do not use our services.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">2. Eligibility</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">You must be at least 18 years old and legally capable of entering into contracts to use our services.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">3. User Accounts</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">You are responsible for maintaining the confidentiality of your account and for all activities under your account. Provide accurate information and update it as needed.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">4. Ride Services</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">GoRide connects riders with independent driver-partners. We do not employ drivers. Rides are subject to availability and local regulations.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">5. Payments</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Fares are calculated based on distance, time, and demand. Payment is processed through our payment partners. All amounts are in BDT.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">6. Prohibited Conduct</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">You may not use our services for illegal activities, harass drivers or other users, damage property, or interfere with our platform&apos;s operation.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">7. Limitation of Liability</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">GoRide is not liable for indirect, incidental, or consequential damages. Our total liability is limited to the amount you paid for the relevant service.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">8. Changes to Terms</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">We may modify these terms at any time. Continued use after changes constitutes acceptance.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">9. Governing Law</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">These terms are governed by the laws of Bangladesh. Disputes will be resolved in the courts of Dhaka.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">10. Contact</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Questions about these Terms? Contact us at legal@goride.com or through the app.</Text></View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}