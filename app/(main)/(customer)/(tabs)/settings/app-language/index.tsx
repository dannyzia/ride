import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

export default function SettingsAppLanguage() {
  const { i18n } = useTranslation();
  const [selected, setSelected] = useState(i18n.language || "en");

  const languages = [
    { code: "en", name: "English", native: "English" },
    { code: "bn", name: "Bengali", native: "বাংলা" },
  ];

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-6 py-4 border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-base font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">App Language</Text>
        <View className="w-12" />
      </View>
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 24 }}>
        {languages.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            className="flex-row items-center justify-between p-3 bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-lg mb-2"
            onPress={() => { setSelected(lang.code); i18n.changeLanguage(lang.code); }}
          >
            <View>
              <Text className="text-sm font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{lang.name}</Text>
              <Text className="text-xs font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{lang.native}</Text>
            </View>
            {selected === lang.code && <View className="w-5 h-5 rounded-full border-2 border-goPrimary items-center justify-center"><Text className="text-[10px] font-JakartaBold text-goPrimary">✓</Text></View>}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
