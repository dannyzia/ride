import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  StatusBar,
  TextInput,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Map from "@/components/Map";
import { fetchRouteGeometry } from "@/lib/routeGeometry";
import { useCustomer } from "@/store";
import {
  useRiderStore,
  type BookingStep,
  type VehicleCategory,
  type FareEstimate,
  getCachedEstimates,
  setCachedEstimates,
} from "@/store/useRiderStore";
import {
  VEHICLE_CATEGORIES,
  VEHICLE_TYPES,
  type VehicleTypeEnum,
  type VehicleIconName,
} from "@/lib/vehicleTypes";
import { supabase } from "@/lib/supabase";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import SosBanner from "@/components/SosBanner";

// ── Vehicle icons per type ───────────────────────────────────────
const VEHICLE_ICONS: Record<VehicleTypeEnum, VehicleIconName> = {
  bike_basic: "bicycle",
  bike_standard: "bicycle",
  bike_plus: "bicycle",
  cng: "car-sport",
  car_compact: "car",
  car_economy: "car",
  car_comfort: "car",
  car_premium: "car",
  car_xl: "bus",
};

interface SavedPlace {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
}

// ── Category → vehicle type prefix mapping ───────────────────────
function getTypesForCategory(cat: VehicleCategory): VehicleTypeEnum[] {
  if (cat === "bike") return ["bike_basic", "bike_standard", "bike_plus"];
  if (cat === "cng") return ["cng"];
  if (cat === "car")
    return ["car_compact", "car_economy", "car_comfort", "car_premium"];
  if (cat === "large_car") return ["car_xl"];
  return [];
}

const SNAP_POINTS = ["50%", "70%"];

export default function HomeScreen() {
  const {
    service,
    rebook_origin,
    rebook_dest,
    rebook_origin_lat,
    rebook_origin_lng,
    rebook_dest_lat,
    rebook_dest_lng,
    vehicle_type: rebookVehicleType,
  } = useLocalSearchParams<{
    service?: string;
    rebook_origin?: string;
    rebook_dest?: string;
    rebook_origin_lat?: string;
    rebook_origin_lng?: string;
    rebook_dest_lat?: string;
    rebook_dest_lng?: string;
    vehicle_type?: string;
  }>();

  const isDark = useIsDark();
  const { language, setTheme } = useAppearance();

  // ── Theme tokens ───────────────────────────────────────────────
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark
    ? colors.textPrimaryDark
    : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;
  const textDisabled = isDark
    ? colors.textDisabledDark
    : colors.textDisabledLight;

  // ── Stores ─────────────────────────────────────────────────────
  const {
    userLatitude,
    userLongitude,
    userAddress,
    setUserLocation,
    setDestinationLocation,
  } = useCustomer();
  const {
    bookingStep,
    setBookingStep,
    selectedCategory,
    setSelectedCategory,
    selectedVehicleType,
    setSelectedVehicleType,
    estimates,
    setEstimates,
    estimateLoading,
    setEstimateLoading,
    estimateError,
    setEstimateError,
    pickupCoords,
    setPickupCoords,
    dropoffCoords,
    setDropoffCoords,
    stops,
    setStops,
    setPickup: setRiderPickup,
    setDropoff: setRiderDropoff,
    setSelectedVehicleType: setRiderVehicleType,
    setSearchingRideId,
    setRideStatus,
  } = useRiderStore();

  // ── Local state ────────────────────────────────────────────────
  const [pickup, setPickup] = useState<SavedPlace | null>(null);
  const [destination, setDestination] = useState<SavedPlace | null>(null);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [recentPlaces, setRecentPlaces] = useState<SavedPlace[]>([]);
  const [requesting, setRequesting] = useState(false);
  // stops are managed via useRiderStore (accessible via autocomplete for stop type)
  const [vehicleMarkers, setVehicleMarkers] = useState<
    { id: string; lat: number; lng: number; vehicle_type: string }[]
  >([]);
  const [showSavePlace, setShowSavePlace] = useState(false);
  const [savePlaceLabel, setSavePlaceLabel] = useState("");
  const [selectedPromo, setSelectedPromo] = useState<{
    type: string;
    amount_bdt: number;
    description: string;
  } | null>(null);
  const [mapPinCoords, setMapPinCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapPinAddress, setMapPinAddress] = useState("");
  const [mapPinLoading, setMapPinLoading] = useState(false);
  const [routeGeo, setRouteGeo] = useState<[number, number][] | null>(null);
  const [pickupEta, setPickupEta] = useState<number | null>(null);
  const [nearbyCount, setNearbyCount] = useState<number>(0);

  const sheetRef = useRef<BottomSheet>(null);

  // ── Derived state ──────────────────────────────────────────────
  const hasRoute = !!(
    pickupCoords &&
    dropoffCoords &&
    pickupCoords.lat !== 0 &&
    dropoffCoords.lat !== 0
  );

  // Estimates filtered to current category
  const categoryEstimates = useMemo(() => {
    if (!selectedCategory || !estimates.length) return [];
    const typeKeys = getTypesForCategory(selectedCategory);
    return estimates.filter((e) => typeKeys.includes(e.vehicle_type as VehicleTypeEnum));
  }, [estimates, selectedCategory]);

  const selectedEstimate = useMemo(
    () =>
      estimates.find((e) => e.vehicle_type === selectedVehicleType) ?? null,
    [estimates, selectedVehicleType],
  );

  const vehicleDef = selectedVehicleType
    ? VEHICLE_TYPES.find((v) => v.key === selectedVehicleType)
    : null;

  // ── Init: set pickup from GPS ──────────────────────────────────
  useEffect(() => {
    if (userLatitude && userLongitude && !pickup) {
      setPickup({
        id: "current",
        label: "Current Location",
        address: userAddress || "Current Location",
        lat: userLatitude,
        lng: userLongitude,
      });
      setPickupCoords({ lat: userLatitude, lng: userLongitude });
    }
  }, [userLatitude, userLongitude, userAddress]);

  // ── Init: set category from service param ──────────────────────
  useEffect(() => {
    if (service) {
      const cat = VEHICLE_CATEGORIES.find((c) => c.key === service);
      if (cat) setSelectedCategory(cat.key as VehicleCategory);
    }
  }, [service]);

  // ── Rebook prefill ─────────────────────────────────────────────
  useEffect(() => {
    if (!rebook_origin || !rebook_dest) return;
    const parseCoord = (v?: string): number | null => {
      const n = v ? parseFloat(v) : NaN;
      return Number.isFinite(n) && n !== 0 ? n : null;
    };
    const oLat = parseCoord(rebook_origin_lat);
    const oLng = parseCoord(rebook_origin_lng);
    const dLat = parseCoord(rebook_dest_lat);
    const dLng = parseCoord(rebook_dest_lng);
    if (!oLat || !oLng || !dLat || !dLng) return;

    setPickup({
      id: "rebook-pickup",
      label: "Pickup",
      address: rebook_origin,
      lat: oLat,
      lng: oLng,
    });
    setPickupCoords({ lat: oLat, lng: oLng });
    setDestination({
      id: "rebook-dest",
      label: "Destination",
      address: rebook_dest,
      lat: dLat,
      lng: dLng,
    });
    setDropoffCoords({ lat: dLat, lng: dLng });
    setBookingStep("FARES");
    sheetRef.current?.snapToIndex(1);
  }, [rebook_origin, rebook_dest]);

  // ── Sync local pickup from rider store (autocomplete sets store directly) ──
  useEffect(() => {
    if (pickupCoords && pickupCoords.lat !== 0) {
      const store = useRiderStore.getState();
      if (store.pickupAddress && (!pickup || pickup.lat !== pickupCoords.lat || pickup.lng !== pickupCoords.lng)) {
        setPickup({
          id: "pickup",
          label: "Pickup",
          address: store.pickupAddress,
          lat: pickupCoords.lat,
          lng: pickupCoords.lng,
        });
      }
    }
  }, [pickupCoords?.lat, pickupCoords?.lng]);

  // ── Sync local destination from rider store (autocomplete sets store directly) ──
  useEffect(() => {
    if (dropoffCoords && dropoffCoords.lat !== 0) {
      const store = useRiderStore.getState();
      if (store.dropoffAddress && (!destination || destination.lat !== dropoffCoords.lat || destination.lng !== dropoffCoords.lng)) {
        setDestination({
          id: "dest",
          label: "Destination",
          address: store.dropoffAddress,
          lat: dropoffCoords.lat,
          lng: dropoffCoords.lng,
        });
      }
    }
  }, [dropoffCoords?.lat, dropoffCoords?.lng]);

  // ── Fetch saved + recent places ────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };

        const [addrRes, ridesRes] = await Promise.all([
          fetch(`${API_URL}/api/rider/addresses`, { headers }),
          fetch(`${API_URL}/api/ride/get-all`, { headers }),
        ]);
        if (!active) return;

        if (addrRes.ok) {
          const data: {
            addresses?: {
              id: string;
              label: string;
              address: string;
              lat: string;
              lng: string;
            }[];
          } = await addrRes.json();
          const places: SavedPlace[] = (data.addresses ?? [])
            .map((a) => ({
              id: a.id,
              label: a.label,
              address: a.address,
              lat: parseFloat(a.lat),
              lng: parseFloat(a.lng),
            }))
            .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
          if (active) setSavedPlaces(places);
        }

        if (ridesRes.ok) {
          const data: {
            data?: {
              ride_id: string;
              destination_address: string | null;
              destination_latitude: string | null;
              destination_longitude: string | null;
              status: string;
            }[];
          } = await ridesRes.json();
          const seen = new Set<string>();
          const places: SavedPlace[] = [];
          for (const r of data.data ?? []) {
            if (!r.destination_address || r.status !== "completed") continue;
            if (seen.has(r.destination_address)) continue;
            const lat = r.destination_latitude
              ? parseFloat(r.destination_latitude)
              : NaN;
            const lng = r.destination_longitude
              ? parseFloat(r.destination_longitude)
              : NaN;
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            seen.add(r.destination_address);
            places.push({
              id: r.ride_id,
              label: "Recent",
              address: r.destination_address,
              lat,
              lng,
            });
            if (places.length >= 5) break;
          }
          if (active) setRecentPlaces(places);
        }
      } catch (e) {
        logger.error("[home] saved/recent fetch failed", e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // ── Fetch estimates when both coords valid ─────────────────────
  const fetchEstimates = useCallback(async () => {
    if (!pickupCoords || !dropoffCoords) return;
    if (pickupCoords.lat === 0 || dropoffCoords.lat === 0) return;

    const cached = getCachedEstimates(
      pickupCoords.lat,
      pickupCoords.lng,
      dropoffCoords.lat,
      dropoffCoords.lng,
    );
    if (cached) {
      setEstimates(cached);
      return;
    }

    setEstimateLoading(true);
    setEstimateError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`${API_URL}/api/ride/estimate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          pickup_lat: pickupCoords.lat,
          pickup_lng: pickupCoords.lng,
          dropoff_lat: dropoffCoords.lat,
          dropoff_lng: dropoffCoords.lng,
          stops: stops.length > 0 ? stops : undefined,
        }),
      });
      const data = await res.json();
      if (data.estimates) {
        setEstimates(data.estimates);
        setCachedEstimates(
          pickupCoords.lat,
          pickupCoords.lng,
          dropoffCoords.lat,
          dropoffCoords.lng,
          data.estimates,
        );
      } else if (data.error) {
        setEstimateError(data.message || data.error);
      }
    } catch {
      setEstimateError("Failed to fetch estimates");
    } finally {
      setEstimateLoading(false);
    }
  }, [pickupCoords, dropoffCoords, stops]);

  useEffect(() => {
    if (hasRoute) fetchEstimates();
  }, [hasRoute, fetchEstimates]);

  // ── Fetch vehicle markers for map ──────────────────────────────
  useEffect(() => {
    if (!pickupCoords || bookingStep !== "FARES" || !selectedCategory) return;
    let active = true;
    const fetchMarkers = async () => {
      try {
        // Pick the first vehicle type in the category for marker query
        const typeKey = getTypesForCategory(selectedCategory)[0];
        if (!typeKey) return;
        const res = await fetch(`${API_URL}/api/ride/nearby-markers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: pickupCoords.lat,
            lng: pickupCoords.lng,
            vehicle_type: typeKey,
          }),
        });
        if (!res.ok || !active) return;
        const data = await res.json();
        if (active) setVehicleMarkers(data.markers ?? []);
      } catch {
        // non-blocking
      }
    };
    fetchMarkers();
    const id = setInterval(fetchMarkers, 30_000);
    return () => { active = false; clearInterval(id); };
  }, [pickupCoords, bookingStep, selectedCategory]);

  // ── Fetch nearby driver count + pickup ETA ─────────────────────
  useEffect(() => {
    if (!pickupCoords || bookingStep !== "FARES" || !selectedCategory) {
      setPickupEta(null);
      setNearbyCount(0);
      return;
    }
    let active = true;
    const fetchNearby = async () => {
      try {
        const typeKey = getTypesForCategory(selectedCategory)[0];
        if (!typeKey) return;
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? "";
        const res = await fetch(`${API_URL}/api/ride/nearby-drivers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            pickup_lat: pickupCoords.lat,
            pickup_lng: pickupCoords.lng,
            vehicle_type: typeKey,
          }),
        });
        if (!res.ok || !active) return;
        const data = await res.json();
        if (active) {
          setPickupEta(data.estimated_wait_minutes ?? null);
          setNearbyCount(data.count ?? 0);
        }
      } catch {
        // non-blocking
      }
    };
    fetchNearby();
    const id = setInterval(fetchNearby, 30_000);
    return () => { active = false; clearInterval(id); };
  }, [pickupCoords?.lat, pickupCoords?.lng, bookingStep, selectedCategory]);

  // Clear markers when leaving FARES
  useEffect(() => {
    if (bookingStep === "LOCATIONS") setVehicleMarkers([]);
  }, [bookingStep]);

  // ── Fetch route geometry for map line ──────────────────────────
  useEffect(() => {
    if (!pickupCoords || !dropoffCoords || !hasRoute) {
      setRouteGeo(null);
      return;
    }
    let active = true;
    (async () => {
      const geo = await fetchRouteGeometry(
        pickupCoords.lat,
        pickupCoords.lng,
        dropoffCoords.lat,
        dropoffCoords.lng,
      );
      if (active) setRouteGeo(geo);
    })();
    return () => { active = false; };
  }, [pickupCoords?.lat, pickupCoords?.lng, dropoffCoords?.lat, dropoffCoords?.lng, hasRoute]);

  // Clear route when leaving LOCATIONS
  useEffect(() => {
    if (bookingStep === "LOCATIONS" && !hasRoute) setRouteGeo(null);
  }, [bookingStep, hasRoute]);

  // Auto-select first vehicle when estimates load (no selection yet)
  useEffect(() => {
    if (bookingStep === "FARES" && categoryEstimates.length > 0 && !selectedVehicleType) {
      setSelectedVehicleType(categoryEstimates[0].vehicle_type as VehicleTypeEnum);
    }
  }, [bookingStep, categoryEstimates, selectedVehicleType]);

  // ── Map press handler (select on map) ────────────────────────
  const handleMapPress = useCallback(async (coords: { lat: number; lng: number }) => {
    setMapPinCoords(coords);
    setMapPinLoading(true);
    setMapPinAddress("");
    try {
      const BARIKOI_KEY = process.env.EXPO_PUBLIC_BARIKOI_API_KEY ?? "";
      const res = await fetch(
        `https://barikoi.xyz/v1/api/geocode/reverse/${BARIKOI_KEY}?lon=${coords.lng}&lat=${coords.lat}`,
      );
      if (res.ok) {
        const data = await res.json();
        setMapPinAddress(data.address || data.name || "");
      }
    } catch {
      // non-blocking
    } finally {
      setMapPinLoading(false);
    }
  }, []);

  // ── Save place handler ─────────────────────────────────────────
  const handleSavePlace = useCallback(async () => {
    if (!savePlaceLabel.trim() || !destination) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      await fetch(`${API_URL}/api/rider/addresses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          label: savePlaceLabel.trim(),
          address: destination.address,
          lat: destination.lat,
          lng: destination.lng,
          is_favorite: true,
        }),
      });
      setShowSavePlace(false);
      setSavePlaceLabel("");
      Alert.alert("Saved", `${savePlaceLabel.trim()} saved to your places`);
    } catch {
      Alert.alert("Error", "Could not save place");
    }
  }, [savePlaceLabel, destination]);

  // ── Navigation handlers ────────────────────────────────────────
  const handleLocationSelect = useCallback(
    (
      location: { latitude: number; longitude: number; address: string },
      type: "from" | "to",
    ) => {
      if (type === "from") {
        setPickup({
          id: "pickup",
          label: "Pickup",
          address: location.address,
          lat: location.latitude,
          lng: location.longitude,
        });
        setPickupCoords({ lat: location.latitude, lng: location.longitude });
        setUserLocation({
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address,
        });
      } else {
        setDestination({
          id: "dest",
          label: "Destination",
          address: location.address,
          lat: location.latitude,
          lng: location.longitude,
        });
        setDropoffCoords({ lat: location.latitude, lng: location.longitude });
        setDestinationLocation({
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address,
        });
      }
    },
    [],
  );

  const handleMapPinConfirm = useCallback(
    (type: "from" | "to") => {
      if (!mapPinCoords) return;
      handleLocationSelect(
        {
          latitude: mapPinCoords.lat,
          longitude: mapPinCoords.lng,
          address: mapPinAddress || `${mapPinCoords.lat.toFixed(4)}, ${mapPinCoords.lng.toFixed(4)}`,
        },
        type,
      );
      setMapPinCoords(null);
      setMapPinAddress("");
    },
    [mapPinCoords, mapPinAddress, handleLocationSelect],
  );

  const handleNext = useCallback(() => {
    setBookingStep("FARES");
    sheetRef.current?.snapToIndex(1);
    fetchEstimates();
  }, [fetchEstimates]);

  const handleCallForRide = useCallback(async () => {
    if (!pickupCoords || !dropoffCoords || !selectedVehicleType) return;
    setRequesting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        Alert.alert("Error", "Not authenticated");
        return;
      }

      const res = await fetch(`${API_URL}/api/ride/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pickup_lat: pickupCoords.lat,
          pickup_lng: pickupCoords.lng,
          pickup_address: pickup?.address || "",
          dropoff_lat: dropoffCoords.lat,
          dropoff_lng: dropoffCoords.lng,
          dropoff_address: destination?.address || "",
          vehicle_type: selectedVehicleType,
          stops: stops.length > 0 ? stops : undefined,
          selected_discount_type: selectedPromo?.type || "none",
          selected_discount_amount_bdt: selectedPromo?.amount_bdt || 0,
        }),
      });
      const data = await res.json();
      if (data.ride_id) {
        setRiderPickup(
          pickup?.address || "",
          pickupCoords.lat,
          pickupCoords.lng,
        );
        setRiderDropoff(
          destination?.address || "",
          dropoffCoords.lat,
          dropoffCoords.lng,
        );
        setRiderVehicleType(selectedVehicleType);
        setSearchingRideId(data.ride_id);
        setRideStatus("finding");
        router.push("/(main)/(customer)/finding-driver");
      } else {
        Alert.alert(
          "Request Failed",
          data.message || data.error || "Could not find a driver",
        );
      }
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Network error",
      );
    } finally {
      setRequesting(false);
    }
  }, [
    pickupCoords,
    dropoffCoords,
    selectedVehicleType,
    pickup,
    destination,
    stops,
    selectedPromo,
  ]);

  // ── Backdrop ───────────────────────────────────────────────────
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={0}
        appearsOnIndex={1}
        opacity={0.4}
        pressBehavior="none"
      />
    ),
    [],
  );

  // ── RENDER: LOCATIONS ──────────────────────────────────────────
  const renderLocations = () => (
    <BottomSheetScrollView
      style={styles.sheetContent}
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      {/* FROM */}
      <TouchableOpacity
        style={[
          styles.inputRow,
          { borderColor, backgroundColor: surfaceBg },
        ]}
        onPress={() =>
          router.push({
            pathname: "/(main)/(customer)/autocomplete",
            params: { type: "from" },
          })
        }
      >
        <Ionicons name="locate-outline" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.inputLabel, { color: textSecondary }]}>
            Pickup
          </Text>
          <Text
            style={[styles.inputValue, { color: textPrimary }]}
            numberOfLines={1}
          >
            {pickup?.address || "Current location"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={textDisabled} />
      </TouchableOpacity>

      {/* Connector */}
      <View style={[styles.connector, { borderColor }]} />

      {/* Stops (between pickup and where-to) */}
      {stops.map((stop, i) => (
        <View key={`stop-${i}`}>
          <TouchableOpacity
            style={[
              styles.inputRow,
              { borderColor, backgroundColor: surfaceBg },
            ]}
            onPress={() =>
              router.push({
                pathname: "/(main)/(customer)/autocomplete",
                params: { type: "stop", stopIndex: String(i) },
              })
            }
          >
            <Ionicons name="flag" size={20} color={colors.amber} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.inputLabel, { color: textSecondary }]}>Stop {i + 1}</Text>
              <Text
                style={[styles.inputValue, { color: stop.address ? textPrimary : textDisabled }]}
                numberOfLines={1}
              >
                {stop.address || "Add stop"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                const next = [...stops];
                next.splice(i, 1);
                setStops(next);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={textDisabled} />
            </TouchableOpacity>
          </TouchableOpacity>
          <View style={[styles.connector, { borderColor }]} />
        </View>
      ))}

      {stops.length < 2 && (
        <TouchableOpacity
          style={styles.addStopBtn}
          onPress={() => setStops([...stops, { lat: 0, lng: 0, address: "" }])}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={[styles.addStopText, { color: colors.primary }]}>Add Stop</Text>
        </TouchableOpacity>
      )}

      {stops.length > 0 && <View style={[styles.connector, { borderColor }]} />}

      {/* TO (Where to?) */}
      <TouchableOpacity
        style={[styles.inputRow, { borderColor, backgroundColor: surfaceBg }]}
        onPress={() =>
          router.push({ pathname: "/(main)/(customer)/autocomplete", params: { type: "to" } })
        }
      >
        <Ionicons name="location" size={20} color={colors.danger} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.inputLabel, { color: textSecondary }]}>Where to?</Text>
          <Text
            style={[styles.inputValue, { color: destination ? textPrimary : textDisabled }]}
            numberOfLines={1}
          >
            {destination?.address || "Enter destination"}
          </Text>
        </View>
        {destination && (
          <TouchableOpacity
            onPress={() => setShowSavePlace(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="bookmark-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        )}
        <Ionicons name="chevron-forward" size={16} color={textDisabled} />
      </TouchableOpacity>

      {/* Saved places pills */}
      {savedPlaces.length > 0 && (
        <>
          <Text
            style={[styles.sectionLabel, { color: textSecondary, marginTop: 20 }]}
          >
            Saved places
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {savedPlaces.map((place) => (
              <TouchableOpacity
                key={place.id}
                style={[
                  styles.savedPill,
                  { backgroundColor: surfaceBg, borderColor },
                ]}
                onPress={() =>
                  handleLocationSelect(
                    {
                      latitude: place.lat,
                      longitude: place.lng,
                      address: place.address,
                    },
                    "to",
                  )
                }
              >
                <Ionicons
                  name={
                    place.label === "Home"
                      ? "home"
                      : place.label === "Work"
                        ? "briefcase"
                        : "location"
                  }
                  size={16}
                  color={colors.primary}
                />
                <Text style={[styles.savedPillText, { color: textPrimary }]}>
                  {place.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {/* Recent destinations */}
      {recentPlaces.length > 0 && (
        <>
          <Text
            style={[styles.sectionLabel, { color: textSecondary, marginTop: 20 }]}
          >
            Recent
          </Text>
          {recentPlaces.map((place) => (
            <TouchableOpacity
              key={place.id}
              style={[styles.recentRow, { borderBottomColor: borderColor }]}
              onPress={() =>
                handleLocationSelect(
                  {
                    latitude: place.lat,
                    longitude: place.lng,
                    address: place.address,
                  },
                  "to",
                )
              }
            >
              <Ionicons name="time-outline" size={18} color={textSecondary} />
              <Text
                style={[styles.recentText, { color: textPrimary }]}
                numberOfLines={1}
              >
                {place.address}
              </Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* Select on map button */}
      <TouchableOpacity
        style={[styles.selectOnMapBtn, { borderColor, backgroundColor: surfaceBg }]}
        onPress={() => {
          // Place pin at pickup location (or Dhaka default) so user can pan to adjust
          const center = pickupCoords ?? { lat: 23.8103, lng: 90.4125 };
          setMapPinCoords(center);
          setMapPinAddress("");
          setMapPinLoading(true);
          // Reverse geocode the center
          (async () => {
            try {
              const BARIKOI_KEY = process.env.EXPO_PUBLIC_BARIKOI_API_KEY ?? "";
              const res = await fetch(
                `https://barikoi.xyz/v1/api/geocode/reverse/${BARIKOI_KEY}?lon=${center.lng}&lat=${center.lat}`,
              );
              if (res.ok) {
                const data = await res.json();
                setMapPinAddress(data.address || data.name || "");
              }
            } catch {
              // non-blocking
            } finally {
              setMapPinLoading(false);
            }
          })();
        }}
      >
        <Ionicons name="map-outline" size={20} color={colors.primary} />
        <Text style={[styles.selectOnMapText, { color: colors.primary }]}>Select on map</Text>
      </TouchableOpacity>

      {/* Next button */}
      <TouchableOpacity
        style={[
          styles.nextBtn,
          {
            backgroundColor: hasRoute ? colors.primary : textDisabled,
            opacity: hasRoute ? 1 : 0.5,
          },
        ]}
        onPress={handleNext}
        disabled={!hasRoute}
      >
        <Text style={styles.nextBtnText}>Next</Text>
      </TouchableOpacity>
    </BottomSheetScrollView>
  );

  // ── RENDER: FARES ──────────────────────────────────────────────
  const renderFares = () => (
    <BottomSheetScrollView
      style={styles.sheetContent}
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      {/* Back button */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => {
          setBookingStep("LOCATIONS");
          sheetRef.current?.snapToIndex(0);
        }}
      >
        <Ionicons name="arrow-back" size={22} color={textPrimary} />
        <Text style={[styles.backBtnText, { color: textPrimary }]}>
          Edit route
        </Text>
      </TouchableOpacity>

      {/* Category switcher pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, marginBottom: 16 }}
      >
        {VEHICLE_CATEGORIES.map((cat) => {
          const label = language === "bn" ? cat.display_bn : cat.display_en;
          const isActive = selectedCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              style={[
                styles.catPill,
                {
                  backgroundColor: isActive
                    ? colors.primary
                    : surfaceBg,
                  borderColor: isActive ? colors.primary : borderColor,
                },
              ]}
              onPress={() => {
                setSelectedCategory(cat.key as VehicleCategory);
                setSelectedVehicleType(null);
              }}
            >
              <Ionicons
                name={cat.icon}
                size={16}
                color={isActive ? colors.white : textSecondary}
              />
              <Text
                style={[
                  styles.catPillText,
                  { color: isActive ? colors.white : textPrimary },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Estimate loading / error / results */}
      {estimateLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.mutedText, { color: textSecondary }]}>
            Calculating fares...
          </Text>
        </View>
      ) : estimateError ? (
        <View style={styles.centerBox}>
          <Ionicons name="warning-outline" size={40} color={colors.amber} />
          <Text style={[styles.mutedText, { color: textSecondary }]}>
            {estimateError}
          </Text>
          <TouchableOpacity onPress={fetchEstimates}>
            <Text
              style={{
                color: colors.primary,
                fontFamily: "Jakarta-SemiBold",
                marginTop: 12,
              }}
            >
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : categoryEstimates.length > 0 ? (
        <>
          {/* Estimated fare header */}
          <Text style={[styles.fareHeader, { color: textPrimary }]}>
            Estimated fare
          </Text>
          {nearbyCount > 0 && (
            <Text style={[styles.vehicleRowSub, { color: textSecondary, marginTop: -8, marginBottom: 12 }]}>          
              {nearbyCount} driver{nearbyCount !== 1 ? 's' : ''} nearby{pickupEta != null ? ` · ~${pickupEta} min pickup` : ''}
            </Text>
          )}

          {/* Vehicle cards */}
          <View style={{ gap: 10 }}>
            {categoryEstimates.map((est) => {
              const def = VEHICLE_TYPES.find(
                (v) => v.key === est.vehicle_type,
              );
              const isSelected = selectedVehicleType === est.vehicle_type;
              const icon = VEHICLE_ICONS[est.vehicle_type] || "car";
              return (
                <TouchableOpacity
                  key={est.vehicle_type}
                  style={[
                    styles.vehicleRow,
                    {
                      backgroundColor: isSelected
                        ? isDark
                          ? colors.primaryLightDark
                          : colors.primaryLight
                        : surfaceBg,
                      borderColor: isSelected ? colors.primary : borderColor,
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}
                  onPress={() =>
                    setSelectedVehicleType(est.vehicle_type as VehicleTypeEnum)
                  }
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={icon}
                    size={28}
                    color={isSelected ? colors.primary : textPrimary}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text
                      style={[
                        styles.vehicleRowName,
                        { color: textPrimary },
                      ]}
                    >
                      {def?.display_en || est.vehicle_type}
                    </Text>
                    <Text
                      style={[
                        styles.vehicleRowSub,
                        { color: textSecondary },
                      ]}
                    >
                      {est.distance_km != null ? `${est.distance_km.toFixed(1)} km` : ''}{' · '}{est.eta_minutes} min trip{' · '}{est.seats} seats
                    </Text>
                    {pickupEta != null && (
                      <Text
                        style={[styles.vehicleRowSub, { color: colors.primary, marginTop: 2 }]}
                      >
                        ~{pickupEta} min pickup
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.vehicleRowPrice,
                      { color: isSelected ? colors.primary : textPrimary },
                    ]}
                  >
                    ৳{(est.total_bdt / 100).toFixed(0)}
                  </Text>
                  {isSelected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={colors.primary}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : (
        <View style={styles.centerBox}>
          <Text style={[styles.mutedText, { color: textSecondary }]}>
            No vehicles available for this route
          </Text>
        </View>
      )}

      {/* Promo/Voucher */}
      {selectedEstimate?.available_discounts &&
        selectedEstimate.available_discounts.length > 0 && (
          <>
            <Text
              style={[styles.fareHeader, { color: textPrimary, marginTop: 20 }]}
            >
              Promos & Vouchers
            </Text>
            <View style={{ gap: 8 }}>
              {selectedEstimate.available_discounts.map((d) => {
                const isSelected =
                  selectedPromo?.type === d.type &&
                  selectedPromo?.amount_bdt === d.amount_bdt;
                return (
                  <TouchableOpacity
                    key={d.type}
                    style={[
                      styles.vehicleRow,
                      {
                        backgroundColor: isSelected
                          ? isDark
                            ? colors.primaryLightDark
                            : colors.primaryLight
                          : surfaceBg,
                        borderColor: isSelected ? colors.primary : borderColor,
                      },
                    ]}
                    onPress={() =>
                      setSelectedPromo(isSelected ? null : d)
                    }
                  >
                    <Ionicons
                      name="ticket-outline"
                      size={22}
                      color={isSelected ? colors.primary : textSecondary}
                    />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ color: textPrimary, fontFamily: "Jakarta-SemiBold", fontSize: 14 }}>
                        {d.description}
                      </Text>
                      <Text style={{ color: textSecondary, fontSize: 12 }}>
                        {d.percent
                          ? `${d.percent}% off`
                          : `৳${(d.amount_bdt / 100).toFixed(0)} off`}
                      </Text>
                    </View>
                    <Ionicons
                      name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                      size={22}
                      color={isSelected ? colors.primary : textDisabled}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

      {/* Call for Ride button */}
      <TouchableOpacity
        style={[
          styles.callBtn,
          {
            backgroundColor: selectedVehicleType
              ? colors.primary
              : textDisabled,
            opacity: selectedVehicleType ? 1 : 0.5,
          },
        ]}
        onPress={handleCallForRide}
        disabled={!selectedVehicleType || requesting}
      >
        {requesting ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Text style={styles.callBtnText}>
            Call for {vehicleDef?.display_en || "Ride"} · ৳
            {selectedEstimate
              ? (selectedEstimate.total_bdt / 100).toFixed(0)
              : "—"}
          </Text>
        )}
      </TouchableOpacity>
    </BottomSheetScrollView>
  );

  // ── Main render ────────────────────────────────────────────────
  const snapIndex = bookingStep === "LOCATIONS" ? 0 : 1;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SosBanner />
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? "light-content" : "dark-content"}
      />

      {/* Map (full screen background) */}
      <View style={StyleSheet.absoluteFill}>
        <Map route={routeGeo ?? undefined} vehicleMarkers={vehicleMarkers} onMapPress={handleMapPress} />
      </View>

      {/* Map pin overlay — shown when user taps the map */}
      {mapPinCoords && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Center pin */}
          <View style={styles.mapPinContainer}>
            <View style={[styles.mapPinDot, { backgroundColor: colors.primary }]} />
            <View style={[styles.mapPinShadow, { backgroundColor: colors.primary + '30' }]} />
          </View>

          {/* Choice buttons at bottom */}
          <View style={styles.mapPinActions}>
            <Text style={[styles.mutedText, { color: textSecondary, marginBottom: 8 }]}>
              {mapPinLoading ? "Getting address..." : mapPinAddress || "Tap a location"}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={[styles.mapPinBtn, { backgroundColor: colors.primary }]}
                onPress={() => handleMapPinConfirm("from")}
              >
                <Ionicons name="locate-outline" size={18} color={colors.white} />
                <Text style={styles.mapPinBtnText}>Set as Pickup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mapPinBtn, { backgroundColor: colors.danger }]}
                onPress={() => handleMapPinConfirm("to")}
              >
                <Ionicons name="location" size={18} color={colors.white} />
                <Text style={styles.mapPinBtnText}>Set as Destination</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => { setMapPinCoords(null); setMapPinAddress(""); }}
              style={{ marginTop: 8 }}
            >
              <Text style={{ color: textSecondary, fontFamily: "Jakarta-SemiBold", fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Theme toggle */}
      <TouchableOpacity
        style={[
          styles.themeToggle,
          { backgroundColor: surfaceBg, borderColor },
        ]}
        onPress={() => setTheme(isDark ? "light" : "dark")}
      >
        <Ionicons
          name={isDark ? "sunny-outline" : "moon-outline"}
          size={20}
          color={textPrimary}
        />
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <BottomSheet
        ref={sheetRef}
        index={snapIndex}
        snapPoints={SNAP_POINTS}
        onChange={() => {}}
        enablePanDownToClose={false}
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{
          backgroundColor: borderColor,
          width: 36,
          height: 5,
        }}
        handleStyle={{
          backgroundColor: surfaceBg,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
        }}
      >
        {bookingStep === "LOCATIONS" && renderLocations()}
        {bookingStep === "FARES" && renderFares()}
      </BottomSheet>

      {/* Save Place Modal */}
      {showSavePlace && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 200,
            },
          ]}
        >
          <View
            style={[
              {
                width: "85%",
                backgroundColor: surfaceBg,
                borderRadius: 16,
                padding: 24,
                borderWidth: 1,
                borderColor,
              },
            ]}
          >
            <Text style={[styles.fareHeader, { marginBottom: 16 }]}>
              Save this place
            </Text>
            {/* Quick labels */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {["Home", "Work"].map((label) => (
                <TouchableOpacity
                  key={label}
                  style={[
                    styles.savedPill,
                    {
                      backgroundColor:
                        savePlaceLabel === label ? colors.primary : surfaceBg,
                      borderColor: savePlaceLabel === label ? colors.primary : borderColor,
                    },
                  ]}
                  onPress={() => setSavePlaceLabel(label)}
                >
                  <Ionicons
                    name={label === "Home" ? "home" : "briefcase"}
                    size={16}
                    color={savePlaceLabel === label ? colors.white : textPrimary}
                  />
                  <Text
                    style={{
                      color: savePlaceLabel === label ? colors.white : textPrimary,
                      fontFamily: "Jakarta-SemiBold",
                      fontSize: 13,
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Custom label input */}
            <View
              style={[
                styles.inputRow,
                { borderColor, backgroundColor: surfaceBg, marginBottom: 16 },
              ]}
            >
              <Ionicons name="pencil" size={18} color={textSecondary} />
              <View style={{ flex: 1 }}>
                <TextInput
                  style={{
                    color: textPrimary,
                    fontFamily: "Jakarta-Regular",
                    fontSize: 15,
                    padding: 0,
                  }}
                  placeholder="Custom label (e.g., Gym, School)"
                  placeholderTextColor={textDisabled}
                  value={savePlaceLabel}
                  onChangeText={setSavePlaceLabel}
                />
              </View>
            </View>
            {/* Destination preview */}
            <Text
              style={[styles.mutedText, { color: textSecondary, textAlign: "left", marginTop: 0, marginBottom: 16 }]}
              numberOfLines={2}
            >
              {destination?.address}
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                style={[styles.nextBtn, { flex: 1, backgroundColor: surfaceBg, borderWidth: 1, borderColor }]}
                onPress={() => {
                  setShowSavePlace(false);
                  setSavePlaceLabel("");
                }}
              >
                <Text style={[styles.nextBtnText, { color: textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextBtn, { flex: 1, backgroundColor: savePlaceLabel.trim() ? colors.primary : textDisabled }]}
                onPress={handleSavePlace}
                disabled={!savePlaceLabel.trim()}
              >
                <Text style={styles.nextBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </GestureHandlerRootView>
  );
}

// ── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  sheetContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  inputLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
  },
  inputValue: {
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
  },
  connector: {
    width: 2,
    height: 16,
    borderLeftWidth: 2,
    borderStyle: "dashed",
    marginLeft: 25,
    marginVertical: 2,
  },
  addStopBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 6,
  },
  addStopText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
  },
  sectionLabel: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  savedPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
  },
  savedPillText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    flex: 1,
  },
  selectOnMapBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginTop: 16,
  },
  selectOnMapText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
  },
  nextBtn: {
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  nextBtnText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  backBtnText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  catPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
  },
  catPillText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  fareHeader: {
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
    marginBottom: 12,
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  vehicleRowName: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  vehicleRowSub: {
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    marginTop: 2,
  },
  vehicleRowPrice: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
  },
  callBtn: {
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  callBtnText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  mutedText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  themeToggle: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    borderWidth: 1,
  },
  mapPinContainer: {
    position: "absolute",
    top: "45%",
    left: "50%",
    marginLeft: -8,
    marginTop: -8,
    alignItems: "center",
    justifyContent: "center",
  },
  mapPinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    zIndex: 2,
  },
  mapPinShadow: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    top: -8,
    left: -8,
    zIndex: 1,
  },
  mapPinActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  mapPinBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  mapPinBtnText: {
    color: "#FFFFFF",
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
});
