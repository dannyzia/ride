import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import CustomButton from "@/components/CustomButton";

/**
 * Operator Registration (Node launch Stage 4 / Component C).
 *
 * Dropdown with exactly three roles: Shop owner, Fleet owner, Delivery man.
 * Visitor → phone-entry with role param (OTP first — the funnel from Component C).
 * Authenticated user adding a role → direct to wizard.
 * Driver is intentionally excluded (driver onboarding is a separate gate).
 */
export default function OperatorRegisterScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const [selectedRole, setSelectedRole] = useState<"shop_owner" | "fleet_owner" | "delivery_man" | null>(null);
  const [loading, setLoading] = useState(false);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const roles: { key: "shop_owner" | "fleet_owner" | "delivery_man"; labelKey: string; icon: "storefront" | "car" | "bicycle" }[] = [
    { key: "shop_owner", labelKey: "auth.roles.shop_owner", icon: "storefront" },
    { key: "fleet_owner", labelKey: "auth.roles.fleet_owner", icon: "car" },
    { key: "delivery_man", labelKey: "auth.roles.delivery_man", icon: "bicycle" },
  ];

  const handleSelect = (role: "shop_owner" | "fleet_owner" | "delivery_man") => {
    setSelectedRole(role);
  };

  const handleContinue = async () => {
    if (!selectedRole) {
      Alert.alert(t("common.error"), t("operator_register.err_no_role"));
      return;
    }
    setLoading(true);
    try {
      // Visitor → phone-entry with role param (OTP first)
      router.push({
        pathname: "/(auth)/phone-entry",
        params: { role: selectedRole, mode: "operator" },
      });
    } catch (e) {
      console.error("[operator-register] navigation error", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 px-6 justify-center" style={{ backgroundColor: bg }}>
      <Text className="text-[28px] font-JakartaBold font-bold mb-1" style={{ color: textPrimary }}>
        {t("operator_register.title")}
      </Text>
      <Text className="text-[14px] font-JakartaBold mb-6" style={{ color: textSecondary }}>
        {t("operator_register.subtitle")}
      </Text>

      <View className="flex-row flex-wrap gap-2 mb-6">
        {roles.map((r) => (
          <TouchableOpacity
            key={r.key}
            className="py-3 px-4 rounded-full items-center justify-center flex-1"
            style={{
              backgroundColor: selectedRole === r.key ? colors.primary : surfaceBg,
              borderWidth: 1,
              borderColor: selectedRole === r.key ? colors.primary : borderColor,
            }}
            onPress={() => handleSelect(r.key)}
            testID="operator-register.handle-select"
          >
            <Ionicons name={r.icon} size={24} color={selectedRole === r.key ? colors.white : textSecondary} />
            <Text
              className="text-[13px] font-JakartaBold font-bold mt-1"
              style={{ color: selectedRole === r.key ? colors.white : textSecondary }}
            >
              {t(r.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View className="gap-y-3">
        <CustomButton
          title={loading ? "Loading..." : t("operator_register.continue")}
          onPress={handleContinue}
          disabled={loading || !selectedRole}
          testID="operator-register.continue"
        />
        <Text className="text-center text-[13px] font-JakartaBold mt-4" style={{ color: textSecondary }}>
          {t("operator_register.or_login")}
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/(auth)/operator-login")}
          testID="operator-register.login-link"
        >
          <Text style={{ color: colors.primary, textDecorationLine: "underline" }}>
            {t("operator_register.login_link")}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}