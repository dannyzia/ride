/**
 * Rental confirmed screen — shown after customer accepts a bid.
 * Displays the confirmed booking status, countdown to confirmation deadline,
 * and the payment disclosure (§F.3).
 *
 * Route: /(rental-marketplace)/confirmed
 */
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { useRentalStore } from "@/store/useRentalStore";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useTranslation } from "react-i18next";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

export default function RentalConfirmedScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const { activeRequest, updateRequestStatus } = useRentalStore();
  const [polling, setPolling] = useState(true);

  const pollStatus = useCallback(async () => {
    if (!activeRequest) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(
        `${SERVER_URL}/api/rental/requests/${activeRequest.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        const status = data.request?.status;
        if (status) {
          updateRequestStatus(status);
          if (status === "confirmed" || status === "cancelled" || status === "expired") {
            setPolling(false);
          }
        }
      }
    } catch (err) {
      logger.error("[confirmed] poll error", err);
    }
  }, [activeRequest, updateRequestStatus]);

  useEffect(() => {
    if (!polling || !activeRequest) return;
    pollStatus();
    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, [polling, pollStatus, activeRequest]);

  const status = activeRequest?.status ?? "broadcasting";
  const isConfirmed = status === "confirmed";
  const isCancelled = status === "cancelled" || status === "expired";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
        {/* Status icon */}
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: isConfirmed ? colors.primary + "20" : isCancelled ? colors.danger + "20" : colors.amber + "20",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          {isConfirmed ? (
            <Ionicons name="checkmark-circle" size={40} color={colors.primary} />
          ) : isCancelled ? (
            <Ionicons name="close-circle" size={40} color={colors.danger} />
          ) : (
            <ActivityIndicator size="large" color={colors.amber} />
          )}
        </View>

        <Text style={{ fontSize: 22, fontFamily: "JakartaBold", color: textPrimary, textAlign: "center", marginBottom: 8 }}>
          {isConfirmed ? t("rental_confirmed.title_confirmed") : isCancelled ? t("rental_confirmed.title_ended") : t("rental_confirmed.title_waiting")}
        </Text>

        <Text style={{ fontSize: 14, fontFamily: "Jakarta", color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight, textAlign: "center", marginBottom: 32 }}>
          {isConfirmed
            ? t("rental_confirmed.body_confirmed")
            : isCancelled
              ? t("rental_confirmed.body_ended")
              : t("rental_confirmed.body_waiting")}
        </Text>

        {/* Payment disclosure (§F.3) */}
        <View style={{ backgroundColor: "#FEF3C7", borderRadius: 10, padding: 14, marginBottom: 32, width: "100%" }}>
          <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: "#92400E", textAlign: "center" }}>
            {t("rental_marketplace.payment_disclosure")}
          </Text>
        </View>

        {/* Actions */}
        {isConfirmed ? (
          <TouchableOpacity
            onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 12,
              height: 52,
              width: "100%",
              alignItems: "center",
              justifyContent: "center",
            }}
           testID="customer.rental-marketplace.confirmed.replace-home">
            <Text style={{ color: "#FFFFFF", fontSize: 16, fontFamily: "JakartaSemiBold" }}>
              {t("rental_confirmed.back_home")}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              borderWidth: 2,
              borderColor,
              borderRadius: 12,
              height: 52,
              width: "100%",
              alignItems: "center",
              justifyContent: "center",
            }}
           testID="customer.rental-marketplace.confirmed.el-1">
            <Text style={{ color: textPrimary, fontSize: 16, fontFamily: "JakartaSemiBold" }}>
              {t("rental_confirmed.go_back")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
