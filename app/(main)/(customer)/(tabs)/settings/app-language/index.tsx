import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useAppearance, useIsDark } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/i18n/i18n";

type LanguageCode = "en" | "bn";

const LANGUAGES: { code: LanguageCode; flag: string; label: string }[] = [
  { code: "en", flag: "EN", label: "English" },
  { code: "bn", flag: "BN", label: "বাংলা" },
];

export default function SettingsAppLanguage() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const { i18n, t } = useTranslation();
  const activeLanguage: LanguageCode = i18n.language === "bn" ? "bn" : "en";

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surface = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const renderRadio = (selected: boolean) => (
    <View
      style={[
        styles.radio,
        { borderColor: selected ? colors.primary : borderColor },
      ]}
    >
      {selected ? <View style={styles.radioInner} /> : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? "light-content" : "dark-content"}
      />
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>
          {t('app_language.title')}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('app_language.toggle_theme')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => setTheme(isDark ? "light" : "dark")}
        >
          <Ionicons
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={24}
            color={textPrimary}
          />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: textPrimary }]}>
          {t('settings.language')}
        </Text>
        <View style={[styles.card, { backgroundColor: surface }]}>
          {LANGUAGES.map((lang, index) => (
            <View key={lang.code}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={lang.label}
                accessibilityState={{ selected: activeLanguage === lang.code }}
                activeOpacity={0.7}
                onPress={() => setLanguage(lang.code)}
                style={styles.row}
              >
                <Text style={styles.flag}>{lang.flag}</Text>
                <Text style={[styles.label, { color: textPrimary }]}>
                  {lang.label}
                </Text>
                {renderRadio(activeLanguage === lang.code)}
              </TouchableOpacity>
              {index < LANGUAGES.length - 1 ? (
                <View
                  style={[styles.divider, { backgroundColor: borderColor }]}
                />
              ) : null}
            </View>
          ))}
        </View>
        <Text style={[styles.hint, { color: textSecondary }]}>
          {t('app_language.hint')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
  },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitle: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 18,
    marginBottom: 12,
  },
  card: { borderRadius: 16, overflow: "hidden" },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 16,
  },
  flag: {
    width: 24,
    fontSize: 20,
    textAlign: "center",
  },
  label: {
    flex: 1,
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
  },
  divider: {
    height: 1,
    marginLeft: 56,
  },
  hint: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
});
