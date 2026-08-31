/**
 * F01 — Fleet Dashboard.
 * High-level metrics: vehicles, drivers, today's trips, outstanding alerts.
 * Quick actions: Vehicles, Drivers, Trips, Alerts.
 * Fetches from GET /api/fleet/dashboard?fleet_id=...
 *
 * Pattern A theming: useIsDark() + inline colors.* ternaries.
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useFleetStore } from "@/store/useFleetStore";
import FleetScreen from "@/components/fleet/FleetScreen";
import FleetTabBar from "@/components/fleet/FleetTabBar";
import { getAuthHeaders } from "@/lib/fleetAuth";
import { logger } from "@/lib/logger";

interface DashboardData {
  fleet: { id: string; name: string; status: string };
  vehicles: { total: number; assigned: number };
  drivers: { total: number; online: number };
  today: { trips: number };
  unread_alerts: number;
}

interface IntegrationIssue {
  id: string;
  provider: string;
  status: string;
  last_error: string | null;
  last_error_at: string | null;
}

function MetricCard({
  label, value, icon, accentColor, isDark,
}: {
  label: string; value: string | number;
  icon: keyof typeof Ionicons.glyphMap; accentColor: string; isDark: boolean;
}) {
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  return (
    <View style={{
      flex: 1, minWidth: "45%", backgroundColor: surfaceBg, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: isDark ? colors.borderDark : colors.borderLight,
    }}>
      <View style={{
        width: 36, height: 36, borderRadius: 10, backgroundColor: `${accentColor}20`,
        alignItems: "center", justifyContent: "center", marginBottom: 10,
      }}>
        <Ionicons name={icon} size={18} color={accentColor} />
      </View>
      <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 24, color: textPrimary }}>{value}</Text>
      <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function QuickAction({
  label, icon, onPress, isDark,
}: {
  label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; isDark: boolean;
}) {
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{
      flexDirection: "row", alignItems: "center", backgroundColor: surfaceBg,
      borderRadius: 12, padding: 14, borderWidth: 1, borderColor,
    }}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: textPrimary, marginLeft: 10, flex: 1 }}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={isDark ? colors.textDisabledDark : colors.textDisabledLight} />
    </TouchableOpacity>
  );
}

export default function FleetDashboard() {
  const isDark = useIsDark();
  const router = useRouter();
  const fleetId = useFleetStore((s) => s.activeFleetId);
  const [data, setData] = useState<DashboardData | null>(null);
  const [integrationIssues, setIntegrationIssues] = useState<IntegrationIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!fleetId) return;
    try {
      setLoading(true); setError(null);
      const authHeaders = await getAuthHeaders();
      const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "";
      const res = await fetch(
        `${serverUrl}/api/fleet/dashboard?fleet_id=${fleetId}`,
        { headers: authHeaders ?? {} },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      // Fetch integration issues via API (server-side function not importable in client bundle)
      try {
        const intRes = await fetch(
          `${serverUrl}/api/fleet/integrations?fleet_id=${fleetId}`,
          { headers: authHeaders ?? {} },
        );
        if (intRes.ok) {
          const intData = await intRes.json();
          const issues: IntegrationIssue[] = (intData.integrations ?? []).filter(
            (i: IntegrationIssue) => i.status === "error",
          );
          setIntegrationIssues(issues);
        }
      } catch (intErr) {
        logger.warn("[fleet-dashboard] integration issues fetch failed", intErr);
      }
    } catch (err) {
      logger.error("[fleet-dashboard] fetch failed", err);
      setError("Could not load dashboard");
    } finally { setLoading(false); }
  }, [fleetId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <FleetScreen title="Fleet Dashboard" subtitle={data?.fleet?.name} onRefresh={fetchData} refreshing={loading && !data}>
      {loading && !data ? (
        <View style={{ alignItems: "center", paddingTop: 60 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ fontFamily: "Jakarta-Medium", fontSize: 14, color: textSecondary, marginTop: 12 }}>Loading fleet data...</Text>
        </View>
      ) : error ? (
        <View style={{ alignItems: "center", paddingTop: 60 }}>
          <Ionicons name="cloud-offline" size={48} color={colors.danger} />
          <Text style={{ fontFamily: "Jakarta-Medium", fontSize: 16, color: textPrimary, marginTop: 12 }}>{error}</Text>
          <TouchableOpacity onPress={fetchData} style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 }}>
            <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: colors.white }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <MetricCard label="Total Vehicles" value={data.vehicles.total} icon="car-sport" accentColor={colors.primary} isDark={isDark} />
            <MetricCard label="Assigned" value={data.vehicles.assigned} icon="link" accentColor={colors.info} isDark={isDark} />
            <MetricCard label="Drivers Online" value={`${data.drivers.online}/${data.drivers.total}`} icon="people" accentColor={colors.success} isDark={isDark} />
            <MetricCard label="Today's Trips" value={data.today.trips} icon="map" accentColor={colors.amber} isDark={isDark} />
          </View>

          {data.unread_alerts > 0 && (
            <TouchableOpacity onPress={() => router.push("/(main)/(fleet)/(tabs)/more")} style={{
              flexDirection: "row", alignItems: "center",
              backgroundColor: isDark ? "#3A2A1A" : colors.amberLight,
              borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.amber,
            }}>
              <Ionicons name="warning" size={20} color={colors.amber} />
              <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: textPrimary, marginLeft: 10, flex: 1 }}>
                {data.unread_alerts} outstanding alert{data.unread_alerts > 1 ? "s" : ""}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.amber} />
            </TouchableOpacity>
          )}

          {integrationIssues.length > 0 && (
            <TouchableOpacity onPress={() => router.push("/(main)/(fleet)/integrations")} style={{
              flexDirection: "row", alignItems: "center",
              backgroundColor: isDark ? "#3A1A1A" : "#FEF2F2",
              borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: colors.danger,
            }}>
              <Ionicons name="cloud-offline" size={20} color={colors.danger} />
              <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: textPrimary, marginLeft: 10, flex: 1 }}>
                {integrationIssues.length} integration{integrationIssues.length > 1 ? "s" : ""} need{integrationIssues.length === 1 ? "s" : ""} attention
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.danger} />
            </TouchableOpacity>
          )}

          <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 16, color: textPrimary, marginBottom: 12 }}>Quick Actions</Text>
          <View style={{ gap: 10 }}>
            <QuickAction label="Vehicles" icon="car-sport" onPress={() => router.push("/(main)/(fleet)/(tabs)/operations")} isDark={isDark} />
            <QuickAction label="Drivers" icon="people" onPress={() => router.push("/(main)/(fleet)/(tabs)/operations")} isDark={isDark} />
            <QuickAction label="Trips" icon="map" onPress={() => router.push("/(main)/(fleet)/(tabs)/finance/trips")} isDark={isDark} />
            <QuickAction label="Alerts" icon="notifications" onPress={() => router.push("/(main)/(fleet)/(tabs)/more")} isDark={isDark} />
          </View>
        </>
      ) : null}
      <FleetTabBar />
    </FleetScreen>
  );
}
