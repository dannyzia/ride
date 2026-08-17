import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ReactNativeModal from "react-native-modal";
import * as Location from "expo-location";
import { API_URL } from "@/lib/config";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useRiderStore } from "@/store/useRiderStore";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// C-4: this screen previously never called the API — it was a static 3-button
// page (call / sms / help link) with a 🆘 emoji. It now fires the real
// POST /api/sos/alert (with location + ride context for the admin dashboard)
// and dials first, matching the SOSButton T-1 contract: the emergency call
// must never depend on a network round-trip.
export default function EmergencySOS() {
  const isDark = useIsDark();
  const activeRideId = useRiderStore((s) => s.activeRide?.id);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [sending, setSending] = useState(false);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const sendAlert = useCallback(async () => {
    // Fire the alert best-effort — a failed fetch must never fail the call.
    try {
      let lat = 0;
      let lng = 0;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch {
        // Location unavailable — send without coords
      }
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        await fetch(`${API_URL}/api/sos/alert`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lat,
            lng,
            ride_id: activeRideId ?? undefined,
            message: "Rider SOS alert",
          }),
        }).catch(() => {});
      }
      logger.info("[emergency-sos] alert fired", { lat, lng, ride_id: activeRideId });
    } catch {
      // Non-blocking
    }
  }, [activeRideId]);

  const handleConfirm = useCallback(async () => {
    if (sending) return;
    setSending(true);
    // DIAL FIRST (T-1): the emergency call must never depend on a network
    // round-trip. The alert below is best-effort and must not block it.
    const phoneUrl = "tel:999";
    const canOpen = await Linking.canOpenURL(phoneUrl);
    if (canOpen) {
      await Linking.openURL(phoneUrl);
    } else {
      // Simulator / no dialer — still send the alert
    }
    setConfirmVisible(false);
    await sendAlert();
    setSending(false);
  }, [sending, sendAlert]);

  const handleShareLocation = () => {
    Linking.openURL("sms:?body=I need help. My live location is being shared via the Ride app.");
  };

  const handleReportIssue = () => {
    router.push("/(main)/(customer)/(tabs)/settings/help-support");
  };

  return (
    <SafeAreaView className="flex-1 items-center justify-center px-6" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />

      <View className="items-center mb-8">
        {/* 64px danger button per §6.16 */}
        <View
          className="w-16 h-16 rounded-full items-center justify-center mb-4"
          style={{ backgroundColor: colors.danger }}
        >
          <Ionicons name="shield" size={32} color={colors.white} />
        </View>
        <Text className="text-2xl font-JakartaBold tracking-tight mb-2" style={{ color: colors.danger }}>
          Emergency SOS
        </Text>
        <Text className="text-base font-Jakarta text-center mb-6" style={{ color: textSecondary }}>
          Tap for immediate help
        </Text>
      </View>

      <View className="w-full gap-4">
        <TouchableOpacity
          className="rounded-full w-full py-4 items-center"
          style={{ backgroundColor: colors.danger }}
          onPress={() => setConfirmVisible(true)}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel="Send SOS and call emergency services"
        >
          {sending ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text className="text-lg font-JakartaBold text-goWhite">Send SOS &amp; Call 999</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          className="rounded-full w-full py-4 items-center border"
          style={{ borderColor }}
          onPress={handleShareLocation}
          accessibilityRole="button"
          accessibilityLabel="Share live location"
        >
          <Text className="text-lg font-JakartaBold" style={{ color: textPrimary }}>
            Share Live Location
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="rounded-full w-full py-4 items-center border"
          style={{ borderColor }}
          onPress={handleReportIssue}
          accessibilityRole="button"
          accessibilityLabel="Report safety issue"
        >
          <Text className="text-lg font-JakartaBold" style={{ color: textPrimary }}>
            Report Safety Issue
          </Text>
        </TouchableOpacity>
      </View>

      {/* Confirmation modal (§6.16) */}
      <ReactNativeModal
        isVisible={confirmVisible}
        onBackdropPress={() => !sending && setConfirmVisible(false)}
        style={{ justifyContent: "flex-end", margin: 0 }}
      >
        <View
          className="rounded-t-3xl p-6"
          style={{ backgroundColor: surfaceBg, paddingBottom: 40 }}
        >
          <View className="items-center mb-4">
            <View
              className="w-14 h-14 rounded-full items-center justify-center mb-3"
              style={{ backgroundColor: colors.danger }}
            >
              <Ionicons name="warning" size={28} color={colors.white} />
            </View>
            <Text className="text-lg font-JakartaBold text-center" style={{ color: textPrimary }}>
              Send Emergency SOS?
            </Text>
            <Text className="text-sm font-Jakarta text-center mt-2" style={{ color: textSecondary }}>
              This will call emergency services (999) and send your live location to our safety team.
            </Text>
          </View>

          <TouchableOpacity
            className="rounded-full py-4 items-center mb-3"
            style={{ backgroundColor: colors.danger }}
            onPress={handleConfirm}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Call 999 and send alert"
          >
            {sending ? (
              <ActivityIndicator size={20} color={colors.white} />
            ) : (
              <Text className="text-base font-JakartaBold text-goWhite">Call 999 &amp; Send Alert</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className="rounded-full py-4 items-center border"
            style={{ borderColor }}
            onPress={() => setConfirmVisible(false)}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text className="text-base font-JakartaSemiBold" style={{ color: textSecondary }}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </ReactNativeModal>
    </SafeAreaView>
  );
}
