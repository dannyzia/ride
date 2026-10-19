import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

// C3-2 (STAGE C3-FIX, ruled): referrals DORMANT — "coming soon" copy per the
// F-26 pattern (cf. linked_accounts.add_account_dormant: a disabled action).
// The write-less pipeline stays schema-only (P5, post-launch): no fetch, no
// share, no code issuance from this surface.
export default function Referral() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={["top", "left", "right"]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
        translucent
      />
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>{t('referral.title')}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('referral.toggle_theme')}
          onPress={() => setTheme(isDark ? "light" : "dark")}
          style={[styles.themeToggle, { backgroundColor: surfaceBg, borderColor }]}
         testID="customer.referral.set-theme">
          <Ionicons
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={24}
            color={textPrimary}
          />
        </TouchableOpacity>
      </View>
      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }]}>
          <Ionicons name="gift-outline" size={48} color={colors.primary} />
        </View>
        <Text style={[styles.dormantTitle, { color: textPrimary }]}>{t('referral.title')}</Text>
        <Text style={[styles.dormantBody, { color: textSecondary }]}>
          {t('referral.coming_soon')}
        </Text>
        <TouchableOpacity
          style={[styles.dormantButton, { backgroundColor: surfaceBg, borderColor }]}
          disabled
         testID="customer.referral.el-1">
          <Text style={[styles.dormantButtonText, { color: textSecondary }]}>
            {t('referral.coming_soon')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
  },
  themeToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  dormantTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 22,
    marginBottom: 8,
    textAlign: "center",
  },
  dormantBody: {
    fontFamily: "Jakarta-Regular",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 24,
  },
  dormantButton: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: "center",
  },
  dormantButtonText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
});
