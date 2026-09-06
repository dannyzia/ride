/**
 * Operations Hub — F03 Vehicle List, F06 Driver List, F08 Assign action.
 * Tabbed: Vehicles | Drivers. FlatList with server-side pagination.
 * Pattern A theming.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useFleetStore } from "@/store/useFleetStore";
import FleetScreen from "@/components/fleet/FleetScreen";
import FleetTabBar from "@/components/fleet/FleetTabBar";
import { getAuthHeaders } from "@/lib/fleetAuth";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────

interface VehicleRow {
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

interface DriverRow {
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

type Tab = "vehicles" | "drivers";
type OperationsRow = VehicleRow | DriverRow;

const PAGE_SIZE = 20;

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

// ── Component ─────────────────────────────────────────────────────────────

export default function OperationsHub() {
  const isDark = useIsDark();
  const router = useRouter();
  const fleetId = useFleetStore((s) => s.activeFleetId);

  const [tab, setTab] = useState<Tab>("vehicles");

  // Full data (all pages loaded)
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);

  // Pagination state
  const [vehiclePage, setVehiclePage] = useState(1);
  const [driverPage, setDriverPage] = useState(1);
  const [hasMoreVehicles, setHasMoreVehicles] = useState(true);
  const [hasMoreDrivers, setHasMoreDrivers] = useState(true);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "";

  // ── Fetch a single page ───────────────────────────────────────────────

  const fetchPage = useCallback(
    async (
      endpoint: "vehicles" | "drivers",
      page: number,
      replace: boolean,
    ): Promise<boolean> => {
      if (!fleetId) return false;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const headers = (await getAuthHeaders()) ?? {};
        const res = await fetch(
          `${serverUrl}/api/fleet/${endpoint}?fleet_id=${fleetId}&page=${page}&limit=${PAGE_SIZE}`,
          { headers, signal: controller.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const rows = endpoint === "vehicles" ? data.vehicles : data.drivers;

        if (!rows || rows.length === 0) {
          if (endpoint === "vehicles") setHasMoreVehicles(false);
          else setHasMoreDrivers(false);
          return false;
        }

        if (endpoint === "vehicles") {
          setVehicles((prev) => (replace ? rows : [...prev, ...rows]));
          setHasMoreVehicles(rows.length >= PAGE_SIZE);
        } else {
          setDrivers((prev) => (replace ? rows : [...prev, ...rows]));
          setHasMoreDrivers(rows.length >= PAGE_SIZE);
        }
        return rows.length >= PAGE_SIZE;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return false;
        logger.error(`[operations] ${endpoint} fetch failed`, err);
        return false;
      }
    },
    [fleetId, serverUrl],
  );

  // ── Initial load + tab switch ─────────────────────────────────────────

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setVehicles([]);
      setDrivers([]);
      setVehiclePage(1);
      setDriverPage(1);
      setHasMoreVehicles(true);
      setHasMoreDrivers(true);

      // Fetch first page of the active tab
      if (tab === "vehicles") {
        await fetchPage("vehicles", 1, true);
        if (active) setLoading(false);
      } else {
        await fetchPage("drivers", 1, true);
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [tab, fleetId]);  

  // ── Pull to refresh ──────────────────────────────────────────────────

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (tab === "vehicles") {
      setVehiclePage(1);
      setHasMoreVehicles(true);
      await fetchPage("vehicles", 1, true);
    } else {
      setDriverPage(1);
      setHasMoreDrivers(true);
      await fetchPage("drivers", 1, true);
    }
    setRefreshing(false);
  }, [tab, fetchPage]);

  // ── Load more (infinite scroll) ──────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);

    if (tab === "vehicles" && hasMoreVehicles) {
      const nextPage = vehiclePage + 1;
      const hasMore = await fetchPage("vehicles", nextPage, false);
      if (hasMore) setVehiclePage(nextPage);
    } else if (tab === "drivers" && hasMoreDrivers) {
      const nextPage = driverPage + 1;
      const hasMore = await fetchPage("drivers", nextPage, false);
      if (hasMore) setDriverPage(nextPage);
    }

    setLoadingMore(false);
  }, [
    tab,
    vehiclePage,
    driverPage,
    hasMoreVehicles,
    hasMoreDrivers,
    loadingMore,
    fetchPage,
  ]);

  // ── Theme tokens ─────────────────────────────────────────────────────

  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark
    ? colors.textPrimaryDark
    : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  // ── Render ───────────────────────────────────────────────────────────

  const data = tab === "vehicles" ? vehicles : drivers;
  const hasMore = tab === "vehicles" ? hasMoreVehicles : hasMoreDrivers;

  return (
    <FleetScreen
      title="Operations"
      onRefresh={onRefresh}
      refreshing={refreshing}
      scrollable={false}
    >
      {/* Tab switcher */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: surfaceBg,
          borderRadius: 12,
          padding: 4,
          marginBottom: 16,
          borderWidth: 1,
          borderColor,
        }}
      >
        {(["vehicles", "drivers"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: tab === t ? colors.primary : "transparent",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: tab === t ? "Jakarta-Bold" : "Jakarta-Medium",
                fontSize: 13,
                color: tab === t ? "#FFFFFF" : textSecondary,
              }}
            >
              {t === "vehicles"
                ? `Vehicles (${vehicles.length})`
                : `Drivers (${drivers.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Assign button */}
      <TouchableOpacity
        onPress={() => router.push("/(main)/(fleet)/assign")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.primary,
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
        }}
      >
        <Ionicons name="add-circle" size={20} color="#FFFFFF" />
        <Text
          style={{
            fontFamily: "Jakarta-SemiBold",
            fontSize: 14,
            color: "#FFFFFF",
            marginLeft: 8,
          }}
        >
          Assign Driver to Vehicle
        </Text>
      </TouchableOpacity>

      {/* Loading spinner for initial load */}
      {loading ? (
        <View style={{ alignItems: "center", paddingTop: 40 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={{
              fontFamily: "Jakarta-Medium",
              fontSize: 13,
              color: textSecondary,
              marginTop: 12,
            }}
          >
            Loading {tab}...
          </Text>
        </View>
      ) : (
        <FlatList<OperationsRow>
          data={data}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) =>
            tab === "vehicles" ? (
              <VehicleCard
                vehicle={item as VehicleRow}
                isDark={isDark}
                surfaceBg={surfaceBg}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                borderColor={borderColor}
                onPress={() =>
                  router.push(`/(main)/(fleet)/vehicles/${item.id}`)
                }
              />
            ) : (
              <DriverCard
                driver={item as DriverRow}
                isDark={isDark}
                surfaceBg={surfaceBg}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                borderColor={borderColor}
                onPress={() =>
                  router.push(`/(main)/(fleet)/drivers/${item.id}`)
                }
              />
            )
          }
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : hasMore ? (
              <View style={{ paddingVertical: 8 }} />
            ) : data.length > 0 ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <Text
                  style={{
                    fontFamily: "Jakarta-Regular",
                    fontSize: 12,
                    color: textSecondary,
                  }}
                >
                  All {tab} loaded
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 40 }}>
              <Ionicons
                name={tab === "vehicles" ? "car-outline" : "people-outline"}
                size={48}
                color={textSecondary}
              />
              <Text
                style={{
                  fontFamily: "Jakarta-Medium",
                  fontSize: 14,
                  color: textSecondary,
                  marginTop: 12,
                }}
              >
                No {tab} in fleet yet
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      <FleetTabBar />
    </FleetScreen>
  );
}

// ── Vehicle Card ──────────────────────────────────────────────────────────

function VehicleCard({
  vehicle,
  isDark,
  surfaceBg,
  textPrimary,
  textSecondary,
  borderColor,
  onPress,
}: {
  vehicle: VehicleRow;
  isDark: boolean;
  surfaceBg: string;
  textPrimary: string;
  textSecondary: string;
  borderColor: string;
  onPress: () => void;
}) {
  const isAssigned = !!vehicle.driver_id;
  const isOnline = !!vehicle.is_online;
  const typeLabel =
    VEHICLE_TYPE_LABELS[vehicle.vehicle_type] ?? vehicle.vehicle_type;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={{
        backgroundColor: surfaceBg,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      {/* Vehicle icon */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: `${colors.primary}12`,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
        }}
      >
        <Ionicons name="car-sport" size={22} color={colors.primary} />
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={{
              fontFamily: "Jakarta-SemiBold",
              fontSize: 14,
              color: textPrimary,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {vehicle.manufacturer
              ? `${vehicle.manufacturer} ${vehicle.model ?? ""}`
              : typeLabel}
          </Text>
          {vehicle.manufacturing_year && (
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 11,
                color: textSecondary,
              }}
            >
              {vehicle.manufacturing_year}
            </Text>
          )}
        </View>

        {/* Reg number + type badge */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 4,
            gap: 6,
          }}
        >
          {vehicle.registration_number && (
            <Text
              style={{
                fontFamily: "Jakarta-Medium",
                fontSize: 12,
                color: textSecondary,
              }}
            >
              {vehicle.registration_number}
            </Text>
          )}
          <View
            style={{
              backgroundColor: `${colors.primary}15`,
              paddingHorizontal: 6,
              paddingVertical: 1,
              borderRadius: 6,
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-Medium",
                fontSize: 10,
                color: colors.primary,
              }}
            >
              {typeLabel}
            </Text>
          </View>
        </View>

        {/* Driver info row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 6,
            gap: 6,
          }}
        >
          {isAssigned ? (
            <>
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
                  fontFamily: "Jakarta-Regular",
                  fontSize: 11,
                  color: textSecondary,
                }}
              >
                {vehicle.driver_name ?? "Driver"}
              </Text>
              {vehicle.driver_rating && (
                <Text
                  style={{
                    fontFamily: "Jakarta-Regular",
                    fontSize: 11,
                    color: "#F59E0B",
                  }}
                >
                  ★ {Number(vehicle.driver_rating).toFixed(1)}
                </Text>
              )}
            </>
          ) : (
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 11,
                color: textSecondary,
                fontStyle: "italic",
              }}
            >
              Unassigned
            </Text>
          )}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color={textSecondary} />
    </TouchableOpacity>
  );
}

// ── Driver Card ───────────────────────────────────────────────────────────

function DriverCard({
  driver,
  isDark,
  surfaceBg,
  textPrimary,
  textSecondary,
  borderColor,
  onPress,
}: {
  driver: DriverRow;
  isDark: boolean;
  surfaceBg: string;
  textPrimary: string;
  textSecondary: string;
  borderColor: string;
  onPress: () => void;
}) {
  const isOnline = driver.is_online;
  const hasVehicle = !!driver.vehicle_id;
  const rating = driver.rating ? Number(driver.rating) : 0;
  const typeLabel =
    VEHICLE_TYPE_LABELS[driver.vehicle_type] ?? driver.vehicle_type;

  const initials = driver.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={{
        backgroundColor: surfaceBg,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      {/* Avatar */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: `${colors.primary}15`,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
        }}
      >
        <Text
          style={{
            fontFamily: "Jakarta-Bold",
            fontSize: 15,
            color: colors.primary,
          }}
        >
          {initials || "?"}
        </Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={{
              fontFamily: "Jakarta-SemiBold",
              fontSize: 14,
              color: textPrimary,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {driver.name}
          </Text>
          {/* Online dot */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
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
        </View>

        {/* Type + rating + vehicle */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 4,
            gap: 6,
          }}
        >
          <View
            style={{
              backgroundColor: `${colors.primary}15`,
              paddingHorizontal: 6,
              paddingVertical: 1,
              borderRadius: 6,
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-Medium",
                fontSize: 10,
                color: colors.primary,
              }}
            >
              {typeLabel}
            </Text>
          </View>

          {rating > 0 && (
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 11,
                color: "#F59E0B",
              }}
            >
              ★ {rating.toFixed(1)}
            </Text>
          )}

          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 11,
              color: textSecondary,
            }}
          >
            {driver.completed_rides_count} trips
          </Text>
        </View>

        {/* Vehicle assignment */}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
          {hasVehicle ? (
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 11,
                color: textSecondary,
              }}
            >
              🚗 {driver.vehicle_reg ?? "Assigned"}
            </Text>
          ) : (
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 11,
                color: textSecondary,
                fontStyle: "italic",
              }}
            >
              No vehicle
            </Text>
          )}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color={textSecondary} />
    </TouchableOpacity>
  );
}
