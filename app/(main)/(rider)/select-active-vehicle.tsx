import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useDriverStore } from "@/store/useDriverStore";
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";

interface Vehicle {
  id: string;
  vehicle_model: string;
  registration_plate: string;
  vehicle_type: string;
  is_active: boolean;
}

const vehicleTypeDisplay: Record<string, string> = Object.fromEntries(
  VEHICLE_TYPES.map((v) => [v.key, v.display_en]),
);

export default function SelectActiveVehicle() {
  const { driver, setDriver } = useDriverStore();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Online confirmation modal
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingVehicle, setPendingVehicle] = useState<Vehicle | null>(null);

  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const isOnline = driver?.is_online ?? false;

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not authenticated");
        return;
      }
      const res = await fetch(`${API_URL}/api/driver/vehicles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError("Failed to load vehicles");
        return;
      }
      const data = await res.json();
      const list: Vehicle[] = data.vehicles ?? [];
      setVehicles(list);
      // Pre-select the currently active vehicle
      const active = list.find((v) => v.is_active);
      if (active) setSelectedId(active.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("SelectActiveVehicle fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  const handleActivate = useCallback(
    async (vehicle: Vehicle) => {
      setSaving(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        // If the vehicle type is different from current, use vehicle-type-change
        // which handles type sync + eligibility. Otherwise use vehicle-activate.
        const isTypeChange =
          driver?.vehicle_type && vehicle.vehicle_type !== driver.vehicle_type;

        if (isTypeChange) {
          const res = await fetch(`${API_URL}/api/driver/vehicle-type-change`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              new_vehicle_type: vehicle.vehicle_type,
              confirm_online_switch: isOnline,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            if (data.error === "online_switch_requires_confirmation") {
              // Server wants confirmation — show modal
              setPendingVehicle(vehicle);
              setConfirmModalVisible(true);
              setSaving(false);
              return;
            }
            Alert.alert("Error", data.message || "Could not switch vehicle type");
            setSaving(false);
            return;
          }
        } else {
          // Same type — use vehicle-activate to set the active vehicle
          const res = await fetch(`${API_URL}/api/driver/vehicle-activate`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ vehicle_id: vehicle.id }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            Alert.alert("Error", data.message || "Could not activate vehicle");
            setSaving(false);
            return;
          }
        }

        // Update store and navigate back
        if (driver) {
          setDriver({
            ...driver,
            vehicle_type: vehicle.vehicle_type as typeof driver.vehicle_type,
          });
        }
        setSelectedId(vehicle.id);
        Alert.alert("Vehicle Activated", "Your active vehicle has been updated.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } catch (err) {
        Alert.alert("Error", "Network error. Please try again.");
        logger.error("SelectActiveVehicle activate failed", err);
      } finally {
        setSaving(false);
        setConfirmModalVisible(false);
        setPendingVehicle(null);
      }
    },
    [driver, setDriver, isOnline],
  );

  const handleConfirmOnlineSwitch = useCallback(() => {
    if (pendingVehicle) {
      setConfirmModalVisible(false);
      // Re-invoke with confirm_online_switch via vehicle-type-change directly
      (async () => {
        setSaving(true);
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) return;
          const res = await fetch(`${API_URL}/api/driver/vehicle-type-change`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              new_vehicle_type: pendingVehicle.vehicle_type,
              confirm_online_switch: true,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            Alert.alert("Error", data.message || "Could not switch vehicle type");
            return;
          }
          if (driver) {
            setDriver({
              ...driver,
              vehicle_type: pendingVehicle.vehicle_type as typeof driver.vehicle_type,
            });
          }
          setSelectedId(pendingVehicle.id);
          Alert.alert("Vehicle Activated", "Your active vehicle has been updated.", [
            { text: "OK", onPress: () => router.back() },
          ]);
        } catch {
          Alert.alert("Error", "Network error");
        } finally {
          setSaving(false);
          setPendingVehicle(null);
        }
      })();
    }
  }, [pendingVehicle, driver, setDriver]);

  const requestSelection = useCallback(
    (vehicle: Vehicle) => {
      if (vehicle.is_active) return;
      setSelectedId(vehicle.id);

      // If switching to a different type while online, confirm first
      const isTypeChange =
        driver?.vehicle_type && vehicle.vehicle_type !== driver.vehicle_type;
      if (isTypeChange && isOnline) {
        setPendingVehicle(vehicle);
        setConfirmModalVisible(true);
        return;
      }

      handleActivate(vehicle);
    },
    [driver, isOnline, handleActivate],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      {/* Header */}
      <View
        className="flex-row items-center px-[24px] py-[16px] border-b"
        style={{ borderBottomColor: borderColor }}
      >
        <TouchableOpacity onPress={() => router.back()} className="mr-[12px] p-[4px]">
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          className="flex-1 text-center text-[18px] font-JakartaBold"
          style={{ color: textPrimary }}
        >
          Select Active Vehicle
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        className="flex-1 px-[24px]"
        contentContainerStyle={{ paddingVertical: 16, gap: 10 }}
      >
        {loading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginTop: 40 }}
          />
        ) : error ? (
          <View className="items-center py-[40px]">
            <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
            <Text
              className="text-[14px] font-Jakarta mt-3 text-center"
              style={{ color: colors.danger }}
            >
              {error}
            </Text>
            <TouchableOpacity onPress={fetchVehicles} className="mt-3">
              <Text
                className="text-[14px] font-JakartaBold"
                style={{ color: colors.primary }}
              >
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        ) : vehicles.length === 0 ? (
          <View className="items-center py-[40px]">
            <Ionicons name="car-outline" size={48} color={textSecondary} />
            <Text
              className="text-[15px] font-Jakarta mt-3 text-center"
              style={{ color: textSecondary }}
            >
              No vehicles registered.
            </Text>
            <TouchableOpacity
              className="mt-4 rounded-full px-[20px] py-[10px]"
              style={{ backgroundColor: colors.primary }}
              onPress={() => router.push("/(main)/(rider)/add-vehicle")}
            >
              <Text className="text-[14px] font-JakartaBold text-white">
                Add Vehicle
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          vehicles.map((v) => {
            const isSelected = selectedId === v.id;
            const isTypeSwitch =
              driver?.vehicle_type && v.vehicle_type !== driver.vehicle_type;

            return (
              <TouchableOpacity
                key={v.id}
                className="flex-row items-center p-[14px] rounded-[12px]"
                style={{
                  backgroundColor: isSelected
                    ? isDark
                      ? "rgba(12, 194, 95, 0.08)"
                      : colors.primaryLight
                    : surfaceBg,
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? colors.primary : borderColor,
                  opacity: saving ? 0.6 : 1,
                }}
                onPress={() => requestSelection(v)}
                disabled={saving || v.is_active}
              >
                {/* Radio circle */}
                <View
                  className="w-5 h-5 rounded-full border-2 mr-3 items-center justify-center"
                  style={{
                    borderColor: isSelected ? colors.primary : borderColor,
                  }}
                >
                  {isSelected && (
                    <View
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: colors.primary }}
                    />
                  )}
                </View>

                {/* Vehicle info */}
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text
                      className="text-[15px] font-JakartaBold"
                      style={{ color: textPrimary }}
                    >
                      {v.vehicle_model}
                    </Text>
                    {v.is_active && (
                      <View
                        className="rounded-full px-[6px] py-[1px]"
                        style={{
                          backgroundColor: isDark
                            ? colors.primaryLightDark
                            : colors.primaryLight,
                        }}
                      >
                        <Text
                          className="text-[10px] font-JakartaBold"
                          style={{ color: colors.primary }}
                        >
                          ACTIVE
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    className="text-[13px] font-Jakarta mt-0.5"
                    style={{ color: textSecondary }}
                  >
                    {v.registration_plate} ·{" "}
                    {vehicleTypeDisplay[v.vehicle_type] ?? v.vehicle_type}
                  </Text>
                  {isTypeSwitch && (
                    <Text
                      className="text-[11px] font-Jakarta mt-1"
                      style={{ color: colors.amber }}
                    >
                      ⚠️ Type change — eligibility will be checked
                    </Text>
                  )}
                </View>

                {/* Checkmark or status */}
                {isSelected && !v.is_active && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
                {v.is_active && (
                  <Text
                    className="text-[12px] font-JakartaSemiBold"
                    style={{ color: colors.primary }}
                  >
                    Current
                  </Text>
                )}
              </TouchableOpacity>
            );
          })
        )}

        {/* Error */}
        {error && vehicles.length > 0 ? (
          <Text
            className="text-[14px] font-Jakarta text-center mt-2"
            style={{ color: colors.danger }}
          >
            {error}
          </Text>
        ) : null}
      </ScrollView>

      {/* Online Type-Switch Confirmation Modal */}
      <Modal
        visible={confirmModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setConfirmModalVisible(false);
          setPendingVehicle(null);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            className="w-[85%] rounded-[16px] p-[20px]"
            style={{ backgroundColor: surfaceBg }}
          >
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="warning" size={24} color={colors.amber} />
              <Text
                className="text-[18px] font-JakartaBold"
                style={{ color: textPrimary }}
              >
                Switch Vehicle Type?
              </Text>
            </View>
            <Text
              className="text-[14px] font-Jakarta mb-3"
              style={{ color: textSecondary }}
            >
              You are currently online. Switching to a different vehicle type may
              temporarily affect your dispatch eligibility.
            </Text>
            {pendingVehicle && (
              <View
                className="rounded-[10px] p-[12px] mb-4"
                style={{
                  backgroundColor: isDark ? colors.darkSecondary : colors.gray100,
                }}
              >
                <Text
                  className="text-[14px] font-JakartaSemiBold"
                  style={{ color: textPrimary }}
                >
                  {pendingVehicle.vehicle_model}
                </Text>
                <Text
                  className="text-[13px] font-Jakarta"
                  style={{ color: textSecondary }}
                >
                  {vehicleTypeDisplay[pendingVehicle.vehicle_type] ??
                    pendingVehicle.vehicle_type}
                </Text>
              </View>
            )}
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-[12px] rounded-[10px] items-center"
                style={{ borderWidth: 1, borderColor }}
                onPress={() => {
                  setConfirmModalVisible(false);
                  setPendingVehicle(null);
                }}
              >
                <Text
                  className="text-[15px] font-JakartaSemiBold"
                  style={{ color: textPrimary }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-[12px] rounded-[10px] items-center"
                style={{ backgroundColor: colors.primary }}
                onPress={handleConfirmOnlineSwitch}
              >
                <Text className="text-[15px] font-JakartaSemiBold text-white">
                  Confirm Switch
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
