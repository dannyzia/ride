/**
 * F10 — Trip Detail.
 * Full trip: route, timestamps, fare breakdown, rider/driver info.
 * Reads from GET /api/fleet/trips/[id]?fleet_id=...
 * Pattern A theming.
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import FleetScreen from "@/components/fleet/FleetScreen";
import { getAuthHeaders } from "@/lib/fleetAuth";

function formatPaisa(paisa: number | null | undefined): string {
  if (paisa == null) return "N/A";
  return `৳${(paisa / 100).toLocaleString("en-BD")}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  return new Date(iso).toLocaleString("en-BD", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function statusColor(status: string): string {
  switch (status) {
    case "completed": return colors.success;
    case "cancelled": return colors.danger;
    case "in_progress": return colors.primary;
    default: return colors.amber;
  }
}

function DetailRow({ label, value, textPrimary, textSecondary, bold, accent }: {
  label: string; value: string; textPrimary: string; textSecondary: string; bold?: boolean; accent?: string;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
      <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: textSecondary }}>{label}</Text>
      <Text style={{
        fontFamily: bold ? "Jakarta-Bold" : "Jakarta-SemiBold", fontSize: bold ? 15 : 13,
        color: accent ?? textPrimary, textAlign: "right", maxWidth: "60%",
      }}>{value}</Text>
    </View>
  );
}

function Section({ title, children, surfaceBg, borderColor }: {
  title: string; children: React.ReactNode; surfaceBg: string; borderColor: string;
}) {
  return (
    <View style={{ backgroundColor: surfaceBg, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor }}>
      <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 15, color: "#1C1E23", marginBottom: 12 }}>{title}</Text>
      {children}
    </View>
  );
}

interface TripDetail {
  status?: string; rider_name?: string; driver_name?: string; vehicle_type?: string;
  origin_address?: string; destination_address?: string; distance_km?: string;
  rider_payable_bdt?: number; driver_fare_bdt?: number; platform_commission_bdt?: number;
  tip_bdt?: number; wait_fee_bdt?: number; cancellation_fee_bdt?: number;
  promo_code?: string; promo_discount_bdt?: number;
  created_at?: string; completed_at?: string; started_at?: string; matched_at?: string; arrived_at?: string;
}

export default function TripDetail() {
  const { id, fleet_id } = useLocalSearchParams<{ id: string; fleet_id: string }>();
  const isDark = useIsDark();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrip = useCallback(async () => {
    if (!id || !fleet_id) return;
    try {
      setLoading(true);
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`http://localhost:3000/api/fleet/trips/${id}?fleet_id=${fleet_id}`, { headers: authHeaders ?? {} });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTrip(data.trip);
    } catch { setError("Could not load trip"); }
    finally { setLoading(false); }
  }, [id, fleet_id]);

  useEffect(() => { fetchTrip(); }, [fetchTrip]);

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const t = trip;
  const fleetRevenue = (t?.rider_payable_bdt ?? 0) - (t?.platform_commission_bdt ?? 0);

  return (
    <FleetScreen title="Trip Detail">
      {loading ? (
        <View style={{ alignItems: "center", paddingTop: 60 }}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error || !t ? (
        <View style={{ alignItems: "center", paddingTop: 60 }}>
          <Ionicons name="alert-circle" size={48} color={colors.danger} />
          <Text style={{ fontFamily: "Jakarta-Medium", fontSize: 16, color: textPrimary, marginTop: 12 }}>{error ?? "Trip not found"}</Text>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: `${statusColor(t.status ?? "")}20` }}>
              <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 14, color: statusColor(t.status ?? ""), textTransform: "capitalize" }}>
                {(t.status ?? "").replace(/_/g, " ")}
              </Text>
            </View>
          </View>

          <Section title="Route" surfaceBg={surfaceBg} borderColor={borderColor}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 8 }}>
              <Ionicons name="ellipse" size={10} color={colors.primary} style={{ marginTop: 3, marginRight: 8 }} />
              <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: textPrimary, flex: 1 }}>{t.origin_address ?? "N/A"}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <Ionicons name="location" size={10} color={colors.danger} style={{ marginTop: 3, marginRight: 8 }} />
              <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: textPrimary, flex: 1 }}>{t.destination_address ?? "N/A"}</Text>
            </View>
            {t.distance_km && <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary, marginTop: 8 }}>Distance: {Number(t.distance_km).toFixed(1)} km</Text>}
          </Section>

          <Section title="People" surfaceBg={surfaceBg} borderColor={borderColor}>
            <DetailRow label="Rider" value={t.rider_name ?? "N/A"} textPrimary={textPrimary} textSecondary={textSecondary} />
            <DetailRow label="Driver" value={t.driver_name ?? "N/A"} textPrimary={textPrimary} textSecondary={textSecondary} />
            <DetailRow label="Vehicle" value={(t.vehicle_type ?? "N/A").replace(/_/g, " ")} textPrimary={textPrimary} textSecondary={textSecondary} />
          </Section>

          <Section title="Fare Breakdown" surfaceBg={surfaceBg} borderColor={borderColor}>
            <DetailRow label="Rider Paid" value={formatPaisa(t.rider_payable_bdt)} textPrimary={textPrimary} textSecondary={textSecondary} bold />
            <DetailRow label="Driver Payout" value={formatPaisa(t.driver_fare_bdt)} textPrimary={textPrimary} textSecondary={textSecondary} />
            <DetailRow label="Platform Commission" value={formatPaisa(t.platform_commission_bdt)} textPrimary={textPrimary} textSecondary={textSecondary} />
            {t.tip_bdt && t.tip_bdt > 0 && <DetailRow label="Tip" value={formatPaisa(t.tip_bdt)} textPrimary={textPrimary} textSecondary={textSecondary} accent={colors.primary} />}
            {t.wait_fee_bdt && t.wait_fee_bdt > 0 && <DetailRow label="Wait Fee" value={formatPaisa(t.wait_fee_bdt)} textPrimary={textPrimary} textSecondary={textSecondary} />}
            {t.promo_code && <DetailRow label={`Promo (${t.promo_code})`} value={`-${formatPaisa(t.promo_discount_bdt)}`} textPrimary={textPrimary} textSecondary={textSecondary} accent={colors.amber} />}
            <View style={{ borderTopWidth: 1, borderTopColor: borderColor, paddingTop: 8, marginTop: 4 }}>
              <DetailRow label="Fleet Revenue" value={formatPaisa(fleetRevenue)} textPrimary={textPrimary} textSecondary={textSecondary} bold accent={colors.primary} />
            </View>
          </Section>

          <Section title="Timeline" surfaceBg={surfaceBg} borderColor={borderColor}>
            <DetailRow label="Requested" value={formatDateTime(t.created_at)} textPrimary={textPrimary} textSecondary={textSecondary} />
            <DetailRow label="Matched" value={formatDateTime(t.matched_at)} textPrimary={textPrimary} textSecondary={textSecondary} />
            <DetailRow label="Arrived" value={formatDateTime(t.arrived_at)} textPrimary={textPrimary} textSecondary={textSecondary} />
            <DetailRow label="Started" value={formatDateTime(t.started_at)} textPrimary={textPrimary} textSecondary={textSecondary} />
            <DetailRow label="Completed" value={formatDateTime(t.completed_at)} textPrimary={textPrimary} textSecondary={textSecondary} />
          </Section>
        </>
      )}
    </FleetScreen>
  );
}
