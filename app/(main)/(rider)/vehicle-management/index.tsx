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
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useDriverStore } from "@/store/useDriverStore";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";

interface Vehicle {
  id: string;
  vehicle_model: string;
  registration_plate: string;
  vehicle_type: string;
  is_active: boolean;
  fitness_expires_at: string | null;
  tax_token_expires_at: string | null;
}

const vehicleTypeDisplay: Record<string, string> = Object.fromEntries(
  VEHICLE_TYPES.map((v) => [v.key, v.display_en]),
);

export default function VehicleManagement() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activating, setActivating] = useState<string | null>(null);

  // Online confirmation modal state
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingActivation, setPendingActivation] = useState<{
    vehicleId: string;
    vehicleName: string;
  } | null>(null);

  const { driver } = useDriverStore();
  const isOnline = driver?.is_online ?? false;

  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

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
      setVehicles(data.vehicles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("Vehicles fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  const handleActivate = useCallback(
    async (vehicleId: string) => {
      setActivating(vehicleId);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/driver/vehicle-activate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ vehicle_id: vehicleId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          Alert.alert("Activation Failed", err.message || "Could not activate vehicle");
          return;
        }
        // Refresh the list to reflect the new active vehicle
        await fetchVehicles();
        Alert.alert("Vehicle Activated", "Your active vehicle has been updated.");
      } catch (err) {
        Alert.alert("Error", "Network error. Please try again.");
        logger.error("Vehicle activation failed", err);
      } finally {
        setActivating(null);
        setConfirmModalVisible(false);
        setPendingActivation(null);
      }
    },
    [fetchVehicles],
  );

  const requestActivation = useCallback(
    (vehicle: Vehicle) => {
      if (vehicle.is_active) return;

      // If driver is online, show confirmation modal
      if (isOnline) {
        setPendingActivation({
          vehicleId: vehicle.id,
          vehicleName: vehicle.vehicle_model,
        });
        setConfirmModalVisible(true);
        return;
      }

      // Offline — activate directly
      handleActivate(vehicle.id);
    },
    [isOnline, handleActivate],
  );

  const formatVehicleType = (type: string) =>
    vehicleTypeDisplay[type] ??
    type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const isDocumentExpiring = (dateStr: string | null): boolean => {
    if (!dateStr) return false;
    const expiry = new Date(dateStr);
    const now = new Date();
    const daysUntil = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysUntil <= 30 && daysUntil > 0;
  };

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
          My Vehicles
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        className="flex-1 px-[24px]"
        contentContainerStyle={{ paddingVertical: 16, gap: 12 }}
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
              className="text-[16px] font-Jakarta mt-3 text-center"
              style={{ color: textSecondary }}
            >
              No vehicles registered yet.
            </Text>
            <Text
              className="text-[13px] font-Jakarta mt-1 text-center"
              style={{ color: textSecondary }}
            >
              Add your first vehicle to start receiving ride offers.
            </Text>
          </View>
        ) : (
          vehicles.map((v) => {
            const fitnessExpiring = isDocumentExpiring(v.fitness_expires_at);
            const taxExpiring = isDocumentExpiring(v.tax_token_expires_at);

            return (
              <View
                key={v.id}
                className="rounded-[12px] p-[14px]"
                style={{
                  backgroundColor: v.is_active
                    ? isDark
                      ? "rgba(12, 194, 95, 0.08)"
                      : colors.primaryLight
                    : surfaceBg,
                  borderWidth: 1,
                  borderColor: v.is_active ? colors.primary : borderColor,
                }}
              >
                {/* Top row: model + active badge */}
                <View className="flex-row justify-between items-center mb-2">
                  <Text
                    className="text-[15px] font-JakartaBold flex-1"
                    style={{ color: textPrimary }}
                    numberOfLines={1}
                  >
                    {v.vehicle_model}
                  </Text>
                  {v.is_active && (
                    <View
                      className="rounded-full px-[10px] py-[2px] ml-2"
                      style={{
                        backgroundColor: isDark
                          ? colors.primaryLightDark
                          : colors.primaryLight,
                      }}
                    >
                      <Text
                        className="text-[11px] font-JakartaBold"
                        style={{ color: colors.primary }}
                      >
                        ACTIVE
                      </Text>
                    </View>
                  )}
                </View>

                {/* Details */}
                <Text
                  className="text-[13px] font-Jakarta mb-1"
                  style={{ color: textSecondary }}
                >
                  {v.registration_plate} · {formatVehicleType(v.vehicle_type)}
                </Text>

                {/* Document expiry warnings */}
                {(fitnessExpiring || taxExpiring) && (
                  <View className="flex-row gap-2 mt-1 mb-2">
                    {fitnessExpiring && (
                      <View
                        className="flex-row items-center gap-1 px-2 py-1 rounded-full"
                        style={{ backgroundColor: `${colors.amber}20` }}
                      >
                        <Ionicons name="warning" size={12} color={colors.amber} />
                        <Text
                          className="text-[11px] font-Jakarta"
                          style={{ color: colors.amber }}
                        >
                          Fitness expiring
                        </Text>
                      </View>
                    )}
                    {taxExpiring && (
                      <View
                        className="flex-row items-center gap-1 px-2 py-1 rounded-full"
                        style={{ backgroundColor: `${colors.amber}20` }}
                      >
                        <Ionicons name="warning" size={12} color={colors.amber} />
                        <Text
                          className="text-[11px] font-Jakarta"
                          style={{ color: colors.amber }}
                        >
                          Tax token expiring
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Activate button for non-active vehicles */}
                {!v.is_active && (
                  <TouchableOpacity
                    className="rounded-full py-[10px] items-center mt-2"
                    style={{
                      borderWidth: 1.5,
                      borderColor: colors.primary,
                    }}
                    onPress={() => requestActivation(v)}
                    disabled={activating === v.id}
                  >
                    {activating === v.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text
                        className="text-[14px] font-JakartaBold"
                        style={{ color: colors.primary }}
                      >
                        Activate
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        {/* Add Vehicle button */}
        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center mt-2"
          style={{ backgroundColor: colors.primary }}
          onPress={() => router.push("/(main)/(rider)/add-vehicle")}
        >
          <Text className="text-[18px] font-JakartaBold" style={{ color: colors.white }}>
            + Add Vehicle
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Online Activation Confirmation Modal */}
      <Modal
        visible={confirmModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setConfirmModalVisible(false);
          setPendingActivation(null);
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
                Switch Vehicle While Online?
              </Text>
            </View>
            <Text
              className="text-[14px] font-Jakarta mb-4"
              style={{ color: textSecondary }}
            >
              You are currently online and may receive ride offers. Switching your
              active vehicle may temporarily affect your dispatch eligibility if
              the vehicle type changes.
            </Text>
            {pendingActivation && (
              <Text
                className="text-[14px] font-JakartaSemiBold mb-4"
                style={{ color: textPrimary }}
              >
                Activating: {pendingActivation.vehicleName}
              </Text>
            )}
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-[12px] rounded-[10px] items-center"
                style={{ borderWidth: 1, borderColor }}
                onPress={() => {
                  setConfirmModalVisible(false);
                  setPendingActivation(null);
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
                onPress={() => {
                  if (pendingActivation) {
                    handleActivate(pendingActivation.vehicleId);
                  }
                }}
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
