import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Location from "expo-location";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { logger } from "@/lib/logger";
import CustomButton from "@/components/CustomButton";

export default function DriverEnableLocation() {
  const { t } = useTranslation();
  const isDark = useIsDark();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;

  const next = () => router.replace("/(main)/(rider)/select-active-vehicle");

  const allow = async () => {
    // §5: the prominent disclosure above is shown BEFORE any OS dialog.
    // Foreground first (required for the background grant on Android), then
    // background (best-effort — a denial still proceeds, driver stays
    // inactive until granted from settings).
    try {
      await Location.requestForegroundPermissionsAsync();
      await Location.requestBackgroundPermissionsAsync();
    } catch (err) {
      logger.warn("[driver-enable-location] permission request failed", err);
    }
    next();
  };

  const skip = () => next();

  return (
    <SafeAreaView className="flex-1 px-6" style={{ backgroundColor: bg }}>
      {/* Top spacer */}
      <View className="flex-1" />

      {/* Icon */}
      <View className="items-center mb-8">
        <View
          className="w-20 h-20 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.primary + "18" }}
        >
          <Ionicons name="location-outline" size={32} color={colors.primary} />
        </View>
      </View>

      {/* §5 Google Play prominent disclosure: background-location card shown
          BEFORE the runtime permission request. */}
      <View
        className="rounded-2xl border p-4 mb-4"
        style={{ backgroundColor: surfaceBg, borderColor: colors.primary }}
        testID="driver-enable-location.prominent-disclosure">
        <Text
          className="text-[18px] font-JakartaBold mb-2"
          style={{ color: textPrimary }}
        >
          {t("auth.location.background_title")}
        </Text>
        <Text
          className="text-[14px] font-Jakarta leading-[20px]"
          style={{ color: textSecondary }}
        >
          {t("auth.location.background_body")}
        </Text>
      </View>

      <Text
        className="text-[13px] font-Jakarta text-center mb-4 px-4"
        style={{ color: textSecondary }}
      >
        {t("auth.location.inactive_note")}
      </Text>

      {/* Bottom spacer */}
      <View className="flex-1" />

      {/* Buttons */}
      <View className="w-full pb-10 gap-3">
        <CustomButton
          title={t("auth.location.enable_all")}
          onPress={allow}
         testID="driver-enable-location.allow"/>
        <CustomButton
          title={t("auth.location.not_now")}
          bgVariant="secondary"
          onPress={skip}
         testID="driver-enable-location.skip"/>
      </View>
    </SafeAreaView>
  );
}
