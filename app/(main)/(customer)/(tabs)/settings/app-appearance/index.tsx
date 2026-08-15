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
import SettingsRow from "@/components/SettingsRow";

type ThemeMode = "light" | "dark" | "system";

const THEME_OPTIONS: {
  mode: ThemeMode;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}[] = [
  { mode: "light", icon: "sunny-outline", label: "Light" },
  { mode: "dark", icon: "moon-outline", label: "Dark" },
  { mode: "system", icon: "phone-portrait-outline", label: "System" },
];

export default function SettingsAppAppearance() {
  const isDark = useIsDark();
  const { theme, setTheme } = useAppearance();

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
          accessibilityLabel="Go back"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>
          App Appearance
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Toggle theme"
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
          Theme
        </Text>
        <View style={[styles.card, { backgroundColor: surface }]}>
          {THEME_OPTIONS.map((option, index) => (
            <SettingsRow
              key={option.mode}
              icon={option.icon}
              label={option.label}
              onPress={() => setTheme(option.mode)}
              showChevron={false}
              rightElement={renderRadio(theme === option.mode)}
              isLast={index === THEME_OPTIONS.length - 1}
            />
          ))}
        </View>
        <Text style={[styles.hint, { color: textSecondary }]}>
          System follows your device's appearance setting.
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
