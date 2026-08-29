import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  StatusBar,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { GestureHandlerRootView, Gesture, GestureDetector } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import Map from "@/components/Map";
import { useCustomer } from "@/store";
import { useRiderStore } from "@/store/useRiderStore";
import { supabase } from "@/lib/supabase";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";
import { getVehicleTypesByCategory, getVehicleType, VEHICLE_CATEGORIES, VEHICLE_TYPES, VehicleTypeEnum, VehicleIconName, VehicleCategoryDef } from "@/lib/vehicleTypes";
import { colors, shadows } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import FareBreakdownSheet from "@/components/FareBreakdownSheet";
import CustomButton from "@/components/CustomButton";
import BarikoiAutocomplete from "@/components/BarikoiAutocomplete";
import { icons } from "@/constants/data";

type HomeState = "idle" | "destination" | "pickup" | "vehicle" | "confirm";

type SheetSnap = "peek" | "half" | "full";

interface SheetSnapDef {
  snaps: SheetSnap[];
  percent: Partial<Record<SheetSnap, number>>;
}

// Custom sheet snap table (percent of window height). snaps[0] is the resting
// snap for the state, mirroring the previous BottomSheet index={0} behavior.
// No "finding" state: handoff to confirm-ride owns the search (audit H-3).
const SHEET_SNAPS: Record<HomeState, SheetSnapDef> = {
  idle: { snaps: ["peek", "half"], percent: { peek: 18, half: 30 } },
  destination: { snaps: ["full"], percent: { full: 92 } },
  pickup: { snaps: ["half"], percent: { half: 35 } },
  vehicle: { snaps: ["half", "full"], percent: { half: 50, full: 80 } },
  confirm: { snaps: ["half", "full"], percent: { half: 70, full: 90 } },
};

interface VehicleOption {
  key: VehicleTypeEnum;
  label: string;
  eta: number;
  fare: number;
  seats: number;
  hasAc: boolean | null;
  icon: VehicleIconName;
}

interface EstimateOption {
  vehicle_type: VehicleTypeEnum;
  display_en: string;
  display_bn: string;
  seats: number;
  total_bdt: number;
  eta_minutes: number;
}

interface SavedPlace {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
}

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

  const [homeState, setHomeState] = useState<HomeState>("idle");
  const [pickup, setPickup] = useState<SavedPlace | null>(null);
  const [destination, setDestination] = useState<SavedPlace | null>(null);
  // Real data (audit H-3): saved places from GET /api/rider/addresses,
  // recents from GET /api/ride/get-all — previously permanently-empty arrays.
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [recentPlaces, setRecentPlaces] = useState<SavedPlace[]>([]);
  const [destListTab, setDestListTab] = useState<"recent" | "saved">("recent");
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleTypeEnum | null>(null);
  const [fareBreakdown, setFareBreakdown] = useState<{ key: string; label: string; eta: number; fare: number; seats: number; hasAc: boolean | null; icon: VehicleIconName; total_bdt?: number } | null>(null);
  const [loadingFare, setLoadingFare] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const isDark = useIsDark();
  const { language, setTheme } = useAppearance();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const { userLatitude, userLongitude, userAddress, setUserLocation, setDestinationLocation } = useCustomer();
  const { setPickup: setRiderPickup, setDropoff: setRiderDropoff, setPickupCoords, setDropoffCoords, setSelectedVehicleType } = useRiderStore();

  // Rebook prefill: rides / ride-detail push rebook_* params; home honors them by
  // prefilling pickup + destination (with real coords) and jumping to pickup confirm.
  useEffect(() => {
    if (!rebook_origin || !rebook_dest) return;
    const parseCoord = (v?: string): number | null => {
      const n = v ? parseFloat(v) : NaN;
      return Number.isFinite(n) && n !== 0 ? n : null;
    };
    const originLat = parseCoord(rebook_origin_lat);
    const originLng = parseCoord(rebook_origin_lng);
    const destLat = parseCoord(rebook_dest_lat);
    const destLng = parseCoord(rebook_dest_lng);
    // Stale link without coords — fall through to the normal flow.
    if (originLat === null || originLng === null || destLat === null || destLng === null) return;
    setPickup({
      id: "rebook-pickup",
      label: "Pickup",
      address: rebook_origin,
      lat: originLat,
      lng: originLng,
    });
    setDestination({
      id: "rebook-dest",
      label: "Destination",
      address: rebook_dest,
      lat: destLat,
      lng: destLng,
    });
    setDestinationLocation({ latitude: destLat, longitude: destLng, address: rebook_dest });
    setHomeState("pickup");
  }, [
    rebook_origin,
    rebook_dest,
    rebook_origin_lat,
    rebook_origin_lng,
    rebook_dest_lat,
    rebook_dest_lng,
    setDestinationLocation,
  ]);

  const { height: windowHeight } = useWindowDimensions();
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("peek");
  const sheetHeight = useSharedValue(0);
  const sheetTranslateY = useSharedValue(0);
  const dragStartTranslateY = useSharedValue(0);

  const snapDef = SHEET_SNAPS[homeState];
  const sheetMaxHeight = (Math.max(...snapDef.snaps.map((s) => snapDef.percent[s] ?? 0)) / 100) * windowHeight;
  const snapTranslateYs = snapDef.snaps.map(
    (s) => sheetMaxHeight - ((snapDef.percent[s] ?? 0) / 100) * windowHeight
  );

  const snapTo = useCallback((snap: SheetSnap) => {
    setSheetSnap(snap);
  }, []);

  // Entering a booking state rests the sheet at that state's first snap,
  // matching the previous declarative snapPoints + index={0} behavior.
  useEffect(() => {
    setSheetSnap(SHEET_SNAPS[homeState].snaps[0]);
  }, [homeState]);

  useEffect(() => {
    const def = SHEET_SNAPS[homeState];
    const maxHeight = (Math.max(...def.snaps.map((s) => def.percent[s] ?? 0)) / 100) * windowHeight;
    const percent = def.percent[sheetSnap] ?? def.percent[def.snaps[0]] ?? 0;
    sheetHeight.value = withTiming(maxHeight, { duration: 250 });
    sheetTranslateY.value = withTiming(maxHeight - (percent / 100) * windowHeight, { duration: 250 });
  }, [homeState, sheetSnap, windowHeight, sheetHeight, sheetTranslateY]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    height: sheetHeight.value,
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const sheetPanGesture = Gesture.Pan()
    .minDistance(4)
    .onStart(() => {
      dragStartTranslateY.value = sheetTranslateY.value;
    })
    .onUpdate((event) => {
      const minTranslateY = Math.min(...snapTranslateYs);
      const maxTranslateY = Math.max(...snapTranslateYs);
      const next = dragStartTranslateY.value + event.translationY;
      sheetTranslateY.value = Math.min(Math.max(next, minTranslateY), maxTranslateY);
    })
    .onEnd(() => {
      let nearest = snapTranslateYs[0];
      for (const target of snapTranslateYs) {
        if (Math.abs(target - sheetTranslateY.value) < Math.abs(nearest - sheetTranslateY.value)) {
          nearest = target;
        }
      }
      sheetTranslateY.value = withTiming(nearest, { duration: 200 });
      const snapIndex = snapTranslateYs.indexOf(nearest);
      if (snapIndex >= 0) {
        runOnJS(snapTo)(snapDef.snaps[snapIndex]);
      }
    });

  useEffect(() => {
    if (userLatitude && userLongitude && !pickup) {
      setPickup({
        id: "current",
        label: "Current Location",
        address: userAddress || "Current Location",
        lat: userLatitude,
        lng: userLongitude,
      });
    }
  }, [userLatitude, userLongitude, userAddress]);

  // Audit H-3: populate saved + recent destinations with real data. Saved
  // places come from the rider's address book; recents are deduped dropoffs
  // of completed rides. Both lists were permanently empty before, which left
  // the destination state with nothing to tap.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };

        const [addrRes, ridesRes] = await Promise.all([
          fetch(`${API_URL}/api/rider/addresses`, { headers }),
          fetch(`${API_URL}/api/ride/get-all`, { headers }),
        ]);
        if (!active) return;

        if (addrRes.ok) {
          const data: { addresses?: { id: string; label: string; address: string; lat: string; lng: string }[] } = await addrRes.json();
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
            const lat = r.destination_latitude ? parseFloat(r.destination_latitude) : NaN;
            const lng = r.destination_longitude ? parseFloat(r.destination_longitude) : NaN;
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            seen.add(r.destination_address);
            places.push({ id: r.ride_id, label: "Recent", address: r.destination_address, lat, lng });
            if (places.length >= 5) break;
          }
          if (active) setRecentPlaces(places);
        }
      } catch (e) {
        logger.error("[home] saved/recent destinations fetch failed", e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const fetchEstimate = useCallback(async () => {
    if (!pickup || !destination) return;
    setLoadingFare(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const body = {
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_lat: destination.lat,
        dropoff_lng: destination.lng,
        // Stops belong to confirm-ride's sheet (L14 caps at 2) — home's
        // dead stop inputs were deleted (audit H-3).
        stops: [],
      };
      const res = await fetch(`${API_URL}/api/ride/estimate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const rawService = service ?? "car";
      const serviceKey = VEHICLE_CATEGORIES.some((c) => c.key === rawService) ? rawService : "car";
      const categoryKeys = getVehicleTypesByCategory(serviceKey as VehicleCategoryDef["key"]);
      const estimates: EstimateOption[] = data.estimates || [];
      const options: VehicleOption[] = categoryKeys
        .map((def) => estimates.find((e) => e.vehicle_type === def.key))
        .filter((e): e is { vehicle_type: VehicleTypeEnum; display_en: string; display_bn: string; seats: number; total_bdt: number; eta_minutes: number } => !!e)
        .map((e) => {
          const def = VEHICLE_TYPES.find((v) => v.key === e.vehicle_type);
          return {
            key: e.vehicle_type,
            label: language === "bn" ? (e.display_bn ?? def?.display_bn ?? e.vehicle_type) : (e.display_en ?? def?.display_en ?? e.vehicle_type),
            eta: e.eta_minutes || 5,
            fare: e.total_bdt || 0,
            seats: e.seats || 4,
            hasAc: def?.has_ac ?? null,
            icon: VEHICLE_ICONS[e.vehicle_type],
          };
        });
      setVehicleOptions(options);
      // Rebook preselect: honor the original ride's vehicle type when available
      // (rebookVehicleType is an untyped URL param — narrow it first).
      const rebookType = VEHICLE_TYPES.find((v) => v.key === rebookVehicleType)?.key;
      const preferred = options.find((o) => o.key === rebookType) ?? options[0];
      if (preferred) setSelectedVehicle(preferred.key);
      if (preferred) setFareBreakdown(preferred);
    } catch (e) {
      logger.error("[home] estimate failed", e);
    } finally {
      setLoadingFare(false);
    }
  }, [pickup, destination, service, rebookVehicleType]);

  const handleDestinationSelect = (loc: { latitude: number; longitude: number; address: string }) => {
    const place: SavedPlace = {
      id: `dest-${Date.now()}`,
      label: "Destination",
      address: loc.address,
      lat: loc.latitude,
      lng: loc.longitude,
    };
    setDestination(place);
    setDestinationLocation({ latitude: loc.latitude, longitude: loc.longitude, address: loc.address });
    setHomeState("pickup");
  };

  const handleVehicleSelect = (key: VehicleTypeEnum) => {
    setSelectedVehicle(key);
  };

  const handleBook = async () => {
    if (!pickup || !destination || !selectedVehicle) return;
    setRequesting(true);
    try {
      setRiderPickup(pickup.address, pickup.lat, pickup.lng);
      setRiderDropoff(destination.address, destination.lat, destination.lng);
      setPickupCoords({ lat: pickup.lat, lng: pickup.lng });
      setDropoffCoords({ lat: destination.lat, lng: destination.lng });
      setSelectedVehicleType(selectedVehicle);
      // Seed the coords confirm-ride reads (useCustomer) and hand off to the
      // real booking pipeline: confirm-ride POSTs /api/ride/request and
      // navigates to finding-driver itself on success. Previously this jumped
      // straight to finding-driver with no ride ever created — the fake-search
      // CTA that told riders "Drivers are busy" forever.
      setUserLocation({ latitude: pickup.lat, longitude: pickup.lng, address: pickup.address });
      setDestinationLocation({
        latitude: destination.lat,
        longitude: destination.lng,
        address: destination.address,
      });
      router.replace("/(main)/(customer)/confirm-ride");
    } catch (e) {
      logger.error("[home] book failed", e);
      Alert.alert("Error", "Could not request ride. Please try again.");
      setHomeState("confirm");
    } finally {
      setRequesting(false);
    }
  };

  const finalFare = useMemo(() => fareBreakdown?.total_bdt || 0, [fareBreakdown]);

  // ── RENDER: IDLE STATE ──
  const renderIdle = () => (
    <View style={[styles.sheetContent, { backgroundColor: surfaceBg }]}>
      <View style={[styles.handle, { backgroundColor: borderColor }]} />
      <TouchableOpacity
        style={[styles.whereToButton, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]}
        onPress={() => setHomeState("destination")}
      >
        <Ionicons name="search" size={18} color={textSecondary} />
        <Text style={[styles.whereToText, { color: textSecondary }]}>Where to?</Text>
      </TouchableOpacity>

      {/* Category chips with pre-highlight from service param */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
        <View style={styles.chipsRow}>
          {VEHICLE_CATEGORIES.map((cat) => {
            const label = language === "bn" ? cat.display_bn : cat.display_en;
            const isActive = service === cat.key;
            return (
              <View
                key={cat.key}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isActive ? colors.primaryLight : (isDark ? colors.darkSecondary : colors.gray100),
                    borderColor: isActive ? colors.primary : borderColor,
                    borderWidth: isActive ? 1.5 : 0,
                  },
                ]}
              >
                <Ionicons name={cat.icon} size={16} color={isActive ? colors.primary : textSecondary} />
                <Text style={[styles.chipText, { color: isActive ? colors.primary : textPrimary }]}>{label}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Quick chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
        <View style={styles.chipsRow}>
          {savedPlaces.slice(0, 3).map((place) => (
            <TouchableOpacity
              key={place.id}
              style={[styles.chip, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]}
              onPress={() => handleDestinationSelect({ latitude: place.lat, longitude: place.lng, address: place.address })}
            >
              <Ionicons
                name={place.label === "Home" ? "home" : place.label === "Work" ? "briefcase" : "location"}
                size={16}
                color={colors.primary}
              />
              <Text style={[styles.chipText, { color: textPrimary }]}>{place.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.chip, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]}
            onPress={() => setHomeState("destination")}
          >
            <Ionicons name="time" size={16} color={textSecondary} />
            <Text style={[styles.chipText, { color: textSecondary }]}>Recent</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );

  // ── RENDER: DESTINATION SELECTOR ──
  // Audit H-3: this state was cosmetically complete but functionally dead —
  // the TextInput had no handlers, the lists were permanently empty, and
  // "Select from map" did nothing. It now runs the same BarikoiAutocomplete
  // find-ride uses, over real saved/recent data. Stops are confirm-ride's
  // concern (L14); the map-select row was removed until a picker exists.
  const renderDestination = () => {
    const listPlaces = destListTab === "recent" ? recentPlaces : savedPlaces;
    return (
      <View style={[styles.sheetContent, { backgroundColor: surfaceBg }]}>
        <View style={styles.destHeader}>
          <TouchableOpacity onPress={() => setHomeState("idle")}>
            <Ionicons name="arrow-back" size={24} color={textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.destTitle, { color: textPrimary }]}>Where do you want to go?</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Pickup field */}
        <View style={[styles.inputRow, { borderColor: borderColor }]}>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.inputText, { color: textSecondary }]} numberOfLines={1}>
            {pickup?.address || "Your location"}
          </Text>
        </View>

        {/* Destination search — real Barikoi autocomplete (audit H-3) */}
        <BarikoiAutocomplete
          icon={icons.target}
          initialLocation=""
          handlePress={handleDestinationSelect}
        />

        {/* Recent / Saved tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, { borderBottomColor: destListTab === "recent" ? colors.primary : "transparent" }]}
            onPress={() => setDestListTab("recent")}
          >
            <Text style={[destListTab === "recent" ? styles.tabTextActive : styles.tabText, { color: destListTab === "recent" ? colors.primary : textSecondary }]}>Recent</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, { borderBottomColor: destListTab === "saved" ? colors.primary : "transparent" }]}
            onPress={() => setDestListTab("saved")}
          >
            <Text style={[destListTab === "saved" ? styles.tabTextActive : styles.tabText, { color: destListTab === "saved" ? colors.primary : textSecondary }]}>Saved</Text>
          </TouchableOpacity>
        </View>

        {/* Place list */}
        <ScrollView style={styles.placeList}>
          {listPlaces.map((place) => (
            <TouchableOpacity
              key={place.id}
              style={[styles.placeItem, { borderBottomColor: borderColor }]}
              onPress={() => handleDestinationSelect({ latitude: place.lat, longitude: place.lng, address: place.address })}
            >
              <View style={[styles.placeIcon, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]}>
                <Ionicons
                  name={destListTab === "saved" && place.label === "Home" ? "home" : destListTab === "saved" && place.label === "Work" ? "briefcase" : "time"}
                  size={18}
                  color={textSecondary}
                />
              </View>
              <View style={styles.placeInfo}>
                <Text style={[styles.placeName, { color: textPrimary }]}>{place.label}</Text>
                <Text style={[styles.placeAddress, { color: textSecondary }]} numberOfLines={1}>{place.address}</Text>
              </View>
            </TouchableOpacity>
          ))}
          {listPlaces.length === 0 && (
            <Text style={[styles.emptyText, { color: textSecondary }]}>
              {destListTab === "recent" ? "No recent destinations yet" : "No saved places yet"}
            </Text>
          )}
        </ScrollView>
      </View>
    );
  };

  // ── RENDER: PICKUP CONFIRM ──
  const renderPickup = () => (
    <View style={[styles.sheetContent, { backgroundColor: surfaceBg }]}>
      <View style={styles.destHeader}>
        <TouchableOpacity onPress={() => setHomeState("destination")}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.destTitle, { color: textPrimary }]}>Set pickup location</Text>
        <View style={{ width: 24 }} />
      </View>
      <Text style={[styles.pickupAddress, { color: textPrimary }]} numberOfLines={2}>
        {pickup?.address}
      </Text>
      <CustomButton
        title="Confirm Pickup"
        onPress={() => {
          fetchEstimate();
          setHomeState("vehicle");
        }}
      />
    </View>
  );

  // ── RENDER: VEHICLE SELECT ──
  const renderVehicle = () => (
    <View style={[styles.sheetContent, { backgroundColor: surfaceBg }]}>
      <View style={styles.destHeader}>
        <TouchableOpacity onPress={() => setHomeState("pickup")}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.destTitle, { color: textPrimary }]}>Choose {service || "ride"}</Text>
        <View style={{ width: 24 }} />
      </View>

      {loadingFare ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
      ) : (
        <ScrollView style={styles.vehicleList}>
          {vehicleOptions.map((v) => (
            <TouchableOpacity
              key={v.key}
              style={[
                styles.vehicleCard,
                {
                  backgroundColor: selectedVehicle === v.key ? colors.primaryLight : isDark ? colors.darkSecondary : colors.gray100,
                  borderColor: selectedVehicle === v.key ? colors.primary : borderColor,
                  borderWidth: selectedVehicle === v.key ? 2 : 1,
                },
              ]}
              onPress={() => handleVehicleSelect(v.key)}
            >
              <View style={[styles.vehicleIconBg, { backgroundColor: colors.primary + "15" }]}>
                <Ionicons name={v.icon} size={28} color={colors.primary} />
              </View>
              <View style={styles.vehicleInfo}>
                <Text style={[styles.vehicleName, { color: textPrimary }]}>{v.label}</Text>
                <Text style={[styles.vehicleMeta, { color: textSecondary }]}>
                  {v.seats} seats{v.hasAc === true ? " · AC" : v.hasAc === false ? " · No AC" : ""}
                </Text>
              </View>
              <View style={styles.vehicleFare}>
                <Text style={[styles.vehiclePrice, { color: textPrimary }]}>৳{(v.fare / 100).toFixed(0)}</Text>
                <Text style={[styles.vehicleEta, { color: textSecondary }]}>{v.eta} min</Text>
              </View>
              {selectedVehicle === v.key && (
                <Ionicons name="checkmark-circle" size={22} color={colors.primary} style={styles.vehicleCheck} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <CustomButton
        title="Continue"
        onPress={() => setHomeState("confirm")}
        disabled={!selectedVehicle}
      />
    </View>
  );

  // ── RENDER: CONFIRM ──
  const renderConfirm = () => (
    <View style={[styles.sheetContent, { backgroundColor: surfaceBg }]}>
      <View style={styles.destHeader}>
        <TouchableOpacity onPress={() => setHomeState("vehicle")}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.destTitle, { color: textPrimary }]}>Confirm Booking</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={{ flex: 1 }}>
        {/* Selected vehicle summary */}
        <View style={[styles.confirmVehicleRow, { borderBottomColor: borderColor }]}>
          <Ionicons
            name={selectedVehicle ? VEHICLE_ICONS[selectedVehicle] : "car"}
            size={24}
            color={colors.primary}
          />
          <Text style={[styles.confirmVehicleText, { color: textPrimary }]}>
            {selectedVehicle ? (language === "bn" ? getVehicleType(selectedVehicle).display_bn : getVehicleType(selectedVehicle).display_en) : ""}
          </Text>
          <Text style={[styles.confirmFare, { color: textPrimary }]}>
            ৳{(finalFare / 100).toFixed(0)}
          </Text>
        </View>

        {/* Fare breakdown (expandable) */}
        {fareBreakdown && <FareBreakdownSheet fareBreakdown={fareBreakdown} />}

        {/* Promo + tip live on confirm-ride (audit H-3): home's copies were
            never carried into the booking handoff — dead UI, deleted. */}

        {/* Payment */}
        <View style={[styles.paymentRow, { borderColor: borderColor }]}>
          <Ionicons name="cash" size={20} color={colors.greenVariant} />
          <Text style={[styles.paymentText, { color: textPrimary }]}>Cash</Text>
          <Text style={[styles.paymentSub, { color: textSecondary }]}>Pay driver directly</Text>
        </View>

        {/* Book button */}
        <CustomButton
          title={requesting ? "Requesting..." : "Book Now"}
          onPress={handleBook}
          disabled={requesting}
          className="mt-4"
        />
      </ScrollView>
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? "light-content" : "dark-content"} />
      {/* Map Layer */}
      <View style={StyleSheet.absoluteFill}>
        <Map />
      </View>

      {/* SOS Button (always visible) */}
      <TouchableOpacity
        style={[styles.sosBtn, { backgroundColor: colors.danger }]}
        onPress={() => router.push("/(main)/(customer)/emergency-sos")}
      >
        <Ionicons name="alert-circle" size={20} color={colors.white} />
      </TouchableOpacity>

      {/* Theme toggle */}
      <TouchableOpacity
        style={[styles.themeToggleBtn, { backgroundColor: surfaceBg, borderColor: borderColor }]}
        onPress={() => setTheme(isDark ? "light" : "dark")}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>


      {/* Bottom Sheet (custom absolute-positioned sheet, no third-party sheet lib) */}
      <Animated.View
        style={[
          styles.sheetContainer,
          sheetAnimatedStyle,
          { backgroundColor: surfaceBg, borderTopColor: borderColor },
          shadows.bottomSheet,
        ]}
      >
        <GestureDetector gesture={sheetPanGesture}>
          <View style={styles.dragHandleHit}>
            <View style={[styles.dragHandleBar, { backgroundColor: textDisabled }]} />
          </View>
        </GestureDetector>
        {homeState === "idle" && renderIdle()}
        {homeState === "destination" && renderDestination()}
        {homeState === "pickup" && renderPickup()}
        {homeState === "vehicle" && renderVehicle()}
        {homeState === "confirm" && renderConfirm()}
      </Animated.View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  dragHandleHit: {
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  dragHandleBar: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  whereToButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 12,
  },
  whereToText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 16,
  },
  chipsScroll: {
    marginTop: 16,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 10,
    paddingRight: 20,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 100,
    gap: 6,
  },
  chipText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  destHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  destTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  inputText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  addStopBtn: {
    padding: 4,
  },
  mapSelectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 12,
  },
  mapSelectText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
  },
  tabRow: {
    flexDirection: "row",
    marginTop: 8,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 2,
  },
  tabText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
  },
  tabTextActive: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
  },
  placeList: {
    flex: 1,
  },
  placeItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  placeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  placeAddress: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 2,
  },
  emptyText: {
    textAlign: "center",
    marginTop: 40,
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
  },
  pickupAddress: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 16,
    textAlign: "center",
    marginVertical: 20,
    lineHeight: 24,
  },
  vehicleList: {
    flex: 1,
    marginBottom: 16,
  },
  vehicleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  vehicleIconBg: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleInfo: {
    flex: 1,
    marginLeft: 14,
  },
  vehicleName: {
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
  },
  vehicleMeta: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 2,
  },
  vehicleFare: {
    alignItems: "flex-end",
  },
  vehiclePrice: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
  },
  vehicleEta: {
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    marginTop: 2,
  },
  vehicleCheck: {
    marginLeft: 10,
  },
  confirmVehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  confirmVehicleText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 16,
    flex: 1,
  },
  confirmFare: {
    fontFamily: "Jakarta-Bold",
    fontSize: 20,
  },
  promoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
    gap: 10,
  },
  promoInput: {
    flex: 1,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
  },
  promoApply: {
    fontFamily: "Jakarta-Bold",
    fontSize: 14,
  },
  promoApplied: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
    marginTop: 6,
    marginLeft: 4,
  },
  sectionLabel: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
    marginTop: 20,
    marginBottom: 10,
  },
  tipRow: {
    flexDirection: "row",
    gap: 10,
  },
  tipBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 20,
    gap: 12,
  },
  paymentText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
  },
  paymentSub: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginLeft: "auto",
  },
  sosBtn: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  themeToggleBtn: {
    position: "absolute",
    top: 60,
    right: 72,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    borderWidth: 1,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  pulseRing: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
  },
  pulseRingInner: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
  },
  findingTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 20,
    marginTop: 16,
  },
  findingSub: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 30,
    lineHeight: 20,
  },
  cancelBtn: {
    marginTop: 32,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 100,
    borderWidth: 1.5,
  },
  cancelText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
  },
});
