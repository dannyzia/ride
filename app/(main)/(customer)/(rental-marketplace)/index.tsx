/**
 * Rental landing — three separate entries (car / truck / scheduled ambulance),
 * each opening its own dedicated request screen (ISSUE-117: "the hub should
 * have three separate car rental, truck rental and ambulance rental … should
 * open in its own screen"). The request forms live in car.tsx / truck.tsx /
 * ambulance.tsx via the shared _components/RentalRequestForm.
 *
 * testID note: every testID is a literal attribute directly on its element
 * (the manifest scanner + codemod record literals only), and every handler is
 * a named useCallback reference so the codemod's slug derivation
 * (router.push target leaf → push-<leaf>) matches the literal exactly.
 */
import { useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { useTranslation } from "react-i18next";

export default function RentalLandingScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  // Named handlers — the testID codemod derives ids from the router.push
  // target's last path segment (push-<leaf>), matching the literals below.
  const pushCar = useCallback(
    () => router.push("/(main)/(customer)/(rental-marketplace)/car"),
    [],
  );
  const pushTruck = useCallback(
    () => router.push("/(main)/(customer)/(rental-marketplace)/truck"),
    [],
  );
  const pushAmbulance = useCallback(
    () => router.push("/(main)/(customer)/(rental-marketplace)/ambulance"),
    [],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} testID="customer.rental-marketplace.el-1">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
          {t("services_hub.rental")}
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Car rental */}
        <TouchableOpacity
          onPress={pushCar}
          accessibilityRole="button"
          accessibilityLabel={t("rental_marketplace.cat_car")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 16,
            backgroundColor: surfaceBg,
            borderWidth: 2,
            borderColor: colors.primary,
            borderRadius: 14,
            marginBottom: 16,
          }}
         testID="customer.rental-marketplace.push-car">
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.primary + "1F",
              marginRight: 12,
            }}
          >
            <Ionicons name="car-sport" size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontFamily: "JakartaSemiBold", color: colors.primary }}>
              {t("rental_marketplace.cat_car")}
            </Text>
            <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}>
              {t("services_hub.rental_subtitle")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>

        {/* Truck rental */}
        <TouchableOpacity
          onPress={pushTruck}
          accessibilityRole="button"
          accessibilityLabel={t("rental_marketplace.cat_truck")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 16,
            backgroundColor: surfaceBg,
            borderWidth: 2,
            borderColor: colors.blue,
            borderRadius: 14,
            marginBottom: 16,
          }}
         testID="customer.rental-marketplace.push-truck">
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.blue + "1F",
              marginRight: 12,
            }}
          >
            <Ionicons name="bus" size={26} color={colors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontFamily: "JakartaSemiBold", color: colors.blue }}>
              {t("rental_marketplace.cat_truck")}
            </Text>
            <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}>
              {t("services_hub.rental_subtitle")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.blue} />
        </TouchableOpacity>

        {/* Scheduled ambulance rental */}
        <TouchableOpacity
          onPress={pushAmbulance}
          accessibilityRole="button"
          accessibilityLabel={t("rental_marketplace.title_ambulance")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 16,
            backgroundColor: surfaceBg,
            borderWidth: 2,
            borderColor: colors.danger,
            borderRadius: 14,
            marginBottom: 16,
          }}
         testID="customer.rental-marketplace.push-ambulance">
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.danger + "1F",
              marginRight: 12,
            }}
          >
            <Ionicons name="medkit" size={26} color={colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontFamily: "JakartaSemiBold", color: colors.danger }}>
              {t("rental_marketplace.title_ambulance")}
            </Text>
            <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}>
              {t("services_hub.rental_subtitle")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.danger} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
