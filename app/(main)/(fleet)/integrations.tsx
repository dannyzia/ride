/**
 * F01b — Fleet Integrations.
 * Read-only status of the fleet's connected dispatch platforms: provider,
 * connection state, last sync, and the last error when one is failing.
 *
 * Exists because the dashboard's "N integrations need attention" banner has
 * always pushed to /integrations (fleet.dashboard.push-integrations) while no
 * such screen existed — the nav-integrity audit reported it as DANGLING.
 * Fetches GET /api/fleet/integrations?fleet_id=... (fleet-member gated).
 *
 * Pattern A theming: useIsDark() + inline colors.* ternaries (matches alerts.tsx).
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useFleetStore } from "@/store/useFleetStore";
import FleetScreen from "@/components/fleet/FleetScreen";
import { getAuthHeaders } from "@/lib/fleetAuth";
import { logger } from "@/lib/logger";

interface Integration {
  id: string;
  provider: string;
  status: string;
  capabilities: unknown;
  last_sync_at: string | null;
  last_sync_entity: string | null;
  last_error: string | null;
  last_error_at: string | null;
  created_at: string;
}

const PROVIDER_LABEL: Record<string, string> = {
  uber: "Uber",
  indrive: "inDrive",
  pathao: "Pathao",
  obaih: "OBaih",
  custom: "Custom platform",
  mock_platform: "Mock platform (test)",
};

/** Status → colour + icon. `error` is the only state the dashboard escalates. */
function statusStyle(status: string, isDark: boolean) {
  switch (status) {
    case "connected":
      return { color: colors.success, icon: "checkmark-circle" as const, label: "Connected" };
    case "error":
      return { color: colors.danger, icon: "alert-circle" as const, label: "Needs attention" };
    case "disabled":
      return {
        color: isDark ? colors.textDisabledDark : colors.textDisabledLight,
        icon: "pause-circle" as const,
        label: "Disabled",
      };
    default:
      return { color: colors.grayMedium, icon: "help-circle" as const, label: status };
  }
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

function capabilityList(capabilities: unknown): string[] {
  if (Array.isArray(capabilities)) return capabilities.filter((c): c is string => typeof c === "string");
  if (capabilities && typeof capabilities === "object") return Object.keys(capabilities);
  return [];
}

export default function FleetIntegrations() {
  const isDark = useIsDark();
  const fleetId = useFleetStore((s) => s.activeFleetId);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIntegrations = useCallback(async () => {
    if (!fleetId) return;
    try {
      setLoading(true);
      setError(null);
      const authHeaders = await getAuthHeaders();
      const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "";
      const res = await fetch(`${serverUrl}/api/fleet/integrations?fleet_id=${fleetId}`, {
        headers: authHeaders ?? {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setIntegrations(body.integrations ?? []);
    } catch (err) {
      logger.warn("[fleet-integrations] fetch failed", err);
      setError("Could not load integrations");
    } finally {
      setLoading(false);
    }
  }, [fleetId]);

  useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  return (
    <FleetScreen
      title="Integrations"
      subtitle="Connected dispatch platforms"
      onRefresh={fetchIntegrations}
      refreshing={loading}
    >
      {error ? (
        <Text
          testID="fleet.integrations.error"
          style={{ fontFamily: "Jakarta-Medium", fontSize: 14, color: colors.danger, paddingTop: 24 }}
        >
          {error}
        </Text>
      ) : null}
      <FlatList
        testID="fleet.integrations.list"
        data={integrations}
        keyExtractor={(i) => i.id}
        scrollEnabled={false}
        renderItem={({ item }) => {
          const st = statusStyle(item.status, isDark);
          const caps = capabilityList(item.capabilities);
          const lastSync = formatWhen(item.last_sync_at);
          return (
            <View
              testID="fleet.integrations.row"
              style={{
                backgroundColor: surfaceBg,
                borderRadius: 12,
                padding: 14,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: item.status === "error" ? colors.danger : borderColor,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name={st.icon} size={16} color={st.color} />
                <Text
                  testID="fleet.integrations.row-provider"
                  style={{ fontFamily: "Jakarta-Bold", fontSize: 14, color: textPrimary, marginLeft: 8, flex: 1 }}
                >
                  {PROVIDER_LABEL[item.provider] ?? item.provider}
                </Text>
                <Text
                  testID="fleet.integrations.row-status"
                  style={{ fontFamily: "Jakarta-SemiBold", fontSize: 12, color: st.color }}
                >
                  {st.label}
                </Text>
              </View>

              {caps.length > 0 && (
                <Text
                  testID="fleet.integrations.row-capabilities"
                  style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary, marginTop: 6 }}
                >
                  {caps.join(" · ")}
                </Text>
              )}

              <Text
                testID="fleet.integrations.row-last-sync"
                style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary, marginTop: 6 }}
              >
                {lastSync
                  ? `Last sync: ${item.last_sync_entity ?? "—"} · ${lastSync}`
                  : "Never synced"}
              </Text>

              {item.last_error && (
                <Text
                  testID="fleet.integrations.row-last-error"
                  style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: colors.danger, marginTop: 6 }}
                >
                  {item.last_error}
                  {formatWhen(item.last_error_at) ? ` (${formatWhen(item.last_error_at)})` : ""}
                </Text>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View testID="fleet.integrations.empty" style={{ alignItems: "center", paddingTop: 40 }}>
              <Ionicons name="cloud-offline" size={40} color={isDark ? colors.textDisabledDark : colors.textDisabledLight} />
              <Text
                testID="fleet.integrations.empty-body"
                style={{ fontFamily: "Jakarta-Medium", fontSize: 14, color: textSecondary, textAlign: "center", paddingTop: 12 }}
              >
                No integrations connected
              </Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
    </FleetScreen>
  );
}
