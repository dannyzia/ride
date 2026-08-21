import { View, Text, ScrollView, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { getLegalContent } from "@/lib/legalContent";

interface LegalDocumentScreenProps {
  type: "terms" | "privacy";
  role: "rider" | "driver";
}

/**
 * Shared renderer for the four legal screens (rider/driver × terms/privacy).
 * All content comes from lib/legalContent.ts — the single legal source of
 * truth. Never hard-code legal text in screen components.
 */
export default function LegalDocumentScreen({
  type,
  role,
}: LegalDocumentScreenProps) {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const { i18n } = useTranslation();
  const isBn = i18n.language === "bn";

  const doc = getLegalContent(type, role);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const formatDate = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      <View
        className="flex-row items-center px-[24px] py-[16px] border-b"
        style={{ borderBottomColor: borderColor }}
      >
        <TouchableOpacity onPress={() => router.back()} className="mr-[12px] p-[4px]">
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          className="flex-1 text-center text-[18px] font-JakartaBold"
          style={{ color: textPrimary }}
        >
          {isBn ? doc.title_bn : doc.title}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        className="flex-1 px-[24px]"
        contentContainerStyle={{ paddingVertical: 20, gap: 20 }}
      >
        <View>
          <Text
            className="text-[14px] font-Jakarta mb-1"
            style={{ color: textSecondary }}
          >
            {isBn ? "কার্যকর তারিখ" : "Effective date"}: {formatDate(doc.effective_date)}
          </Text>
          {doc.revision_date !== doc.effective_date && (
            <Text
              className="text-[13px] font-Jakarta"
              style={{ color: textSecondary }}
            >
              {isBn ? "সর্বশেষ সংশোধন" : "Last updated"}: {formatDate(doc.revision_date)}
            </Text>
          )}
        </View>

        <View className="gap-6">
          {doc.sections.map((section) => (
            <View key={section.title}>
              <Text
                className="text-[16px] font-JakartaBold mb-2"
                style={{ color: textPrimary }}
              >
                {isBn ? section.title_bn : section.title}
              </Text>
              <Text
                className="text-[14px] font-Jakarta leading-[20px]"
                style={{ color: textSecondary }}
              >
                {isBn ? section.body_bn : section.body}
              </Text>
            </View>
          ))}
        </View>

        <View
          className="rounded-[12px] p-[14px]"
          style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        >
          <Text
            className="text-[13px] font-JakartaSemiBold mb-1"
            style={{ color: textPrimary }}
          >
            {isBn ? "যোগাযোগ" : "Contact"}
          </Text>
          <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
            {doc.contact_email}
          </Text>
          <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
            {doc.contact_address}
          </Text>
        </View>
      </ScrollView>

      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-[68px] right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={isDark ? "sunny-outline" : "moon-outline"}
          size={20}
          color={textPrimary}
        />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
