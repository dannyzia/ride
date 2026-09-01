/**
 * Ambulance emergency feed (Phase 6) — eligible `emergency:new_request`
 * broadcasts over the driver WS, first-accept-wins accept (§B.0), and §B.5
 * status transitions. a11y: alarm states are labelled.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { useWSStore } from "@/store";
import { useEmergencyStore } from "@/store/useEmergencyStore";
import {
  ensureEmergencySocket,
  sendEmergencyMessage,
} from "@/lib/emergencySocket";
import { logger } from "@/lib/logger";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";
void SERVER_URL;

/** RN WebSocket message event shape (not exported by this RN version's types). */
interface WsMessageEvent {
  data: unknown;
}

export default function AmbulanceDriverScreen() {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const { feed, addOrUpdateFeedItem, removeFromFeed } = useEmergencyStore();
  const [socketReady, setSocketReady] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const attach = useCallback(
    (ws: WebSocket) => {
      ws.addEventListener("message", (raw: WsMessageEvent) => {
        try {
          const msg = JSON.parse(String(raw.data));
          if (msg.type === "emergency:new_request") {
            addOrUpdateFeedItem({
              id: msg.request_id,
              caller_user_id: "",
              pickup_address: msg.pickup?.address ?? "",
              pickup_lat: msg.pickup?.lat ?? 0,
              pickup_lng: msg.pickup?.lng ?? 0,
              requires_paramedic: !!msg.requires_paramedic,
              service_level: msg.service_level,
              status: "broadcasting",
              expires_at: msg.expires_at,
              created_at: new Date().toISOString(),
            });
          } else if (msg.type === "emergency:status" || msg.type === "emergency:cancel") {
            removeFromFeed(msg.request_id);
          }
        } catch {
          // non-JSON frame — ignore
        }
      });
    },
    [addOrUpdateFeedItem, removeFromFeed],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const socket = await ensureEmergencySocket();
      if (cancelled) return;
      if (socket) {
        attach(socket);
        setSocketReady(socket.readyState === WebSocket.OPEN);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attach]);

  const handleAccept = (requestId: string) => {
    const ok = sendEmergencyMessage({
      type: "emergency:accept",
      payload: { request_id: requestId },
    });
    if (!ok) {
      Alert.alert("Offline", "Emergency socket not connected — pull to retry");
      return;
    }
    const ws = useWSStore.getState().ws;
    if (ws) {
      const onMsg = (raw: WsMessageEvent) => {
        try {
          const msg = JSON.parse(String(raw.data));
          if (msg.type === "error" && msg.message) {
            ws.removeEventListener("message", onMsg);
            if (msg.message === "ambulance_certification_required") {
              Alert.alert(
                "Certification required",
                "A verified ambulance certification is needed. Open the certification screen?",
                [
                  { text: "Later", style: "cancel" },
                  { text: "Open", onPress: () => router.push("/(main)/(ambulance-cert)") },
                ],
              );
            } else {
              Alert.alert("Not accepted", String(msg.message));
            }
          } else if (msg.type === "emergency:accepted" && msg.request_id === requestId) {
            ws.removeEventListener("message", onMsg);
            setAccepted((prev) => ({ ...prev, [requestId]: "assigned" }));
          }
        } catch {
          // ignore non-JSON
        }
      };
      ws.addEventListener("message", onMsg);
    }
  };

  const handleStatus = (requestId: string, status: string) => {
    const ok = sendEmergencyMessage({
      type: "emergency:status",
      payload: { request_id: requestId, status },
    });
    if (ok) {
      setAccepted((prev) => ({ ...prev, [requestId]: status }));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
          Emergency Calls
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center" }} accessibilityLabel={socketReady ? "Emergency feed connected" : "Emergency feed connecting"}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: socketReady ? "#0CC25F" : "#F59E0B", marginRight: 6 }} />
          <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: textSecondary }}>
            {socketReady ? "Live" : "…"}
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 20 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await ensureEmergencySocket();
              setRefreshing(false);
            }}
          />
        }
      >
        {/* Active assignment panel */}
        {Object.entries(accepted).length > 0 && (
          <>
            <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
              Your emergency
            </Text>
            {Object.entries(accepted).map(([requestId, status]) => (
              <View key={requestId} style={{ backgroundColor: colors.danger + "14", borderWidth: 1, borderColor: colors.danger, borderRadius: 14, padding: 14, marginBottom: 12 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center" }}
                  accessibilityLiveRegion="polite"
                  accessibilityLabel={`Emergency status ${status.replace(/_/g, " ")}`}
                >
                  <Ionicons name="medkit" size={18} color={colors.danger} />
                  <Text style={{ flex: 1, fontSize: 14, fontFamily: "JakartaSemiBold", color: colors.danger, marginLeft: 8 }}>
                    {status.replace(/_/g, " ")}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
                  {[
                    { key: "en_route_pickup", label: "En route" },
                    { key: "arrived", label: "Arrived" },
                    { key: "en_route_dropoff", label: "Patient loaded" },
                    { key: "completed", label: "Complete" },
                  ].map((step) => (
                    <TouchableOpacity
                      key={step.key}
                      onPress={() => handleStatus(requestId, step.key)}
                      accessibilityRole="button"
                      accessibilityLabel={`${step.label} — set emergency status`}
                      style={{
                        backgroundColor: status === step.key ? colors.danger : surfaceBg,
                        borderWidth: 1,
                        borderColor: status === step.key ? colors.danger : borderColor,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        marginRight: 8,
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: "JakartaSemiBold", color: status === step.key ? "#FFFFFF" : textPrimary }}>
                        {step.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}

        {/* Broadcast feed */}
        <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
          Nearby emergencies
        </Text>
        {feed.length === 0 ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <ActivityIndicator size="small" color={colors.danger} />
            <Text style={{ fontSize: 14, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 12, textAlign: "center" }}>
              Listening for emergency calls near you…
            </Text>
          </View>
        ) : (
          feed.map((req) => {
            const secondsLeft = Math.max(
              0,
              Math.floor((new Date(req.expires_at).getTime() - Date.now()) / 1000),
            );
            return (
              <View
                key={req.id}
                style={{ backgroundColor: surfaceBg, borderWidth: 2, borderColor: colors.danger, borderRadius: 16, padding: 16, marginBottom: 12 }}
                accessibilityLabel={`Emergency call: ${req.service_level ?? ""} ambulance, ${req.pickup_address}`}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ backgroundColor: colors.danger, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ color: "#FFFFFF", fontSize: 11, fontFamily: "JakartaSemiBold" }}>
                      {req.service_level ?? "—"}
                    </Text>
                  </View>
                  {req.requires_paramedic ? (
                    <View style={{ backgroundColor: colors.amber + "1F", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 }}>
                      <Text style={{ fontSize: 11, fontFamily: "JakartaSemiBold", color: colors.amber }}>
                        Paramedic
                      </Text>
                    </View>
                  ) : null}
                  <Text
                    style={{
                      flex: 1,
                      textAlign: "right",
                      fontSize: 12,
                      fontFamily: "JakartaSemiBold",
                      color: secondsLeft < 30 ? colors.danger : textSecondary,
                    }}
                  >
                    {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                  </Text>
                </View>
                <Text style={{ fontSize: 14, fontFamily: "JakartaMedium", color: textPrimary, marginTop: 8 }}>
                  {req.pickup_address}
                </Text>
                <TouchableOpacity
                  onPress={() => handleAccept(req.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Accept ${req.service_level ?? ""} emergency call`}
                  style={{ backgroundColor: colors.danger, borderRadius: 12, height: 44, alignItems: "center", justifyContent: "center", marginTop: 12 }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 15, fontFamily: "JakartaSemiBold" }}>
                    ACCEPT CALL
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
