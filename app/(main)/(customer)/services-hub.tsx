import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";
import { useCustomer } from "@/store";
import { ensureRiderSocket } from "@/lib/riderSocket";
import { VEHICLE_CATEGORIES } from "@/lib/vehicleTypes";

// Greeting bucket by hour; the string itself is resolved through i18n.
function getGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "services_hub.good_morning";
  if (hour >= 12 && hour < 17) return "services_hub.good_afternoon";
  if (hour >= 17 && hour < 21) return "services_hub.good_evening";
  return "services_hub.good_night";
}

export default function ServicesHub() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { language, setTheme } = useAppearance();
  const { userAddress } = useCustomer();
  const [greetingKey, setGreetingKey] = useState("services_hub.good_morning");
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  useEffect(() => {
    setGreetingKey(getGreetingKey());
    // L8: open the rider session's WS singleton here (the driver side opens
    // its singleton on driver home). Ride screens subscribe per ride.
    ensureRiderSocket();
  }, []);

  const handleSelect = (serviceKey: string) => {
    router.push({
      pathname: "/(main)/(customer)/(tabs)/home",
      params: { service: serviceKey },
    });
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      {/* Header */}
      <View className="px-6 pt-4 pb-2 flex-row justify-between items-center">
        <View className="flex-1">
          <Text
            className="text-[28px] font-JakartaBold"
            style={{ color: textPrimary }}
          >
            {t(greetingKey)}
          </Text>
          <View className="flex-row items-center mt-1">
            <Ionicons name="location" size={16} color={colors.primary} />
            <Text
              className="text-sm font-Jakarta ml-1"
              style={{ color: textSecondary }}
            >
              {userAddress || t("services_hub.current_location")}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setTheme(isDark ? "light" : "dark")}
          hitSlop={8}
          className="ml-4"
        >
          <Ionicons
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={24}
            color={textPrimary}
          />
        </TouchableOpacity>
      </View>

      {/* Services Grid */}
      <ScrollView className="flex-1 px-6 pt-6">
        <Text
          className="text-lg font-JakartaSemiBold mb-4"
          style={{ color: textPrimary }}
        >
          {t("services_hub.what_service")}
        </Text>

        <View className="flex-row flex-wrap gap-3">
          {VEHICLE_CATEGORIES.map((cat) => {
            const label = language === "bn" ? cat.display_bn : cat.display_en;
            const color =
              cat.key === "bike"
                ? colors.primary
                : cat.key === "cng"
                  ? colors.blue
                  : cat.key === "car"
                    ? colors.amber
                    : colors.indigo;
            return (
              <TouchableOpacity
                key={cat.key}
                className="rounded-2xl p-5 items-center"
                style={{
                  width: "48%",
                  backgroundColor: surfaceBg,
                  borderWidth: 1,
                  borderColor: borderColor,
                }}
                onPress={() => handleSelect(cat.key)}
                activeOpacity={0.8}
              >
                <View
                  className="w-14 h-14 rounded-full items-center justify-center mb-3"
                  style={{ backgroundColor: color + "18" }}
                >
                  <Ionicons
                    name={cat.icon}
                    size={28}
                    color={color}
                  />
                </View>
                <Text
                  className="text-base font-JakartaBold"
                  style={{ color: textPrimary }}
                >
                  {label}
                </Text>
                <Text
                  className="text-xs font-Jakarta mt-1 text-center"
                  style={{ color: textSecondary }}
                >
                  {language === "bn" ? cat.subtitle_bn : cat.subtitle_en}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Marketplace services */}
        <Text
          className="text-lg font-JakartaSemiBold mt-6 mb-4"
          style={{ color: textPrimary }}
        >
          {t("services_hub.marketplace")}
        </Text>
        <View className="flex-row flex-wrap gap-3">
          <TouchableOpacity
            className="rounded-2xl p-5 items-center"
            style={{
              width: "48%",
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor: borderColor,
            }}
            onPress={() => router.push("/(main)/(customer)/(shops)")}
            activeOpacity={0.8}
          >
            <View
              className="w-14 h-14 rounded-full items-center justify-center mb-3"
              style={{ backgroundColor: colors.primary + "18" }}
            >
              <Ionicons name="storefront" size={28} color={colors.primary} />
            </View>
            <Text
              className="text-base font-JakartaBold"
              style={{ color: textPrimary }}
            >
              {t("services_hub.shops")}
            </Text>
            <Text
              className="text-xs font-Jakarta mt-1 text-center"
              style={{ color: textSecondary }}
            >
              {t("services_hub.shops_subtitle")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="rounded-2xl p-5 items-center"
            style={{
              width: "48%",
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor: borderColor,
            }}
            onPress={() => router.push("/(main)/(customer)/(rental-marketplace)")}
            activeOpacity={0.8}
          >
            <View
              className="w-14 h-14 rounded-full items-center justify-center mb-3"
              style={{ backgroundColor: colors.amber + "18" }}
            >
              <Ionicons name="car-sport" size={28} color={colors.amber} />
            </View>
            <Text
              className="text-base font-JakartaBold"
              style={{ color: textPrimary }}
            >
              {t("services_hub.rental")}
            </Text>
            <Text
              className="text-xs font-Jakarta mt-1 text-center"
              style={{ color: textSecondary }}
            >
              {t("services_hub.rental_subtitle")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Delivery */}
        <View className="flex-row justify-between mb-4">
          <TouchableOpacity
            className="rounded-2xl p-5 items-center"
            style={{
              width: "48%",
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor: borderColor,
            }}
            onPress={() => router.push("/(main)/(customer)/(delivery)")}
            activeOpacity={0.8}
          >
            <View
              className="w-14 h-14 rounded-full items-center justify-center mb-3"
              style={{ backgroundColor: colors.primary + "18" }}
            >
              <Ionicons name="bicycle" size={28} color={colors.primary} />
            </View>
            <Text
              className="text-base font-JakartaBold"
              style={{ color: textPrimary }}
            >
              {t("services_hub.delivery")}
            </Text>
            <Text
              className="text-xs font-Jakarta mt-1 text-center"
              style={{ color: textSecondary }}
            >
              {t("services_hub.delivery_subtitle")}
            </Text>
          </TouchableOpacity>

          {/* Ambulance (Phase 6 — §F.0 sanctioned navigation-only exception) */}
          <TouchableOpacity
            className="rounded-2xl p-5 items-center"
            style={{
              width: "48%",
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor: borderColor,
            }}
            onPress={() => router.push("/(main)/(customer)/(ambulance)/emergency")}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t("services_hub.a11y_emergency_ambulance")}
          >
            <View
              className="w-14 h-14 rounded-full items-center justify-center mb-3"
              style={{ backgroundColor: colors.danger + "18" }}
            >
              <Ionicons name="medkit" size={28} color={colors.danger} />
            </View>
            <Text
              className="text-base font-JakartaBold"
              style={{ color: textPrimary }}
            >
              {t("services_hub.ambulance")}
            </Text>
            <Text
              className="text-xs font-Jakarta mt-1 text-center"
              style={{ color: textSecondary }}
            >
              {t("services_hub.ambulance_subtitle")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Spacer for future services */}
        <View className="h-20" />
      </ScrollView>
    </SafeAreaView>
  );
}
