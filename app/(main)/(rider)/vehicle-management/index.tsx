import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";

interface Vehicle {
  id: string;
  vehicle_model: string;
  registration_plate: string;
  vehicle_type: string;
  is_active: boolean;
  fitness_expires_at: string | null;
  tax_token_expires_at: string | null;
  // §12.2.6: classification status — derived from approval + type-change history
  driver_status?: string;
  has_type_changes?: boolean;
}

const vehicleTypeDisplay: Record<string, string> = Object.fromEntries(
  VEHICLE_TYPES.map((v) => [v.key, v.display_en]),
);

// §12.2.6: derived classification badge — no new column, derived from
// driver approval status and vehicle_type_changes history.
type ClassificationBadge = 'classified' | 'pending_review' | 'adjusted' | null;

function deriveClassificationBadge(v: Vehicle): ClassificationBadge {
  // 'adjusted' — admin has changed the vehicle type (vehicle_type_changes exist)
  if (v.has_type_changes) return 'adjusted';
  // 'pending_review' — driver account still pending approval
  if (v.driver_status && v.driver_status !== 'approved') return 'pending_review';
  // 'classified' — driver approved (vehicle went through classification)
  if (v.driver_status === 'approved') return 'classified';
  return null;
}

// C5 (temporary decision): one vehicle per driver. See
// docs/vehicle-model-decision.md. The multi-vehicle "Activate" UI and the
// vehicle-activate endpoint were removed; changing the vehicle is
// support-assisted until Product approves Option B.
const ONE_VEHICLE_NOTICE =
  "You can only register one vehicle. Contact support to change it.";

export default function VehicleManagement() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const formatVehicleType = (type: string) =>
    vehicleTypeDisplay[type] ??
    type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // H6: Distinguish expired docs (red) from expiring-soon docs (orange)
  const getDocumentStatus = (dateStr: string | null): "expired" | "expiring" | "ok" => {
    if (!dateStr) return "ok";
    const expiry = new Date(dateStr);
    const now = new Date();
    const daysUntil = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntil <= 0) return "expired";
    if (daysUntil <= 30) return "expiring";
    return "ok";
  };

  const hasVehicle = vehicles.length > 0;

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
            const fitnessStatus = getDocumentStatus(v.fitness_expires_at);
            const taxStatus = getDocumentStatus(v.tax_token_expires_at);
            const fitnessExpiring = fitnessStatus === "expiring";
            const taxExpiring = taxStatus === "expiring";
            const fitnessExpired = fitnessStatus === "expired";
            const taxExpired = taxStatus === "expired";

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

                {/* §12.2.6: Classification status badge (derived — no new column) */}
                {(() => {
                  const badge = deriveClassificationBadge(v);
                  if (!badge) return null;
                  const badgeConfig = {
                    classified: { label: 'Classified', bg: isDark ? colors.primaryLightDark : colors.primaryLight, color: colors.primary, icon: 'checkmark-circle' as const },
                    pending_review: { label: 'Pending Review', bg: `${colors.info}1A`, color: colors.info, icon: 'time' as const },
                    adjusted: { label: 'Adjusted', bg: `${colors.amber}20`, color: colors.amber, icon: 'create' as const },
                  };
                  const cfg = badgeConfig[badge];
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, backgroundColor: cfg.bg }}>
                        <Ionicons name={cfg.icon} size={12} color={cfg.color} />
                        <Text style={{ fontFamily: 'Jakarta-SemiBold', fontSize: 11, color: cfg.color }}>{cfg.label}</Text>
                      </View>
                    </View>
                  );
                })()}

                {/* H6: Document expiry/expired warnings */}
                {(fitnessExpiring || taxExpiring || fitnessExpired || taxExpired) && (
                  <View className="flex-row flex-wrap gap-2 mt-1 mb-2">
                    {fitnessExpired && (
                      <View
                        className="flex-row items-center gap-1 px-2 py-1 rounded-full"
                        style={{ backgroundColor: `${colors.danger}20` }}
                      >
                        <Ionicons name="close-circle" size={12} color={colors.danger} />
                        <Text
                          className="text-[11px] font-Jakarta"
                          style={{ color: colors.danger }}
                        >
                          Fitness expired
                        </Text>
                      </View>
                    )}
                    {fitnessExpiring && !fitnessExpired && (
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
                    {taxExpired && (
                      <View
                        className="flex-row items-center gap-1 px-2 py-1 rounded-full"
                        style={{ backgroundColor: `${colors.danger}20` }}
                      >
                        <Ionicons name="close-circle" size={12} color={colors.danger} />
                        <Text
                          className="text-[11px] font-Jakarta"
                          style={{ color: colors.danger }}
                        >
                          Tax token expired
                        </Text>
                      </View>
                    )}
                    {taxExpiring && !taxExpired && (
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
              </View>
            );
          })
        )}

        {/* C5: One-vehicle constraint notice replaces the Add Vehicle button
            once a vehicle is registered. */}
        {hasVehicle ? (
          <View
            className="rounded-[12px] p-[14px] flex-row items-center gap-2 mt-2"
            style={{
              backgroundColor: `${colors.info}10`,
              borderWidth: 1,
              borderColor: `${colors.info}20`,
            }}
          >
            <Ionicons name="information-circle-outline" size={18} color={colors.info} />
            <Text
              className="text-[13px] font-Jakarta flex-1"
              style={{ color: textSecondary }}
            >
              {ONE_VEHICLE_NOTICE}
            </Text>
          </View>
        ) : (
          !loading &&
          !error && (
            <TouchableOpacity
              className="rounded-full w-full py-[16px] items-center mt-2"
              style={{ backgroundColor: colors.primary }}
              onPress={() => router.push("/(main)/(rider)/add-vehicle")}
            >
              <Text
                className="text-[18px] font-JakartaBold"
                style={{ color: colors.white }}
              >
                + Add Vehicle
              </Text>
            </TouchableOpacity>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
