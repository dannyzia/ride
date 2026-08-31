/**
 * F08 — Driver ↔ Vehicle Assignment.
 * 3-step flow: select driver → select vehicle → confirm.
 * POST /api/fleet/assignments?fleet_id=...
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useFleetStore } from "@/store/useFleetStore";
import FleetScreen from "@/components/fleet/FleetScreen";
import { getAuthHeaders } from "@/lib/fleetAuth";
import { logger } from "@/lib/logger";

type Step = "select-driver" | "select-vehicle" | "confirm";
interface Item { id: string; name?: string; manufacturer?: string; model?: string; registration_number?: string; vehicle_type?: string; vehicle_reg?: string | null; is_online?: boolean; is_assigned?: boolean; }

export default function AssignScreen() {
  const isDark = useIsDark();
  const router = useRouter();
  const fleetId = useFleetStore((s) => s.activeFleetId);
  const [step, setStep] = useState<Step>("select-driver");
  const [drivers, setDrivers] = useState<Item[]>([]);
  const [vehicles, setVehicles] = useState<Item[]>([]);
  const [selDriver, setSelDriver] = useState<Item | null>(null);
  const [selVehicle, setSelVehicle] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!fleetId) return;
    try {
      setLoading(true);
      const headers = (await getAuthHeaders()) ?? {};
      const [vRes, dRes] = await Promise.all([
        fetch(`http://localhost:3000/api/fleet/vehicles?fleet_id=${fleetId}`, { headers }),
        fetch(`http://localhost:3000/api/fleet/drivers?fleet_id=${fleetId}`, { headers }),
      ]);
      if (vRes.ok) setVehicles((await vRes.json()).vehicles ?? []);
      if (dRes.ok) setDrivers((await dRes.json()).drivers ?? []);
    } catch (err) { logger.error("[assign] fetch failed", err); }
    finally { setLoading(false); }
  }, [fleetId]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAssign = async () => {
    if (!fleetId || !selDriver || !selVehicle) return;
    try {
      setSubmitting(true);
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`http://localhost:3000/api/fleet/assignments?fleet_id=${fleetId}`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(authHeaders ?? {}) },
        body: JSON.stringify({ driver_id: selDriver.id, vehicle_id: selVehicle.id }),
      });
      if (res.ok) router.back();
    } catch (err) { logger.error("[assign] error", err); }
    finally { setSubmitting(false); }
  };

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const steps: Step[] = ["select-driver", "select-vehicle", "confirm"];
  const labels = ["Select Driver", "Select Vehicle", "Confirm"];

  const ItemRow = ({ icon, iconColor, primary, secondary, onPress }: {
    icon: keyof typeof Ionicons.glyphMap; iconColor: string; primary: string; secondary: string; onPress: () => void;
  }) => (
    <TouchableOpacity onPress={onPress} style={{
      backgroundColor: surfaceBg, borderRadius: 12, padding: 14, marginBottom: 8,
      borderWidth: 1, borderColor, flexDirection: "row", alignItems: "center",
    }}>
      <View style={{ width: 40, height: 40, borderRadius: icon === "person" ? 20 : 10, backgroundColor: `${iconColor}20`, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: textPrimary }}>{primary}</Text>
        <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary }}>{secondary}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={textSecondary} />
    </TouchableOpacity>
  );

  return (
    <FleetScreen title="Assign Driver to Vehicle" scrollable={false}>
      <View style={{ flexDirection: "row", marginBottom: 20, gap: 8 }}>
        {steps.map((_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: steps.indexOf(step) >= i ? colors.primary : borderColor }} />)}
      </View>
      <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 14, color: textSecondary, marginBottom: 12 }}>
        Step {steps.indexOf(step) + 1}: {labels[steps.indexOf(step)]}
      </Text>

      {loading ? (
        <View style={{ alignItems: "center", paddingTop: 40 }}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : step === "select-driver" ? (
        <FlatList data={drivers.filter(d => !d.vehicle_reg)} keyExtractor={d => d.id} renderItem={({ item }) => (
          <ItemRow icon="person" iconColor={colors.primary} primary={item.name ?? ""} secondary={`${(item.vehicle_type ?? "").replace(/_/g, " ")} · ${item.is_online ? "Online" : "Offline"}`}
            onPress={() => { setSelDriver(item); setStep("select-vehicle"); }} />
        )} ListEmptyComponent={<Text style={{ fontFamily: "Jakarta-Medium", fontSize: 14, color: textSecondary, textAlign: "center", paddingTop: 40 }}>All drivers are currently assigned</Text>} showsVerticalScrollIndicator={false} />
      ) : step === "select-vehicle" ? (
        <FlatList data={vehicles.filter(v => !v.is_assigned)} keyExtractor={v => v.id} renderItem={({ item }) => (
          <ItemRow icon="car-sport" iconColor={colors.info} primary={`${item.manufacturer} ${item.model}`} secondary={`${item.registration_number} · ${(item.vehicle_type ?? "").replace(/_/g, " ")}`}
            onPress={() => { setSelVehicle(item); setStep("confirm"); }} />
        )} ListEmptyComponent={<Text style={{ fontFamily: "Jakarta-Medium", fontSize: 14, color: textSecondary, textAlign: "center", paddingTop: 40 }}>No unassigned vehicles</Text>} showsVerticalScrollIndicator={false} />
      ) : (
        <View>
          <View style={{ backgroundColor: surfaceBg, borderRadius: 16, padding: 20, borderWidth: 1, borderColor, marginBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
              <Ionicons name="person" size={20} color={colors.primary} />
              <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: textPrimary, marginLeft: 10 }}>{selDriver?.name}</Text>
            </View>
            <View style={{ alignItems: "center", marginVertical: 8 }}><Ionicons name="swap-vertical" size={24} color={colors.primary} /></View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="car-sport" size={20} color={colors.info} />
              <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: textPrimary, marginLeft: 10 }}>{selVehicle?.manufacturer} {selVehicle?.model}</Text>
            </View>
            <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary, marginLeft: 30 }}>{selVehicle?.registration_number}</Text>
          </View>
          <TouchableOpacity onPress={handleAssign} disabled={submitting} style={{
            backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center", flexDirection: "row", justifyContent: "center",
          }}>
            {submitting ? <ActivityIndicator size="small" color={colors.white} /> : (
              <>
                <Ionicons name="checkmark-circle" size={20} color={colors.white} />
                <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 16, color: colors.white, marginLeft: 8 }}>Confirm Assignment</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep("select-vehicle")} style={{ padding: 16, alignItems: "center" }}>
            <Text style={{ fontFamily: "Jakarta-Medium", fontSize: 14, color: textSecondary }}>Back</Text>
          </TouchableOpacity>
        </View>
      )}
    </FleetScreen>
  );
}
