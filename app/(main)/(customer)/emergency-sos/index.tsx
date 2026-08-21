import { useState, useCallback, useEffect, useRef } from "react";
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
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useRiderStore } from "@/store/useRiderStore";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { enqueueSosAlert } from "@/lib/sosQueue";
import NetInfo from "@react-native-community/netinfo";
import { useSosActive } from "@/lib/useSosActive";

/**
 * Returns a human-readable "time ago" string from an ISO date.
 */
function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// C-4: this screen previously never called the API — it was a static 3-button
// page (call / sms / help link) with a 🆘 emoji. It now fires the real
// POST /api/sos/alert (with location + ride context for the admin dashboard)
// and dials first, matching the SOSButton T-1 contract: the emergency call
// must never depend on a network round-trip.
export default function EmergencySOS() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const activeRideId = useRiderStore((s) => s.activeRide?.id);
  const { active, alert, loading: alertLoading, resolving, resolveAlert, refetch } = useSosActive();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [queued, setQueued] = useState(false);

  // Live "time ago" ticker for the active alert — updates every 10s via the
  // hook's poll, but we also tick a local counter to keep the display fresh
  // between polls.
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (active) {
      tickRef.current = setInterval(() => setTick((t) => t + 1), 10_000);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [active]);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const sendAlert = useCallback(async () => {
    // Fire the alert best-effort — a failed fetch must never fail the call.
    // C-4 / SOS Queue: if offline, queue the alert for retry on reconnect
    // instead of silently dropping it.
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

      const net = await NetInfo.fetch();
      const isOnline = net.isConnected === true;

      if (!isOnline) {
        const result = await enqueueSosAlert({
          lat,
          lng,
          ride_id: activeRideId ?? undefined,
          message: "Rider SOS alert",
        });
        if (result.queued) {
          setQueued(true);
          logger.info("[emergency-sos] alert queued (offline)", {
            id: result.id,
            lat,
            lng,
            ride_id: activeRideId,
          });
        }
      } else {
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
      }
      logger.info("[emergency-sos] alert fired", { lat, lng, ride_id: activeRideId });
      // Refresh active alert state so the UI transitions to the alert view
      await refetch();
    } catch {
      // Non-blocking
    }
  }, [activeRideId, refetch]);

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

  const handleResolve = useCallback(async () => {
    const ok = await resolveAlert();
    if (ok) {
      setQueued(false);
    }
  }, [resolveAlert]);

  const handleShareLocation = () => {
    Linking.openURL("sms:?body=I need help. My live location is being shared via the Ride app.");
  };

  const handleReportIssue = () => {
    router.push("/(main)/(customer)/(tabs)/settings/help-support");
  };

  const statusLabel = alert?.status === "acknowledged" ? "Acknowledged" : "Active";

  // ── Active alert view ──────────────────────────────────────────
  if (active && alert) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center px-6" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />

        <View className="items-center mb-8">
          <View
            className="w-16 h-16 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: colors.danger }}
          >
            <Ionicons name="shield" size={32} color={colors.white} />
          </View>
          <Text className="text-2xl font-JakartaBold tracking-tight mb-2" style={{ color: colors.danger }}>
            Active SOS Alert
          </Text>
          <Text className="text-base font-Jakarta text-center mb-2" style={{ color: textSecondary }}>
            Your emergency alert is being handled
          </Text>

          {/* Status badge */}
          <View
            className="flex-row items-center rounded-full px-4 py-2 mt-2"
            style={{ backgroundColor: alert.status === "acknowledged" ? colors.primaryLight : colors.dangerLight }}
            accessibilityRole="text"
            accessibilityLabel={`Alert status: ${statusLabel}`}
          >
            <View
              className="w-2 h-2 rounded-full mr-2"
              style={{ backgroundColor: alert.status === "acknowledged" ? colors.primary : colors.danger }}
            />
            <Text
              className="text-sm font-JakartaSemiBold"
              style={{ color: alert.status === "acknowledged" ? colors.primary : colors.danger }}
            >
              {statusLabel}
            </Text>
          </View>

          {/* Time since creation */}
          <Text className="text-sm font-Jakarta mt-3" style={{ color: textSecondary }}>
            {timeAgo(alert.created_at)}
          </Text>

          {alert.message && (
            <Text className="text-sm font-Jakarta mt-2 text-center" style={{ color: textSecondary }}>
              {alert.message}
            </Text>
          )}
        </View>

        <View className="w-full gap-4">
          {/* Resolve button */}
          <TouchableOpacity
            className="rounded-full w-full py-4 items-center"
            style={{ backgroundColor: colors.danger }}
            onPress={handleResolve}
            disabled={resolving}
            accessibilityRole="button"
            accessibilityLabel="Resolve this SOS alert"
          >
            {resolving ? (
              <ActivityIndicator size={20} color={colors.white} />
            ) : (
              <Text className="text-lg font-JakartaBold text-goWhite">Resolve Alert</Text>
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

        {/* Theme toggle */}
        <TouchableOpacity
          onPress={() => setTheme(isDark ? "light" : "dark")}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Loading skeleton ──────────────────────────────────────────
  if (alertLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center px-6" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <ActivityIndicator size="large" color={colors.danger} />
        <Text className="text-sm font-Jakarta mt-4" style={{ color: textSecondary }}>
          Checking for active alerts…
        </Text>
      </SafeAreaView>
    );
  }

  // ── Default trigger view (no active alert) ─────────────────────
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

        {queued && (
          <View
            className="flex-row items-center justify-center rounded-xl py-3 px-4"
            style={{ backgroundColor: colors.amberLight }}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Ionicons name="cloud-offline-outline" size={18} color={colors.amber} style={{ marginRight: 8 }} />
            <Text className="text-sm font-JakartaMedium" style={{ color: colors.amber }}>
              Alert queued — will send when online
            </Text>
          </View>
        )}

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

      {/* Theme toggle */}
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
