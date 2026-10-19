/**
 * More Menu — secondary fleet functions.
 * Alerts, Subscription, Settings, mode switching.
 * Pattern A theming.
 */
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useFleetStore } from "@/store/useFleetStore";
import FleetScreen from "@/components/fleet/FleetScreen";
import FleetTabBar from "@/components/fleet/FleetTabBar";
import { getAuthHeaders } from "@/lib/fleetAuth";
import { logger } from "@/lib/logger";

function MenuItem({ icon, label, onPress, isDark, danger }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; isDark: boolean; danger?: boolean;
}) {
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{
      flexDirection: "row", alignItems: "center", backgroundColor: surfaceBg,
      borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor,
    }} testID="fleet.more.on-press">
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.primary} />
      <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: danger ? colors.danger : textPrimary, marginLeft: 12, flex: 1 }}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={isDark ? colors.textDisabledDark : colors.textDisabledLight} />
    </TouchableOpacity>
  );
}

export default function FleetMore() {
  const isDark = useIsDark();
  const router = useRouter();
  const activeFleetRole = useFleetStore((s) => s.activeFleetRole);
  const exitFleet = useFleetStore((s) => s.exitFleet);
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  // C8-4: "Switch to Driver" is role-aware — the account may hold no driver
  // capability at all (pure business-fleet owner). heldRoles comes from the
  // authenticated GET /api/user/roles (the login-as chooser source). While
  // unknown (loading or fetch failure) the button stays visible to preserve
  // the pre-C8-4 behavior; it hides only once we KNOW no active driver
  // role is held. Rider is the universal fallback surface — always shown.
  const [holdsDriver, setHoldsDriver] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        if (!headers) return;
        const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "";
        const res = await fetch(`${serverUrl}/api/user/roles`, { headers });
        if (!res.ok) return;
        const data = await res.json();
        const roles = Array.isArray(data.roles) ? data.roles : [];
        if (active) {
          setHoldsDriver(roles.some((r: { role: string; status: string }) => r.role === "driver" && r.status === "active"));
        }
      } catch (err) {
        logger.warn("[fleet-more] held-roles fetch failed", err);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <FleetScreen title="More" scrollable={false}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={{
          backgroundColor: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
          borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1,
          borderColor: isDark ? colors.borderDark : colors.borderLight,
        }}>
          <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 16, color: textPrimary }}>Fleet Management</Text>
          <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: textSecondary, marginTop: 4 }}>Role: {activeFleetRole ?? "Unknown"}</Text>
        </View>

        <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 13, color: textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Operations</Text>
        <MenuItem icon="storefront" label="Shops" onPress={() => router.push("/(main)/(customer)/(shops)")} isDark={isDark} />
        <MenuItem icon="notifications" label="Alerts" onPress={() => router.push("/(main)/(fleet)/alerts")} isDark={isDark} />
        <MenuItem icon="card" label="Subscription" onPress={() => router.push("/(main)/(fleet)/subscription")} isDark={isDark} />
        {/* C8-4: Maintenance + Integrations were dead buttons (empty onPress,
            screens ship with Stage 1 at the earliest) — removed per the Copy
            Truth rule rather than left tappable-to-nothing. */}

        <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 13, color: textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 16, marginBottom: 8 }}>Switch Mode</Text>
        {holdsDriver === false ? null : (
          <MenuItem icon="bicycle" label="Switch to Driver" onPress={() => { exitFleet("DRIVER"); router.replace("/(main)/(rider)/d"); }} isDark={isDark} />
        )}
        <MenuItem icon="person" label="Switch to Rider" onPress={() => { exitFleet("RIDER"); router.replace("/(main)/(customer)"); }} isDark={isDark} />
      </ScrollView>
      <FleetTabBar />
    </FleetScreen>
  );
}
