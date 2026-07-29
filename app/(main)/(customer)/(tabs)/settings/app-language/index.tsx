import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function SettingsAppLanguage() {
  const languages = [
    { code: "en", name: "English", native: "English" },
    { code: "bn", name: "Bengali", native: "বাংলা" },
  ];

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">App Language</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        {languages.map((lang, index) => (
          <TouchableOpacity
            key={lang.code}
            className="flex-row items-center justify-between p-[12px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] mb-2"
            onPress={() => {}}
          >
            <View>
              <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{lang.name}</Text>
              <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{lang.native}</Text>
            </View>
            {index === 0 && <View className="w-5 h-5 rounded-full border-2 border-goPrimary items-center justify-center"><Text className="text-[10px] font-JakartaBold text-goPrimary">✓</Text></View>}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}