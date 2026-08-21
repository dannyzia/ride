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
}

const vehicleTypeDisplay: Record<string, string> = Object.fromEntries(
  VEHICLE_TYPES.map((v) => [v.key, v.display_en]),
);

// C5 (temporary decision): one vehicle per driver. See
// docs/vehicle-model-decision.md. This screen is now a read-only
// confirmation of the registered vehicle — multi-vehicle selection and the
// vehicle-activate / vehicle-type-change calls were removed.
const ONE_VEHICLE_NOTICE =
  "You can only register one vehicle. Contact support to change it.";

export default function SelectActiveVehicle() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

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
      logger.error("SelectActiveVehicle fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  const formatVehicleType = (type: string) =>
    vehicleTypeDisplay[type] ?? type.replace(/_/g, " ");

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
          Your Vehicle
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
          </View>
        ) : (
          vehicles.map((v) => (
            <View
              key={v.id}
              className="flex-row items-center p-[14px] rounded-[12px]"
              style={{
                backgroundColor: v.is_active
                  ? isDark
                    ? "rgba(12, 194, 95, 0.08)"
                    : colors.primaryLight
                  : surfaceBg,
                borderWidth: v.is_active ? 2 : 1,
                borderColor: v.is_active ? colors.primary : borderColor,
              }}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{
                  backgroundColor: isDark
                    ? colors.primaryLightDark
                    : colors.primaryLight,
                }}
              >
                <Ionicons
                  name={v.is_active ? "checkmark-circle" : "car-outline"}
                  size={20}
                  color={colors.primary}
                />
              </View>

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
                  {v.registration_plate} · {formatVehicleType(v.vehicle_type)}
                </Text>
              </View>
            </View>
          ))
        )}

        {/* C5: one-vehicle constraint notice */}
        {hasVehicle && (
          <View
            className="rounded-[12px] p-[14px] flex-row items-center gap-2"
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
        )}
      </ScrollView>

      {/* Bottom action: add first vehicle, or continue to the driver app */}
      <View className="px-[24px] pb-[24px]">
        {hasVehicle ? (
          <TouchableOpacity
            className="rounded-full w-full py-[16px] items-center"
            style={{ backgroundColor: colors.primary }}
            onPress={() => router.replace("/(main)/(rider)/(tabs)")}
          >
            <Text
              className="text-[16px] font-JakartaBold"
              style={{ color: colors.white }}
            >
              Continue
            </Text>
          </TouchableOpacity>
        ) : (
          !loading &&
          !error && (
            <TouchableOpacity
              className="rounded-full w-full py-[16px] items-center"
              style={{ backgroundColor: colors.primary }}
              onPress={() => router.push("/(main)/(rider)/add-vehicle")}
            >
              <Text
                className="text-[16px] font-JakartaBold"
                style={{ color: colors.white }}
              >
                Add Vehicle
              </Text>
            </TouchableOpacity>
          )
        )}
      </View>
    </SafeAreaView>
  );
}
