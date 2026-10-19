import { View, Text, TouchableOpacity, Linking } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { supabase } from "@/lib/supabase";

const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE ?? "+880 1XXX-XXXXXX";

// C2-1 (STAGE C2-FIX) F-02 X/Y: locked screen renders the stored suspension
// reason + a support contact. Reached from the auth gate on 403
// account_suspended (verify-token body carries `reason`).
export default function AccountLockedScreen() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const { t } = useTranslation();
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const handleSignOut = async () => {
    await supabase.auth.signOut().catch(() => {});
    router.replace("/(auth)/phone-entry");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
        <Text
          testID="auth.account-locked.title"
          style={{ color: textPrimary, fontSize: 22, fontFamily: "Jakarta-Bold", marginBottom: 8 }}
        >
          {t("auth.account_locked.title")}
        </Text>
        <Text
          testID="auth.account-locked.reason"
          style={{ color: textSecondary, fontSize: 14, fontFamily: "Jakarta-Regular", marginBottom: 16 }}
        >
          {reason ? `${t("auth.account_locked.reason_prefix")}: ${reason}` : t("auth.account_locked.no_reason")}
        </Text>
        <TouchableOpacity
         
          onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s+/g, "")}`)}
         testID="account-locked.el-1">
          <Text style={{ color: textPrimary, fontSize: 14, fontFamily: "Jakarta-Bold", marginBottom: 16 }}>
            {t("auth.account_locked.contact_support")}: {SUPPORT_PHONE}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSignOut} testID="account-locked.handle-sign-out">
          <Text style={{ color: textSecondary, fontSize: 14, fontFamily: "Jakarta-Regular" }}>
            {t("auth.account_locked.sign_out")}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
