import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function DriverPrivacyPolicy() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-6 py-4 border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}><Text className="text-base font-Jakarta text-goPrimary">Back</Text></TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Privacy Policy</Text>
        <View className="w-12" />
      </View>
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark leading-6">
          We value your privacy. This policy explains how we collect, use, and protect your personal information.{"\n\n"}
          1. Information we collect: Name, phone number, vehicle information, location data, and payment details.{"\n\n"}
          2. How we use it: To provide ride-matching services, process payments, and improve our platform.{"\n\n"}
          3. Data sharing: We share your information with riders during a trip (name, vehicle, location). We do not sell your data.{"\n\n"}
          4. Data retention: We retain your data for as long as your account is active and for 90 days thereafter.{"\n\n"}
          5. Your rights: You may request a copy of your data or deletion of your account at any time.{"\n\n"}
          6. Security: We use encryption for data in transit and at rest. We regularly audit our security practices.{"\n\n"}
          7. Contact: For privacy inquiries, contact support@goride.com.{"\n\n"}
          Last updated: July 2026.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
