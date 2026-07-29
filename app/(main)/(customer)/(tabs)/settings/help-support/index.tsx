import { View, Text, TouchableOpacity, ScrollView, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function SettingsHelpSupport() {
  const supportPhone = process.env.EXPO_PUBLIC_SUPPORT_PHONE || "+8801XXXXXXXXX";

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.replace("/(main)/(customer)/(tabs)/settings")}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Help & Support</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="mt-4 mb-4">
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Quick Help</Text>
          <TouchableOpacity className="flex-row items-center p-[12px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] mb-2" onPress={() => router.push("/(main)/(customer)/(tabs)/settings/faq")}>
            <View className="w-8 h-8 rounded-full bg-goAccent mr-3 items-center justify-center"><Text className="text-[16px] text-goWhite">❓</Text></View>
            <View className="flex-1"><Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">FAQ</Text><Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Frequently asked questions</Text></View>
            <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">›</Text>
          </TouchableOpacity>
          <TouchableOpacity className="flex-row items-center p-[12px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] mb-2" onPress={() => router.push("/(main)/(customer)/(tabs)/settings/contact-support")}>
            <View className="w-8 h-8 rounded-full bg-goPrimary mr-3 items-center justify-center"><Text className="text-[16px] text-goWhite">💬</Text></View>
            <View className="flex-1"><Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Contact Support</Text><Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Chat with our support team</Text></View>
            <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">›</Text>
          </TouchableOpacity>
          <TouchableOpacity className="flex-row items-center p-[12px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] mb-2" onPress={() => Linking.openURL('tel:' + supportPhone)}>
            <View className="w-8 h-8 rounded-full bg-goAccentLight dark:bg-goAccentLight mr-3 items-center justify-center"><Text className="text-[16px]">📞</Text></View>
            <View className="flex-1"><Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Call Support</Text><Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">+880 1XXX-XXXXXX</Text></View>
            <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">›</Text>
          </TouchableOpacity>
        </View>
        <View className="mt-6">
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Safety</Text>
          <TouchableOpacity className="flex-row items-center p-[12px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] mb-2" onPress={() => router.push("/(main)/(customer)/(tabs)/settings/emergency-contacts")}>
            <View className="w-8 h-8 rounded-full bg-goDanger mr-3 items-center justify-center"><Text className="text-[16px] text-goWhite">🚨</Text></View>
            <View className="flex-1"><Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Emergency Contacts</Text><Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Manage your emergency contacts</Text></View>
            <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">›</Text>
          </TouchableOpacity>
        </View>
        <View className="mt-6">
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Legal</Text>
          <TouchableOpacity className="flex-row items-center p-[12px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] mb-2" onPress={() => router.push("/(main)/(customer)/(tabs)/settings/privacy-policy")}>
            <View className="w-8 h-8 rounded-full bg-goSecondary mr-3 items-center justify-center"><Text className="text-[16px] text-goWhite">📄</Text></View>
            <Text className="flex-1 text-[14px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">Privacy Policy</Text>
            <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">›</Text>
          </TouchableOpacity>
          <TouchableOpacity className="flex-row items-center p-[12px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] mb-2" onPress={() => router.push("/(main)/(customer)/(tabs)/settings/terms-of-service")}>
            <View className="w-8 h-8 rounded-full bg-goSecondary mr-3 items-center justify-center"><Text className="text-[16px] text-goWhite">📋</Text></View>
            <Text className="flex-1 text-[14px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">Terms of Service</Text>
            <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}