/**
 * C3-7 (STAGE C3-FIX): counterparty SOS banner.
 *
 * Listens for the server `sos:counterparty` WS event (fanned out by
 * utils-server /internal/sos/alert, pushed by POST /api/sos/alert):
 *  - rider SOS → the DRIVER sees "Rider emergency — check via ride chat"
 *  - driver SOS → the RIDER sees the safe-exit message
 * Mounted on driver home and the rider tracking screen. Tapping opens the
 * ride chat (in-app chat is the contact channel); dismiss clears it.
 */
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useWSStore } from "@/store";

interface CounterpartyAlert {
  alert_id: string;
  ride_id: string;
  from_role: "rider" | "driver";
}

export default function SosCounterpartyBanner({ rideId }: { rideId?: string }) {
  const { t } = useTranslation();
  const ws = useWSStore((s) => s.ws);
  const [alert, setAlert] = useState<CounterpartyAlert | null>(null);

  useEffect(() => {
    if (!ws) return;
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (
          msg?.type === "sos:counterparty" &&
          (msg.from_role === "rider" || msg.from_role === "driver") &&
          typeof msg.ride_id === "string"
        ) {
          if (!rideId || msg.ride_id === rideId) {
            setAlert({ alert_id: msg.alert_id, ride_id: msg.ride_id, from_role: msg.from_role });
          }
        }
      } catch {
        // ignore malformed frames
      }
    };
    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [ws, rideId]);

  if (!alert) return null;

  const isRiderSos = alert.from_role === "rider";
  const title = isRiderSos
    ? t("emergency_sos.counterparty_rider_title")
    : t("emergency_sos.counterparty_driver_title");
  const body = isRiderSos
    ? t("emergency_sos.counterparty_rider_body")
    : t("emergency_sos.counterparty_driver_body");
  const chatHref = isRiderSos
    ? (`/(main)/(rider)/chat/${alert.ride_id}` as const)
    : (`/(main)/(customer)/chat/${alert.ride_id}` as const);

  return (
    <View style={styles.banner} testID="sos.counterparty-banner">
      <TouchableOpacity
        style={styles.bannerInner}
        onPress={() => router.push(chatHref)}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <Ionicons name="warning" size={20} color="#FFF" />
        <View style={styles.textWrap}>
          <Text style={styles.bannerTitle} numberOfLines={1}>
            🚨 {title}
          </Text>
          <Text style={styles.bannerBody} numberOfLines={2}>
            {body}
          </Text>
        </View>
        <Text style={styles.bannerTap}>{t("emergency_sos.counterparty_tap_chat")}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.dismiss}
        onPress={() => setAlert(null)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        testID="sos.counterparty-banner.dismiss"
      >
        <Ionicons name="close" size={18} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#B91C1C",
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  bannerInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  textWrap: {
    flex: 1,
  },
  bannerTitle: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 14,
  },
  bannerBody: {
    color: "#FFF",
    fontWeight: "400",
    fontSize: 12,
    opacity: 0.9,
  },
  bannerTap: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 10,
    letterSpacing: 1,
  },
  dismiss: {
    padding: 6,
  },
});
