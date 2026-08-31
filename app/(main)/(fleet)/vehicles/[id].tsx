/**
 * F04 — Vehicle Detail.
 * Fetches real data from GET /api/fleet/vehicles?fleet_id=...
 * Pattern A theming.
 */
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useFleetStore } from "@/store/useFleetStore";
import { getAuthHeaders } from "@/lib/fleetAuth";
import FleetScreen from "@/components/fleet/FleetScreen";
import { logger } from "@/lib/logger";

interface VehicleData {
  id: string;
  vehicle_type: string;
  manufacturer: string | null;
  model: string | null;
  manufacturing_year: number | null;
  registration_number: string | null;
  passenger_seats: number | null;
  has_ac: boolean | null;
  created_at: string;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  is_online: boolean | null;
  driver_rating: string | null;
}

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  bike_basic: "Bike Basic",
  bike_standard: "Bike Standard",
  bike_plus: "Bike Plus",
  cng: "CNG",
  car_compact: "Car Compact",
  car_economy: "Car Economy",
  car_comfort: "Car Comfort",
  car_premium: "Car Premium",
  car_xl: "Car XL",
};

export default function VehicleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isDark = useIsDark();
  const activeFleetId = useFleetStore((s) => s.activeFleetId);

  const textPrimary = isDark
    ? colors.textPrimaryDark
    : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const [vehicle, setVehicle] = useState<VehicleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchVehicle = useCallback(async () => {
    if (!activeFleetId || !id) return;
    try {
      setError(null);
      const authHeaders = await getAuthHeaders();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SERVER_URL}/api/fleet/vehicles?fleet_id=${activeFleetId}`,
        { headers: authHeaders ?? {} },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const found = data.vehicles?.find((v: VehicleData) => v.id === id);
      if (!found) {
        setError("Vehicle not found in this fleet");
      } else {
        setVehicle(found);
      }
    } catch (err) {
      logger.error("[vehicle-detail] fetch failed", err);
      setError("Failed to load vehicle data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFleetId, id]);

  useEffect(() => {
    fetchVehicle();
  }, [fetchVehicle]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchVehicle();
  }, [fetchVehicle]);

  if (loading) {
    return (
      <FleetScreen title="Vehicle Detail">
        <View style={{ alignItems: "center", paddingTop: 80 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={{
              fontFamily: "Jakarta-Medium",
              fontSize: 14,
              color: textSecondary,
              marginTop: 12,
            }}
          >
            Loading vehicle...
          </Text>
        </View>
      </FleetScreen>
    );
  }

  if (error || !vehicle) {
    return (
      <FleetScreen title="Vehicle Detail">
        <View style={{ alignItems: "center", paddingTop: 80 }}>
          <Ionicons name="alert-circle-outline" size={48} color="#F59E0B" />
          <Text
            style={{
              fontFamily: "Jakarta-SemiBold",
              fontSize: 16,
              color: textPrimary,
              marginTop: 12,
            }}
          >
            {error || "Vehicle not found"}
          </Text>
          <TouchableOpacity
            onPress={fetchVehicle}
            style={{
              marginTop: 16,
              backgroundColor: colors.primary,
              borderRadius: 12,
              paddingHorizontal: 24,
              paddingVertical: 10,
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-SemiBold",
                fontSize: 14,
                color: "#FFFFFF",
              }}
            >
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      </FleetScreen>
    );
  }

  const typeLabel =
    VEHICLE_TYPE_LABELS[vehicle.vehicle_type] ?? vehicle.vehicle_type;
  const isAssigned = !!vehicle.driver_id;
  const isDriverOnline = !!vehicle.is_online;

  return (
    <FleetScreen
      title="Vehicle Detail"
      onRefresh={onRefresh}
      refreshing={refreshing}
    >
      {/* Vehicle header card */}
      <View
        style={{
          backgroundColor: surfaceBg,
          borderRadius: 16,
          padding: 20,
          borderWidth: 1,
          borderColor,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: `${colors.primary}15`,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <Ionicons name="car-sport" size={36} color={colors.primary} />
        </View>
        <Text
          style={{
            fontFamily: "Jakarta-Bold",
            fontSize: 18,
            color: textPrimary,
          }}
        >
          {vehicle.manufacturer
            ? `${vehicle.manufacturer} ${vehicle.model ?? ""}`
            : typeLabel}
        </Text>
        {vehicle.registration_number && (
          <Text
            style={{
              fontFamily: "Jakarta-Medium",
              fontSize: 14,
              color: textSecondary,
              marginTop: 4,
            }}
          >
            {vehicle.registration_number}
          </Text>
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 8,
            backgroundColor: `${colors.primary}15`,
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 20,
          }}
        >
          <Text
            style={{
              fontFamily: "Jakarta-Medium",
              fontSize: 12,
              color: colors.primary,
            }}
          >
            {typeLabel}
          </Text>
        </View>
      </View>

      {/* Vehicle Info Section */}
      <InfoSection
        title="Vehicle Information"
        isDark={isDark}
        surfaceBg={surfaceBg}
        borderColor={borderColor}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
      >
        <InfoRow
          label="Registration"
          value={vehicle.registration_number ?? "—"}
          isDark={isDark}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
        <InfoRow
          label="Make & Model"
          value={
            vehicle.manufacturer
              ? `${vehicle.manufacturer} ${vehicle.model ?? "—"}`
              : "—"
          }
          isDark={isDark}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
        <InfoRow
          label="Year"
          value={vehicle.manufacturing_year?.toString() ?? "—"}
          isDark={isDark}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
        <InfoRow
          label="Category"
          value={typeLabel}
          isDark={isDark}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
        <InfoRow
          label="Passenger Seats"
          value={vehicle.passenger_seats?.toString() ?? "—"}
          isDark={isDark}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
        <InfoRow
          label="Air Conditioning"
          value={vehicle.has_ac ? "Yes" : "No"}
          isDark={isDark}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
      </InfoSection>

      {/* Current Driver Section */}
      <InfoSection
        title="Current Driver"
        isDark={isDark}
        surfaceBg={surfaceBg}
        borderColor={borderColor}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
      >
        {isAssigned ? (
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: `${colors.primary}15`,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                <Ionicons name="person" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: "Jakarta-SemiBold",
                    fontSize: 15,
                    color: textPrimary,
                  }}
                >
                  {vehicle.driver_name ?? "Unknown"}
                </Text>
                <Text
                  style={{
                    fontFamily: "Jakarta-Regular",
                    fontSize: 13,
                    color: textSecondary,
                    marginTop: 2,
                  }}
                >
                  {vehicle.driver_phone ?? "—"}
                </Text>
              </View>
              {/* Online status dot */}
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: isDriverOnline ? "#0CC25F" : "#9CA3AF",
                    marginRight: 6,
                  }}
                />
                <Text
                  style={{
                    fontFamily: "Jakarta-Medium",
                    fontSize: 12,
                    color: isDriverOnline ? "#0CC25F" : textSecondary,
                  }}
                >
                  {isDriverOnline ? "Online" : "Offline"}
                </Text>
              </View>
            </View>
            <InfoRow
              label="Rating"
              value={
                vehicle.driver_rating
                  ? `${Number(vehicle.driver_rating).toFixed(1)} ★`
                  : "—"
              }
              isDark={isDark}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />
            <TouchableOpacity
              onPress={() =>
                router.push(`/(main)/(fleet)/drivers/${vehicle.driver_id}`)
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 10,
              }}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-SemiBold",
                  fontSize: 13,
                  color: colors.primary,
                }}
              >
                View Driver Profile
              </Text>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={colors.primary}
                style={{ marginLeft: 4 }}
              />
            </TouchableOpacity>
          </>
        ) : (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 12,
            }}
          >
            <Ionicons
              name="person-outline"
              size={24}
              color={textSecondary}
              style={{ marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: "Jakarta-Medium",
                  fontSize: 14,
                  color: textSecondary,
                }}
              >
                No driver assigned
              </Text>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 12,
                  color: textSecondary,
                  marginTop: 2,
                }}
              >
                This vehicle is available in the pool
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push(`/(main)/(fleet)/assign`)}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 10,
                paddingHorizontal: 16,
                paddingVertical: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-SemiBold",
                  fontSize: 13,
                  color: "#FFFFFF",
                }}
              >
                Assign
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </InfoSection>

      {/* Documents Section (stub) */}
      <InfoSection
        title="Documents"
        isDark={isDark}
        surfaceBg={surfaceBg}
        borderColor={borderColor}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 12,
          }}
        >
          <Ionicons
            name="document-text-outline"
            size={24}
            color={textSecondary}
            style={{ marginRight: 12 }}
          />
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 13,
              color: textSecondary,
            }}
          >
            Document management coming soon
          </Text>
        </View>
      </InfoSection>

      {/* Trip History Section (stub) */}
      <InfoSection
        title="Trip History"
        isDark={isDark}
        surfaceBg={surfaceBg}
        borderColor={borderColor}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 12,
          }}
        >
          <Ionicons
            name="map-outline"
            size={24}
            color={textSecondary}
            style={{ marginRight: 12 }}
          />
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 13,
              color: textSecondary,
            }}
          >
            Trip history coming soon
          </Text>
        </View>
      </InfoSection>
    </FleetScreen>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────

function InfoSection({
  title,
  children,
  isDark,
  surfaceBg,
  borderColor,
  textPrimary,
  textSecondary,
}: {
  title: string;
  children: React.ReactNode;
  isDark: boolean;
  surfaceBg: string;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
}) {
  return (
    <View
      style={{
        backgroundColor: surfaceBg,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor,
        marginBottom: 12,
      }}
    >
      <Text
        style={{
          fontFamily: "Jakarta-Bold",
          fontSize: 14,
          color: textPrimary,
          marginBottom: 12,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function InfoRow({
  label,
  value,
  isDark,
  textPrimary,
  textSecondary,
}: {
  label: string;
  value: string;
  isDark: boolean;
  textPrimary: string;
  textSecondary: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? "#2A2D35" : "#F3F4F6",
      }}
    >
      <Text
        style={{
          fontFamily: "Jakarta-Regular",
          fontSize: 13,
          color: textSecondary,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: "Jakarta-Medium",
          fontSize: 13,
          color: textPrimary,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
