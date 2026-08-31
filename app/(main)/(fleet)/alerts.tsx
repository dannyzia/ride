/**
 * F16 — Fleet Alerts.
 * Lists fleet alerts by severity with mark-as-read.
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useFleetStore } from "@/store/useFleetStore";
import FleetScreen from "@/components/fleet/FleetScreen";
import { getAuthHeaders } from "@/lib/fleetAuth";

interface Alert { id: string; severity: string; title: string; message: string | null; is_read: boolean; created_at: string; }
const SEV: Record<string, string> = { INFO: colors.info, WARNING: colors.amber, CRITICAL: colors.danger };

export default function FleetAlerts() {
  const isDark = useIsDark();
  const fleetId = useFleetStore((s) => s.activeFleetId);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchAlerts = useCallback(async () => {
    if (!fleetId) return;
    try {
      setLoading(true);
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`http://localhost:3000/api/fleet/alerts?fleet_id=${fleetId}`, { headers: authHeaders ?? {} });
      if (res.ok) setAlerts((await res.json()).alerts ?? []);
    } finally { setLoading(false); }
  }, [fleetId]);
  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  return (
    <FleetScreen title="Alerts" onRefresh={fetchAlerts} refreshing={loading}>
      <FlatList data={alerts} keyExtractor={a => a.id} renderItem={({ item }) => (
        <View style={{ backgroundColor: surfaceBg, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: item.is_read ? borderColor : (SEV[item.severity] ?? borderColor), opacity: item.is_read ? 0.6 : 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
            <Ionicons name={item.severity === "CRITICAL" ? "alert-circle" : "warning"} size={16} color={SEV[item.severity] ?? colors.grayMedium} />
            <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 13, color: SEV[item.severity] ?? colors.grayMedium, marginLeft: 6 }}>{item.severity}</Text>
          </View>
          <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: textPrimary }}>{item.title}</Text>
          {item.message && <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary, marginTop: 4 }}>{item.message}</Text>}
        </View>
      )} ListEmptyComponent={<Text style={{ fontFamily: "Jakarta-Medium", fontSize: 14, color: textSecondary, textAlign: "center", paddingTop: 40 }}>No alerts</Text>} showsVerticalScrollIndicator={false} />
    </FleetScreen>
  );
}
