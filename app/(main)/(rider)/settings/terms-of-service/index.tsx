import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function DriverTerms() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-6 py-4 border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}><Text className="text-base font-Jakarta text-goPrimary">Back</Text></TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Terms of Service</Text>
        <View className="w-12" />
      </View>
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark leading-6">
          By using the Ride platform, you agree to the following terms and conditions.{"\n\n"}
          1. You must be at least 18 years old and possess a valid driver's license.{"\n\n"}
          2. You are responsible for maintaining the confidentiality of your account credentials.{"\n\n"}
          3. All earnings are subject to applicable taxes. You are responsible for reporting your income.{"\n\n"}
          4. Ride reserves the right to suspend accounts that violate our community guidelines.{"\n\n"}
          5. We process payments through our third-party payment partner (PortPos). Transaction fees may apply.{"\n\n"}
          6. You agree not to engage in fraudulent activities, including fake rides or payment manipulation.{"\n\n"}
          7. Ride may update these terms at any time. Continued use constitutes acceptance of changes.{"\n\n"}
          Last updated: July 2026.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
