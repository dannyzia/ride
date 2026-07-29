import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function SettingsPrivacyPolicy() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <Text className="text-[16px] font-Jakarta text-goPrimary" onPress={() => router.back()}>Back</Text>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Privacy Policy</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        <Text className="text-[14px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mt-4 mb-4">Last updated: July 15, 2026</Text>
        <View className="gap-6">
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">1. Information We Collect</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">We collect information you provide directly to us, such as when you create an account, book a ride, or contact support. This includes your name, phone number, email, payment information, and location data.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">2. How We Use Your Information</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">We use your information to provide, maintain, and improve our services, process payments, send notifications, and communicate with you about your rides and account.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">3. Information Sharing</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">We may share your information with drivers to facilitate rides, with payment processors for transactions, and with authorities when required by law. We do not sell your personal data.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">4. Data Security</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">5. Your Rights</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">You have the right to access, correct, or delete your personal data. You can manage your data in Settings → Data & Analytics or contact us at privacy@goride.com.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">6. Contact Us</Text><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">If you have questions about this Privacy Policy, contact us at privacy@goride.com or through the app&apos;s Contact Support feature.</Text></View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}