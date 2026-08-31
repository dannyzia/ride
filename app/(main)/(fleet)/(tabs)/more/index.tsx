/**
 * More Menu — secondary fleet functions.
 * Alerts, Subscription, Settings, mode switching.
 * Pattern A theming.
 */
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useFleetStore } from "@/store/useFleetStore";
import FleetScreen from "@/components/fleet/FleetScreen";
import FleetTabBar from "@/components/fleet/FleetTabBar";

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
    }}>
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
        <MenuItem icon="notifications" label="Alerts" onPress={() => router.push("/(main)/(fleet)/alerts")} isDark={isDark} />
        <MenuItem icon="card" label="Subscription" onPress={() => router.push("/(main)/(fleet)/subscription")} isDark={isDark} />
        <MenuItem icon="build" label="Maintenance" onPress={() => {}} isDark={isDark} />
        <MenuItem icon="git-network" label="Integrations" onPress={() => {}} isDark={isDark} />

        <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 13, color: textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 16, marginBottom: 8 }}>Switch Mode</Text>
        <MenuItem icon="bicycle" label="Switch to Driver" onPress={() => { exitFleet("DRIVER"); router.replace("/(main)/(rider)"); }} isDark={isDark} />
        <MenuItem icon="person" label="Switch to Rider" onPress={() => { exitFleet("RIDER"); router.replace("/(main)/(customer)"); }} isDark={isDark} />
      </ScrollView>
      <FleetTabBar />
    </FleetScreen>
  );
}
