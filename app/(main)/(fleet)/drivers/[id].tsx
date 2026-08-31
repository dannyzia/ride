/**
 * F07 — Driver Detail.
 * Fetches real data from GET /api/fleet/drivers?fleet_id=...
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

interface DriverData {
  id: string;
  user_id: string;
  vehicle_type: string;
  vehicle_id: string | null;
  status: string;
  rating: string;
  completed_rides_count: number;
  is_online: boolean;
  created_at: string;
  name: string;
  phone: string;
  vehicle_reg: string | null;
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

export default function DriverDetail() {
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

  const [driver, setDriver] = useState<DriverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDriver = useCallback(async () => {
    if (!activeFleetId || !id) return;
    try {
      setError(null);
      const authHeaders = await getAuthHeaders();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SERVER_URL}/api/fleet/drivers?fleet_id=${activeFleetId}`,
        { headers: authHeaders ?? {} },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const found = data.drivers?.find((d: DriverData) => d.id === id);
      if (!found) {
        setError("Driver not found in this fleet");
      } else {
        setDriver(found);
      }
    } catch (err) {
      logger.error("[driver-detail] fetch failed", err);
      setError("Failed to load driver data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFleetId, id]);

  useEffect(() => {
    fetchDriver();
  }, [fetchDriver]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDriver();
  }, [fetchDriver]);

  if (loading) {
    return (
      <FleetScreen title="Driver Detail">
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
            Loading driver...
          </Text>
        </View>
      </FleetScreen>
    );
  }

  if (error || !driver) {
    return (
      <FleetScreen title="Driver Detail">
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
            {error || "Driver not found"}
          </Text>
          <TouchableOpacity
            onPress={fetchDriver}
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
    VEHICLE_TYPE_LABELS[driver.vehicle_type] ?? driver.vehicle_type;
  const isOnline = driver.is_online;
  const hasVehicle = !!driver.vehicle_id;
  const rating = driver.rating ? Number(driver.rating) : 0;

  const initials = driver.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <FleetScreen
      title="Driver Detail"
      onRefresh={onRefresh}
      refreshing={refreshing}
    >
      {/* Driver header card */}
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
          <Text
            style={{
              fontFamily: "Jakarta-Bold",
              fontSize: 26,
              color: colors.primary,
            }}
          >
            {initials || "?"}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: "Jakarta-Bold",
            fontSize: 18,
            color: textPrimary,
          }}
        >
          {driver.name}
        </Text>
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontSize: 13,
            color: textSecondary,
            marginTop: 2,
          }}
        >
          {driver.phone}
        </Text>

        {/* Status badges row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 12,
            gap: 8,
          }}
        >
          {/* Online status */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: isOnline ? "#0CC25F15" : "#9CA3AF15",
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 20,
              gap: 4,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: isOnline ? "#0CC25F" : "#9CA3AF",
              }}
            />
            <Text
              style={{
                fontFamily: "Jakarta-Medium",
                fontSize: 11,
                color: isOnline ? "#0CC25F" : textSecondary,
              }}
            >
              {isOnline ? "Online" : "Offline"}
            </Text>
          </View>

          {/* Rating */}
          {rating > 0 && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#F59E0B15",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 20,
                gap: 4,
              }}
            >
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text
                style={{
                  fontFamily: "Jakarta-Medium",
                  fontSize: 11,
                  color: "#F59E0B",
                }}
              >
                {rating.toFixed(1)}
              </Text>
            </View>
          )}

          {/* Vehicle type */}
          <View
            style={{
              backgroundColor: `${colors.primary}15`,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 20,
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-Medium",
                fontSize: 11,
                color: colors.primary,
              }}
            >
              {typeLabel}
            </Text>
          </View>
        </View>
      </View>

      {/* Profile Section */}
      <InfoSection
        title="Profile"
        isDark={isDark}
        surfaceBg={surfaceBg}
        borderColor={borderColor}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
      >
        <InfoRow
          label="Name"
          value={driver.name}
          isDark={isDark}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
        <InfoRow
          label="Phone"
          value={driver.phone}
          isDark={isDark}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
        <InfoRow
          label="Vehicle Type"
          value={typeLabel}
          isDark={isDark}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
        <InfoRow
          label="Status"
          value={driver.status}
          isDark={isDark}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
        <InfoRow
          label="Joined"
          value={new Date(driver.created_at).toLocaleDateString()}
          isDark={isDark}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
      </InfoSection>

      {/* Performance Section */}
      <InfoSection
        title="Performance"
        isDark={isDark}
        surfaceBg={surfaceBg}
        borderColor={borderColor}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
      >
        <InfoRow
          label="Rating"
          value={rating > 0 ? `${rating.toFixed(1)} ★` : "No ratings yet"}
          isDark={isDark}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
        <InfoRow
          label="Completed Trips"
          value={driver.completed_rides_count.toString()}
          isDark={isDark}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
        <InfoRow
          label="Current Status"
          value={isOnline ? "Online" : "Offline"}
          isDark={isDark}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
      </InfoSection>

      {/* Current Vehicle Section */}
      <InfoSection
        title="Current Vehicle"
        isDark={isDark}
        surfaceBg={surfaceBg}
        borderColor={borderColor}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
      >
        {hasVehicle ? (
          <>
            <InfoRow
              label="Registration"
              value={driver.vehicle_reg ?? "—"}
              isDark={isDark}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />
            <InfoRow
              label="Vehicle Type"
              value={typeLabel}
              isDark={isDark}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />
            <TouchableOpacity
              onPress={() =>
                router.push(`/(main)/(fleet)/vehicles/${driver.vehicle_id}`)
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
                View Vehicle Details
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
              name="car-outline"
              size={24}
              color={textSecondary}
              style={{ marginRight: 12 }}
            />
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 13,
                color: textSecondary,
                flex: 1,
              }}
            >
              No vehicle assigned
            </Text>
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
                Assign Vehicle
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
