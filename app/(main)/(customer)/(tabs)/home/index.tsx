import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  StyleSheet,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import Map from "@/components/Map";
import { useCustomer } from "@/store";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useAppearance } from "@/lib/useAppearance";
import { FloatingNavMenu } from "@/components/FloatingNavMenu";
import FareBreakdownSheet from "@/components/FareBreakdownSheet";
import CustomButton from "@/components/CustomButton";

type HomeState = "idle" | "destination" | "pickup" | "vehicle" | "confirm" | "finding";

interface Stop {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
}

interface VehicleOption {
  key: string;
  label: string;
  eta: number;
  fare: number;
  seats: number;
  hasAc: boolean | null;
  icon: any;
}

interface SavedPlace {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
}

const VEHICLE_NAMES: Record<string, string> = {
  bike_basic: "Bike Basic",
  bike_standard: "Bike Standard",
  bike_plus: "Bike Plus",
  cng: "CNG",
  car_economy: "Economy",
  car_comfort: "Comfort",
  car_premium: "Premium",
  car_xl: "XL",
};

const SUBCATEGORIES: Record<string, string[]> = {
  bike: ["bike_basic", "bike_standard", "bike_plus"],
  cng: ["cng"],
  car: ["car_economy", "car_comfort", "car_premium"],
  large_car: ["car_xl"],
};

const VEHICLE_ICONS: Record<string, any> = {
  bike_basic: "bicycle",
  bike_standard: "bicycle",
  bike_plus: "bicycle",
  cng: "car-sport",
  car_economy: "car",
  car_comfort: "car",
  car_premium: "car",
  car_xl: "bus",
};

const TIP_OPTIONS = [0, 20, 50, 100];

export default function HomeScreen() {
  const { service } = useLocalSearchParams<{ service?: string }>();
  const bottomSheetRef = useRef<BottomSheet>(null);

  const [homeState, setHomeState] = useState<HomeState>("idle");
  const [pickup, setPickup] = useState<SavedPlace | null>(null);
  const [destination, setDestination] = useState<SavedPlace | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [recentPlaces, setRecentPlaces] = useState<SavedPlace[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [fareBreakdown, setFareBreakdown] = useState<Record<string, any> | null>(null);
  const [loadingFare, setLoadingFare] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount: number } | null>(null);
  const [tip, setTip] = useState(0);
  const [requesting, setRequesting] = useState(false);

  const { theme } = useAppearance();
  const isDark = theme === "dark" || theme === "system";
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const { userLatitude, userLongitude, userAddress, setDestinationLocation } = useCustomer();

  const snapPoints = useMemo(() => {
    switch (homeState) {
      case "idle": return ["18%", "30%"];
      case "destination": return ["92%"];
      case "pickup": return ["35%"];
      case "vehicle": return ["50%", "80%"];
      case "confirm": return ["70%", "90%"];
      case "finding": return ["100%"];
      default: return ["18%"];
    }
  }, [homeState]);

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

  const fetchEstimate = useCallback(async () => {
    if (!pickup || !destination) return;
    setLoadingFare(true);
    try {
      const body = {
        origin_lat: pickup.lat,
        origin_lng: pickup.lng,
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        stops: stops.map((s) => ({ lat: s.latitude, lng: s.longitude })),
      };
      const res = await fetch(`${API_URL}/api/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const categoryKeys = SUBCATEGORIES[service || "car"] || SUBCATEGORIES["car"];
      const options: VehicleOption[] = categoryKeys
        .filter((k) => data.fares?.[k])
        .map((k) => ({
          key: k,
          label: VEHICLE_NAMES[k] || k,
          eta: data.fares[k].eta_minutes || 5,
          fare: data.fares[k].total_bdt || 0,
          seats: data.fares[k].seats || 4,
          hasAc: data.fares[k].has_ac ?? null,
          icon: VEHICLE_ICONS[k] || "car",
        }));
      setVehicleOptions(options);
      if (options[0]) setSelectedVehicle(options[0].key);
      if (data.fares?.[options[0]?.key]) setFareBreakdown(data.fares[options[0].key]);
    } catch (e) {
      logger.error("[home] estimate failed", e);
    } finally {
      setLoadingFare(false);
    }
  }, [pickup, destination, stops, service]);

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

  const handleAddStop = () => {
    if (stops.length < 2) {
      setStops([...stops, { id: `stop-${stops.length}`, address: "", latitude: 0, longitude: 0 }]);
    }
  };

  const handleRemoveStop = (index: number) => {
    setStops(stops.filter((_, i) => i !== index));
  };

  const handleVehicleSelect = (key: string) => {
    setSelectedVehicle(key);
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/promo/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setAppliedPromo({ code: promoCode.trim(), discount: data.discount_bdt || 0 });
      } else {
        Alert.alert("Invalid Code", "This promo code is not valid or has expired.");
      }
    } catch {
      Alert.alert("Error", "Could not validate promo code.");
    }
  };

  const handleBook = async () => {
    if (!pickup || !destination || !selectedVehicle) return;
    setRequesting(true);
    setHomeState("finding");
    try {
      const body: any = {
        origin_lat: pickup.lat,
        origin_lng: pickup.lng,
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        vehicle_type: selectedVehicle,
        upfront_tip_bdt: tip,
      };
      if (stops.length > 0) {
        body.stops = stops.map((s) => ({ lat: s.latitude, lng: s.longitude, address: s.address }));
      }
      const res = await fetch(`${API_URL}/api/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Request failed");
    } catch (e) {
      logger.error("[home] book failed", e);
      Alert.alert("Error", "Could not request ride. Please try again.");
      setHomeState("confirm");
    }
  };

  const handleCancelFind = () => {
    setRequesting(false);
    setHomeState("confirm");
  };

  const finalFare = useMemo(() => {
    let fare = fareBreakdown?.total_bdt || 0;
    if (appliedPromo) fare = Math.max(0, fare - appliedPromo.discount);
    fare += tip * 100;
    return fare;
  }, [fareBreakdown, appliedPromo, tip]);

  // ── RENDER: IDLE STATE ──
  const renderIdle = () => (
    <BottomSheetView style={[styles.sheetContent, { backgroundColor: surfaceBg }]}>
      <View style={[styles.handle, { backgroundColor: borderColor }]} />
      <TouchableOpacity
        style={[styles.whereToButton, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]}
        onPress={() => setHomeState("destination")}
      >
        <Ionicons name="search" size={18} color={textSecondary} />
        <Text style={[styles.whereToText, { color: textSecondary }]}>Where to?</Text>
      </TouchableOpacity>

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
          <TouchableOpacity style={[styles.chip, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]}>
            <Ionicons name="time" size={16} color={textSecondary} />
            <Text style={[styles.chipText, { color: textSecondary }]}>Recent</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </BottomSheetView>
  );

  // ── RENDER: DESTINATION SELECTOR ──
  const renderDestination = () => (
    <BottomSheetView style={[styles.sheetContent, { backgroundColor: surfaceBg }]}>
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

      {/* Destination field */}
      <View style={[styles.inputRow, { borderColor: borderColor }]}>
        <View style={[styles.dot, { backgroundColor: colors.danger }]} />
        <TextInput
          style={[styles.inputText, { color: textPrimary, flex: 1 }]}
          placeholder="Where to?"
          placeholderTextColor={textDisabled}
          onFocus={() => {/* Show autocomplete */}}
        />
        {stops.length < 2 && (
          <TouchableOpacity onPress={handleAddStop} style={styles.addStopBtn}>
            <Ionicons name="add-circle" size={24} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Stop fields */}
      {stops.map((stop, idx) => (
        <View key={stop.id} style={[styles.inputRow, { borderColor: borderColor }]}>
          <View style={[styles.dot, { backgroundColor: colors.amber }]} />
          <TextInput
            style={[styles.inputText, { color: textPrimary, flex: 1 }]}
            placeholder={`Stop ${idx + 1}`}
            placeholderTextColor={textDisabled}
            value={stop.address}
          />
          <TouchableOpacity onPress={() => handleRemoveStop(idx)}>
            <Ionicons name="close-circle" size={22} color={textSecondary} />
          </TouchableOpacity>
        </View>
      ))}

      {/* Select from map */}
      <TouchableOpacity style={styles.mapSelectRow}>
        <Ionicons name="map" size={18} color={colors.primary} />
        <Text style={[styles.mapSelectText, { color: colors.primary }]}>Select from map</Text>
      </TouchableOpacity>

      {/* Recent / Suggested tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, { borderBottomColor: colors.primary }]}>
          <Text style={[styles.tabTextActive, { color: colors.primary }]}>Recent</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, { borderBottomColor: "transparent" }]}>
          <Text style={[styles.tabText, { color: textSecondary }]}>Suggested</Text>
        </TouchableOpacity>
      </View>

      {/* Place list */}
      <ScrollView style={styles.placeList}>
        {recentPlaces.map((place) => (
          <TouchableOpacity
            key={place.id}
            style={[styles.placeItem, { borderBottomColor: borderColor }]}
            onPress={() => handleDestinationSelect({ latitude: place.lat, longitude: place.lng, address: place.address })}
          >
            <View style={[styles.placeIcon, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]}>
              <Ionicons name="time" size={18} color={textSecondary} />
            </View>
            <View style={styles.placeInfo}>
              <Text style={[styles.placeName, { color: textPrimary }]}>{place.label}</Text>
              <Text style={[styles.placeAddress, { color: textSecondary }]} numberOfLines={1}>{place.address}</Text>
            </View>
          </TouchableOpacity>
        ))}
        {recentPlaces.length === 0 && (
          <Text style={[styles.emptyText, { color: textSecondary }]}>No recent destinations</Text>
        )}
      </ScrollView>
    </BottomSheetView>
  );

  // ── RENDER: PICKUP CONFIRM ──
  const renderPickup = () => (
    <BottomSheetView style={[styles.sheetContent, { backgroundColor: surfaceBg }]}>
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
    </BottomSheetView>
  );

  // ── RENDER: VEHICLE SELECT ──
  const renderVehicle = () => (
    <BottomSheetView style={[styles.sheetContent, { backgroundColor: surfaceBg }]}>
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
    </BottomSheetView>
  );

  // ── RENDER: CONFIRM ──
  const renderConfirm = () => (
    <BottomSheetView style={[styles.sheetContent, { backgroundColor: surfaceBg }]}>
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
            name={VEHICLE_ICONS[selectedVehicle || ""] || "car"}
            size={24}
            color={colors.primary}
          />
          <Text style={[styles.confirmVehicleText, { color: textPrimary }]}>
            {VEHICLE_NAMES[selectedVehicle || ""] || selectedVehicle}
          </Text>
          <Text style={[styles.confirmFare, { color: textPrimary }]}>
            ৳{(finalFare / 100).toFixed(0)}
          </Text>
        </View>

        {/* Fare breakdown (expandable) */}
        {fareBreakdown && <FareBreakdownSheet fareBreakdown={fareBreakdown} />}

        {/* Promo code */}
        <View style={[styles.promoRow, { borderColor: borderColor }]}>
          <Ionicons name="ticket" size={18} color={colors.primary} />
          <TextInput
            style={[styles.promoInput, { color: textPrimary }]}
            placeholder="Enter promo code"
            placeholderTextColor={textDisabled}
            value={promoCode}
            onChangeText={setPromoCode}
          />
          <TouchableOpacity onPress={handleApplyPromo}>
            <Text style={[styles.promoApply, { color: colors.primary }]}>Apply</Text>
          </TouchableOpacity>
        </View>
        {appliedPromo && (
          <Text style={[styles.promoApplied, { color: colors.greenVariant }]}>
            ✓ {appliedPromo.code} applied (-৳{(appliedPromo.discount / 100).toFixed(0)})
          </Text>
        )}

        {/* Tip */}
        <Text style={[styles.sectionLabel, { color: textSecondary }]}>Add Tip</Text>
        <View style={styles.tipRow}>
          {TIP_OPTIONS.map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.tipBtn,
                {
                  backgroundColor: tip === t ? colors.primary : isDark ? colors.darkSecondary : colors.gray100,
                  borderColor: tip === t ? colors.primary : borderColor,
                },
              ]}
              onPress={() => setTip(t)}
            >
              <Text style={{ color: tip === t ? colors.white : textPrimary, fontFamily: "Jakarta-SemiBold" }}>
                {t === 0 ? "No Tip" : `৳${t}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

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
    </BottomSheetView>
  );

  // ── RENDER: FINDING ──
  const renderFinding = () => (
    <BottomSheetView style={[styles.sheetContent, { backgroundColor: surfaceBg, justifyContent: "center", alignItems: "center" }]}>
      <View style={[styles.pulseRing, { borderColor: colors.primary + "30" }]} />
      <View style={[styles.pulseRingInner, { borderColor: colors.primary + "50" }]} />
      <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 24 }} />
      <Text style={[styles.findingTitle, { color: textPrimary }]}>Finding you a nearby driver...</Text>
      <Text style={[styles.findingSub, { color: textSecondary }]}>
        The driver will pick you up as soon as possible after they confirm your order.
      </Text>
      <TouchableOpacity
        style={[styles.cancelBtn, { borderColor: colors.danger }]}
        onPress={handleCancelFind}
      >
        <Text style={[styles.cancelText, { color: colors.danger }]}>Cancel Ride</Text>
      </TouchableOpacity>
    </BottomSheetView>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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

      {/* Hamburger Menu */}
      <FloatingNavMenu variant="customer" />

      {/* Bottom Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        snapPoints={snapPoints}
        index={0}
        enablePanDownToClose={homeState === "idle"}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: borderColor, width: 40, height: 4, borderRadius: 2 }}
      >
        {homeState === "idle" && renderIdle()}
        {homeState === "destination" && renderDestination()}
        {homeState === "pickup" && renderPickup()}
        {homeState === "vehicle" && renderVehicle()}
        {homeState === "confirm" && renderConfirm()}
        {homeState === "finding" && renderFinding()}
      </BottomSheet>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
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
    shadowColor: "#000",
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
