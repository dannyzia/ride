import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

interface LanguageOption {
  code: string;
  name: string;
  native: string;
}

const langs: LanguageOption[] = [
  { code: "en", name: "English", native: "English" },
  { code: "bn", name: "Bangla", native: "বাংলা" },
];

export default function DriverSettingsLanguage() {
  const { i18n } = useTranslation();
  const [selected, setSelected] = useState(i18n.language || "en");

  const selectLang = (code: string) => {
    setSelected(code);
    i18n.changeLanguage(code);
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Language</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        {langs.map((l) => (
          <TouchableOpacity
            key={l.code}
            className={`flex-row items-center p-[14px] mb-3 rounded-[12px] border ${
              selected === l.code
                ? "border-goPrimary bg-goAccentLight"
                : "border-goBorderLight dark:border-goBorderDark bg-goSurfaceLight dark:bg-goSurfaceElevatedDark"
            }`}
            onPress={() => selectLang(l.code)}
          >
            <View
              className={`w-5 h-5 rounded-full border-2 mr-[12px] ${
                selected === l.code ? "border-goPrimary bg-goPrimary" : "border-goBorderLight dark:border-goBorderDark"
              }`}
            />
            <View className="flex-1">
              <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{l.name}</Text>
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{l.native}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}