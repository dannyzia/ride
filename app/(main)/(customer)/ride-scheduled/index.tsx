import { View, Text, TouchableOpacity, StatusBar, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { formatDateTime } from "@/lib/format";
import { useTranslation } from "react-i18next";

export default function RideScheduled() {
  const { ride_id, scheduled_at } = useLocalSearchParams<{
    ride_id?: string;
    scheduled_at?: string;
  }>();
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const scheduledLabel =
    typeof scheduled_at === "string" && scheduled_at
      ? formatDateTime(scheduled_at)
      : null;
  const reference =
    typeof ride_id === "string" && ride_id
      ? `#${ride_id.slice(0, 8).toUpperCase()}`
      : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      <View style={styles.body}>
        <TouchableOpacity
          onPress={() => setTheme(isDark ? "light" : "dark")}
          style={styles.toggle}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('ride_scheduled.toggle_theme')}
        >
          <Ionicons
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={22}
            color={textPrimary}
          />
        </TouchableOpacity>

        <View style={[styles.iconWrap, { backgroundColor: colors.accentLight }]}>
          <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: textPrimary }]}>{t('ride_scheduled.title')}</Text>
        <Text style={[styles.subtitle, { color: textSecondary }]}>
          {t('ride_scheduled.subtitle')}
        </Text>

        {scheduledLabel && (
          <View style={[styles.detailCard, { backgroundColor: surfaceBg, borderColor }]}>
            <Ionicons name="time-outline" size={18} color={colors.primary} />
            <View style={styles.detailTextCol}>
              <Text style={[styles.detailLabel, { color: textSecondary }]}>
                {t('ride_scheduled.pickup_at')}
              </Text>
              <Text style={[styles.detailValue, { color: textPrimary }]}>
                {scheduledLabel}
              </Text>
            </View>
          </View>
        )}

        {reference && (
          <Text style={[styles.reference, { color: textSecondary }]}>
            {t('ride_scheduled.reference', { reference })}
          </Text>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() =>
              router.replace("/(main)/(customer)/(tabs)/activity")
            }
            accessibilityRole="button"
            accessibilityLabel={t('ride_scheduled.a11y_view_schedule')}
          >
            <Text style={styles.primaryBtnText}>{t('ride_scheduled.view_schedule')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor, backgroundColor: surfaceBg }]}
            onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}
            accessibilityRole="button"
            accessibilityLabel={t('ride_scheduled.a11y_back_to_home')}
          >
            <Text style={[styles.secondaryBtnText, { color: textPrimary }]}>
              {t('ride.back_to_home')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  toggle: {
    position: "absolute",
    top: 16,
    right: 24,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: "Jakarta-Regular",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
  },
  detailCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignSelf: "stretch",
  },
  detailTextCol: {
    flex: 1,
  },
  detailLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
  },
  detailValue: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
    marginTop: 2,
  },
  reference: {
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    marginTop: 10,
  },
  actions: {
    width: "100%",
    gap: 12,
    marginTop: 32,
  },
  primaryBtn: {
    borderRadius: radii.pill,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
    color: colors.white,
  },
  secondaryBtn: {
    borderRadius: radii.pill,
    height: 56,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
  },
});
