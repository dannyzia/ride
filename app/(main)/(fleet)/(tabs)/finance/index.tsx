/**
 * F12 — Fleet Finance overview.
 * Revenue, commission, driver payout by period. Link to F09 Trips.
 * Fetches from GET /api/fleet/finance?fleet_id=...
 * Pattern A theming.
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useFleetStore } from "@/store/useFleetStore";
import FleetScreen from "@/components/fleet/FleetScreen";
import FleetTabBar from "@/components/fleet/FleetTabBar";
import { getAuthHeaders } from "@/lib/fleetAuth";
import { logger } from "@/lib/logger";

interface PeriodData {
  trip_count: number; gross_fare_bdt: number; platform_commission_bdt: number;
  driver_payout_bdt: number; fleet_revenue_bdt: number; avg_fare_bdt: number;
  cancelled_count: number; total_distance_km: number;
}
interface FinanceData { today: PeriodData; this_week: PeriodData; this_month: PeriodData; all_time: PeriodData; }

function formatPaisa(p: number): string { return `৳${(p / 100).toLocaleString("en-BD")}`; }
function formatKm(km: number): string { return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)} km`; }

function PeriodCard({ period, data, isDark }: { period: string; data: PeriodData; isDark: boolean }) {
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const Row = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
      <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: textSecondary }}>{label}</Text>
      <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 13, color: color ?? textPrimary }}>{value}</Text>
    </View>
  );
  return (
    <View style={{ backgroundColor: surfaceBg, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor }}>
      <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 16, color: textPrimary, marginBottom: 12 }}>{period}</Text>
      <Row label="Completed Trips" value={`${data.trip_count}`} />
      {data.cancelled_count > 0 && <Row label="Cancelled" value={`${data.cancelled_count}`} color={colors.amber} />}
      <Row label="Total Distance" value={formatKm(data.total_distance_km)} />
      <View style={{ borderTopWidth: 1, borderTopColor: borderColor, marginTop: 8, paddingTop: 8 }}>
        <Row label="Gross Fare" value={formatPaisa(data.gross_fare_bdt)} />
        <Row label="Platform Commission" value={`-${formatPaisa(data.platform_commission_bdt)}`} color={colors.danger} />
        <Row label="Driver Payout" value={formatPaisa(data.driver_payout_bdt)} />
        {data.avg_fare_bdt > 0 && <Row label="Avg Fare/Trip" value={formatPaisa(data.avg_fare_bdt)} />}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: borderColor, marginTop: 8, paddingTop: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 14, color: textPrimary }}>Fleet Revenue</Text>
          <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 14, color: colors.primary }}>{formatPaisa(data.fleet_revenue_bdt)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function FleetFinance() {
  const isDark = useIsDark();
  const router = useRouter();
  const fleetId = useFleetStore((s) => s.activeFleetId);
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!fleetId) return;
    try {
      setLoading(true);
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`http://localhost:3000/api/fleet/finance?fleet_id=${fleetId}`, { headers: authHeaders ?? {} });
      if (res.ok) setFinance(await res.json());
    } catch (err) { logger.error("[fleet-finance] fetch failed", err); }
    finally { setLoading(false); }
  }, [fleetId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <FleetScreen title="Finance" subtitle="Revenue & commission overview" onRefresh={fetchData} refreshing={loading}>
      <View style={{ backgroundColor: colors.primary, borderRadius: 16, padding: 20, marginBottom: 20, alignItems: "center" }}>
        <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: "rgba(255,255,255,0.8)" }}>This Month</Text>
        <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 32, color: colors.white, marginTop: 4 }}>
          {finance ? formatPaisa(finance.this_month.fleet_revenue_bdt) : "৳0"}
        </Text>
        <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>Fleet Revenue</Text>
        {finance && (
          <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
            <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{finance.this_month.trip_count} trips</Text>
            <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{formatKm(finance.this_month.total_distance_km)}</Text>
          </View>
        )}
      </View>

      {finance ? (
        <>
          <PeriodCard period="Today" data={finance.today} isDark={isDark} />
          <PeriodCard period="This Week" data={finance.this_week} isDark={isDark} />
          <PeriodCard period="This Month" data={finance.this_month} isDark={isDark} />
          <PeriodCard period="All Time" data={finance.all_time} isDark={isDark} />
        </>
      ) : (
        <View style={{ alignItems: "center", paddingTop: 40 }}>
          <Text style={{ fontFamily: "Jakarta-Medium", fontSize: 14, color: textSecondary }}>No finance data available</Text>
        </View>
      )}

      <TouchableOpacity onPress={() => router.push("/(main)/(fleet)/(tabs)/finance/trips")} style={{
        backgroundColor: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
        borderRadius: 12, padding: 16, borderWidth: 1,
        borderColor: isDark ? colors.borderDark : colors.borderLight,
        alignItems: "center", marginTop: 8,
      }}>
        <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 15, color: colors.primary }}>View All Trips</Text>
      </TouchableOpacity>

      <FleetTabBar />
    </FleetScreen>
  );
}
