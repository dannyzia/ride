/**
 * C8-2 — Fleet Marketplace (fleet-surface tab/section).
 *
 * The fleet dashboard's rental/ambulance entry point: a pure business-fleet
 * owner (no drivers row) reaches it from the fleet dashboard and can
 * - browse the rental request feed (GET broadcasts, same feed as the
 *   (rental-bidder) machinery) → SUBMIT BID reuses the existing
 *   (rental-bidder)/bid-submit screen verbatim (requestId + category params),
 * - see my-bids + outcomes (GET bids/active) with the 5-min SLA ack button
 *   (POST fleet-ack) on awarded tracking-required requests lacking ack,
 * - see open ambulance requests (GET emergency open feed) with an Accept
 *   button POSTing the existing emergency accept endpoint (which keeps its
 *   requireAmbulanceCertified gate — non-certified staff see the queue but
 *   cannot take from it).
 *
 * Pattern A theming + hard-coded English (fleet-surface precedent).
 */
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useFleetStore } from "@/store/useFleetStore";
import FleetScreen from "@/components/fleet/FleetScreen";
import { getAuthHeaders } from "@/lib/fleetAuth";
import { logger } from "@/lib/logger";
import { formatBDT } from "@/lib/format";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "";

interface FeedRequest {
  id: string;
  category: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  tracking_required: boolean;
  soft_deadline_at: string;
  already_bid: boolean;
}

interface Bid {
  id: string;
  request_id: string;
  fleet_id: string;
  vehicle_type: string;
  quoted_price_bdt: number;
  status: string;
  submitted_at: string;
}

interface AmbulanceRequest {
  id: string;
  pickup_address: string;
  dropoff_address: string | null;
  patient_condition: string;
  service_level: string | null;
  expires_at: string;
}

const BID_COLORS: Record<string, string> = {
  active: "#3B82F6",
  won: "#0CC25F",
  lost: "#EF4444",
  withdrawn: "#9CA3AF",
  expired: "#9CA3AF",
  superseded: "#F59E0B",
};

async function authed(path: string, init?: RequestInit) {
  const headers = (await getAuthHeaders()) ?? {};
  const res = await fetch(`${SERVER_URL}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
  return res;
}

export default function FleetMarketplace() {
  const isDark = useIsDark();
  const router = useRouter();
  const fleetId = useFleetStore((s) => s.activeFleetId);

  const [feed, setFeed] = useState<FeedRequest[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [ackable, setAckable] = useState<Set<string>>(new Set());
  const [ambulance, setAmbulance] = useState<AmbulanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const fetchAll = useCallback(async () => {
    if (!fleetId) return;
    try {
      const [feedRes, bidsRes, ambRes] = await Promise.all([
        authed(`/api/rental/requests/broadcasts?page=1`),
        authed(`/api/rental/bids/active`),
        authed(`/api/emergency/requests/open`),
      ]);
      if (feedRes.ok) {
        const data = await feedRes.json();
        setFeed((data.requests ?? []).slice(0, 5));
      }
      let wonBids: Bid[] = [];
      if (bidsRes.ok) {
        const data = await bidsRes.json();
        const rows: Bid[] = data.bids ?? [];
        setBids(rows);
        wonBids = rows.filter((b) => b.status === "won");
      }
      if (ambRes.ok) {
        const data = await ambRes.json();
        setAmbulance(data.requests ?? []);
      } else {
        setAmbulance([]);
      }
      // SLA-ack eligibility: awarded + tracking-required + no ack yet. The
      // bids feed carries no parent-request fields, so resolve per won bid
      // (usually zero or one row) against the request detail endpoint.
      const ackSet = new Set<string>();
      await Promise.all(
        wonBids.map(async (b) => {
          try {
            const res = await authed(`/api/rental/requests/${b.request_id}`);
            if (!res.ok) return;
            const data = await res.json();
            const req = data.request;
            if (req && req.status === "awarded" && req.tracking_required && !req.fleet_ack_at) {
              ackSet.add(b.request_id);
            }
          } catch (err) {
            logger.warn("[fleet-marketplace] ack-eligibility fetch failed", err);
          }
        }),
      );
      setAckable(ackSet);
    } catch (err) {
      logger.error("[fleet-marketplace] fetch failed", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fleetId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
  }, [fetchAll]);

  const handleAck = async (requestId: string) => {
    setActing(`ack:${requestId}`);
    try {
      const res = await authed(`/api/rental/requests/${requestId}/fleet-ack`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        Alert.alert("Acknowledged", "Booking confirmed inside the 5-minute SLA.");
        await fetchAll();
      } else {
        Alert.alert("Ack failed", data.message ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      logger.error("[fleet-marketplace] fleet-ack failed", err);
      Alert.alert("Ack failed", "Network error");
    } finally {
      setActing(null);
    }
  };

  const handleAmbulanceAccept = async (requestId: string) => {
    setActing(`amb:${requestId}`);
    try {
      const res = await authed(`/api/emergency/requests/${requestId}/accept`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        Alert.alert("Assigned", "Emergency request assigned to your certified unit.");
        await fetchAll();
      } else {
        Alert.alert("Accept failed", data.message ?? "A verified ambulance certification is required.");
      }
    } catch (err) {
      logger.error("[fleet-marketplace] ambulance accept failed", err);
      Alert.alert("Accept failed", "Network error");
    } finally {
      setActing(null);
    }
  };

  const sectionTitle = (t: string) => (
    <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 16, color: textPrimary, marginTop: 20, marginBottom: 10 }}>{t}</Text>
  );

  return (
    <FleetScreen title="Marketplace" onRefresh={onRefresh} refreshing={refreshing}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontFamily: "Jakarta-Medium", fontSize: 14, color: textSecondary, marginTop: 12 }}>Loading marketplace...</Text>
          </View>
        ) : (
          <>
            {sectionTitle("Rental requests")}
            {feed.length === 0 ? (
              <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: textSecondary }}>No open requests right now.</Text>
            ) : (
              feed.map((req) => (
                <View key={req.id} style={{ backgroundColor: surfaceBg, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                    <Ionicons name="cube" size={16} color={colors.primary} />
                    <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 13, color: textPrimary, marginLeft: 6, flex: 1 }}>{req.category}</Text>
                    {req.already_bid ? (
                      <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 11, color: colors.success }}>BIDDED</Text>
                    ) : null}
                  </View>
                  <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary }} numberOfLines={2}>
                    {req.pickup_address} → {req.dropoff_address}
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: "/(main)/(customer)/(rental-bidder)/bid-submit", params: { requestId: req.id, category: req.category } })}
                    style={{ backgroundColor: req.already_bid ? "transparent" : colors.primary, borderWidth: req.already_bid ? 1 : 0, borderColor: colors.primary, borderRadius: 10, height: 42, alignItems: "center", justifyContent: "center", marginTop: 10 }}
                   
                   testID="fleet.marketplace.el-1">
                    <Text style={{ color: req.already_bid ? colors.primary : "#FFFFFF", fontSize: 14, fontFamily: "Jakarta-SemiBold" }}>
                      {req.already_bid ? "Update bid" : "Submit bid"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <TouchableOpacity
              onPress={() => router.push("/(main)/(customer)/(rental-bidder)")}
              style={{ alignItems: "center", paddingVertical: 8 }}
             
             testID="fleet.marketplace.push-rental-bidder">
              <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 13, color: colors.primary }}>View all requests</Text>
            </TouchableOpacity>

            {sectionTitle(`My bids (${bids.length})`)}
            {bids.length === 0 ? (
              <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: textSecondary }}>No active bids.</Text>
            ) : (
              bids.map((bid) => (
                <View key={bid.id} style={{ backgroundColor: surfaceBg, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: textPrimary, flex: 1 }}>{formatBDT(bid.quoted_price_bdt)}</Text>
                    <View style={{ backgroundColor: `${BID_COLORS[bid.status] ?? colors.primary}18`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 11, color: BID_COLORS[bid.status] ?? colors.primary }}>{bid.status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary, marginTop: 4 }}>{bid.vehicle_type}</Text>
                  {ackable.has(bid.request_id) ? (
                    <TouchableOpacity
                      onPress={() => handleAck(bid.request_id)}
                      disabled={acting === `ack:${bid.request_id}`}
                      style={{ backgroundColor: colors.success, borderRadius: 10, height: 42, alignItems: "center", justifyContent: "center", marginTop: 10, opacity: acting === `ack:${bid.request_id}` ? 0.6 : 1 }}
                     
                     testID="fleet.marketplace.handle-ack">
                      <Text style={{ color: "#FFFFFF", fontSize: 14, fontFamily: "Jakarta-SemiBold" }}>
                        {acting === `ack:${bid.request_id}` ? "Confirming..." : "Acknowledge booking (5-min SLA)"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))
            )}

            {sectionTitle(`Ambulance (${ambulance.length})`)}
            {ambulance.length === 0 ? (
              <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: textSecondary }}>
                No open emergency requests. Acceptance needs a verified ambulance certification.
              </Text>
            ) : (
              ambulance.map((req) => (
                <View key={req.id} style={{ backgroundColor: surfaceBg, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.danger }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                    <Ionicons name="medical" size={16} color={colors.danger} />
                    <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 13, color: textPrimary, marginLeft: 6, flex: 1 }}>
                      {req.service_level ?? "BLS"} · {req.pickup_address}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary }} numberOfLines={2}>{req.patient_condition}</Text>
                  <TouchableOpacity
                    onPress={() => handleAmbulanceAccept(req.id)}
                    disabled={acting === `amb:${req.id}`}
                    style={{ backgroundColor: colors.danger, borderRadius: 10, height: 42, alignItems: "center", justifyContent: "center", marginTop: 10, opacity: acting === `amb:${req.id}` ? 0.6 : 1 }}
                   
                   testID="fleet.marketplace.handle-ambulance-accept">
                    <Text style={{ color: "#FFFFFF", fontSize: 14, fontFamily: "Jakarta-SemiBold" }}>
                      {acting === `amb:${req.id}` ? "Accepting..." : "Accept emergency"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </FleetScreen>
  );
}
