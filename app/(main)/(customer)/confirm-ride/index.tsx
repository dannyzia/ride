import { Image, Text, View, TextInput, TouchableOpacity, Alert, Modal, StatusBar } from "react-native";
import { API_URL } from "@/lib/config";
import { Ionicons } from "@expo/vector-icons";
import RideLayout from "@/components/RideLayout";
import { useCustomer } from "@/store";
import { icons } from "@/constants/data";
import { useRouter } from "expo-router";
import BarikoiAutocomplete from "@/components/BarikoiAutocomplete";
import { UpfrontTipSlider } from "@/components/UpfrontTipSlider";
import CustomButton from "@/components/CustomButton";
import ScheduleRideSheet from "@/components/ScheduleRideSheet";
import PickupFeeExplainerSheet, { shouldShowExplainer } from "@/components/PickupFeeExplainerSheet";
import ZoneFeeExplainerSheet from "@/components/ZoneFeeExplainerSheet";
import { useEffect, useState, Fragment } from "react";
import { useRiderStore, FareEstimate, DiscountOption, DiscountType } from "@/store/useRiderStore";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";
import { supabase } from "@/lib/supabase";
import { colors, fonts } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance"

const BARIKOI_API_KEY = process.env.EXPO_PUBLIC_BARIKOI_API_KEY ?? "";

const ConfirmRidePage = () => {
  const router = useRouter();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const border = isDark ? colors.borderDark : colors.borderLight;
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const dividerBorder = isDark ? colors.borderDark : colors.borderLight;

  const {
    userAddress,
    destinationAddress,
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
  } = useCustomer();
  const {
    selectedVehicleType,
    estimates,
    setActiveRide,
    setSearchingRideId,
    setRideStatus,
    scheduledAt,
    setScheduledAt,
    selectedPrefIds,
    selectedDiscount,
    setSelectedDiscount,
    stops: storeStops,
  } = useRiderStore();
  const [rideDuration, setRideDuration] = useState<string>("");
  const [rideDistance, setRideDistance] = useState<string>("");
  const [requesting, setRequesting] = useState(false);
  const [bookForOther, setBookForOther] = useState(false);
  const [otherName, setOtherName] = useState("");
  const [otherPhone, setOtherPhone] = useState("");
  const [otherConsent, setOtherConsent] = useState(false);
  const [upfrontTip, setUpfrontTip] = useState(0);
  const [stops, setStops] = useState<{ lat: number; lng: number; address: string }[]>(storeStops);
  const [showStopModal, setShowStopModal] = useState(false);
  const [preferFemale, setPreferFemale] = useState(false);
  const [refreshedEstimate, setRefreshedEstimate] = useState<FareEstimate | null>(null);
  const [pendingFeeDeduction, setPendingFeeDeduction] = useState<{ remaining: number } | null>(null);
  const [scheduleLater, setScheduleLater] = useState(false);
  const [showPickupExplainer, setShowPickupExplainer] = useState(false);
  const [pickupExplainerChecked, setPickupExplainerChecked] = useState(false);
  const [showZoneFeeExplainer, setShowZoneFeeExplainer] = useState(false);
  const [zoneFeeExplainerChecked, setZoneFeeExplainerChecked] = useState(false);

  const selectedEstimate = estimates.find(
    (e) => e.vehicle_type === selectedVehicleType,
  );
  const displayEstimate = refreshedEstimate ?? selectedEstimate;
  const vehicleDef = selectedVehicleType
    ? VEHICLE_TYPES.find((v) => v.key === selectedVehicleType)
    : null;

  // Fetch pending fee deductions
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/rider/fee-deductions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.total_owed_bdt > 0) {
          setPendingFeeDeduction({ remaining: data.total_owed_bdt });
        }
      } catch { /* non-blocking */ }
    })();
  }, []);

  // First-time pickup fee explainer — show once per device
  useEffect(() => {
    if (pickupExplainerChecked) return;
    if (displayEstimate?.pickup_fee_low_bdt == null) return;
    let alive = true;
    (async () => {
      const show = await shouldShowExplainer();
      if (!alive) return;
      if (show) setShowPickupExplainer(true);
      setPickupExplainerChecked(true);
    })();
    return () => { alive = false; };
  }, [displayEstimate, pickupExplainerChecked]);

  // First-time zone fee explainer — show once per user (server-gated)
  useEffect(() => {
    if (zoneFeeExplainerChecked) return;
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token || !alive) return;
        const res = await fetch(`${API_URL}/api/user/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok || !alive) return;
        const data = await res.json();
        if (!data.zone_fee_explained && alive) {
          setShowZoneFeeExplainer(true);
        }
      } catch { /* non-blocking */ }
      if (alive) setZoneFeeExplainerChecked(true);
    })();
    return () => { alive = false; };
  }, [zoneFeeExplainerChecked]);

  useEffect(() => {
    if (
      !userLongitude ||
      !userLatitude ||
      !destinationLongitude ||
      !destinationLatitude
    )
      return;

    const fetchRoute = async () => {
      try {
        const url = `https://barikoi.xyz/v1/api/distance/directions/${BARIKOI_API_KEY}?from=${userLongitude},${userLatitude}&to=${destinationLongitude},${destinationLatitude}`;
        const response = await fetch(url);
        const data = await response.json();
        const seconds = data.duration || data.routes?.[0]?.duration || 0;
        const meters = data.distance || data.routes?.[0]?.distance || 0;

        const timeInMinutes = Math.round((seconds + 300) / 60);
        const duration =
          timeInMinutes < 60
            ? `${timeInMinutes} mins`
            : `${(timeInMinutes / 60).toFixed(1)} hours`;

        const km = meters / 1000;
        const distance =
          km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(meters)} m`;

        setRideDuration(duration);
        setRideDistance(distance);
      } catch {
        setRideDuration(
          displayEstimate ? `${displayEstimate.eta_minutes} min` : "N/A",
        );
        setRideDistance(
          displayEstimate
            ? `${displayEstimate.distance_km.toFixed(1)} km`
            : "N/A",
        );
      }
    };

    fetchRoute();
  }, []);

  useEffect(() => {
    if (!selectedVehicleType || !userLatitude || !userLongitude || !destinationLatitude || !destinationLongitude) return;

    let cancelled = false;
    const fetchEstimate = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const body: Record<string, unknown> = {
          pickup_lat: userLatitude,
          pickup_lng: userLongitude,
          dropoff_lat: destinationLatitude,
          dropoff_lng: destinationLongitude,
          vehicle_type: selectedVehicleType,
          preference_ids: selectedPrefIds.length > 0 ? selectedPrefIds : undefined,
          upfront_tip_bdt: upfrontTip > 0 ? upfrontTip * 100 : undefined,
           stops: stops.length > 0 ? stops : undefined,
         };

        const res = await fetch(`${API_URL}/api/ride/estimate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!cancelled && data.estimates && data.estimates.length > 0) {
          const est = data.estimates.find((e: { vehicle_type: string }) => e.vehicle_type === selectedVehicleType) ?? data.estimates[0];
          setRefreshedEstimate({ ...est, distance_km: data.distance_km } as FareEstimate);
        }
      } catch {
        // keep existing estimate on error
      }
    };

    fetchEstimate();
    return () => { cancelled = true; };
  }, [stops, upfrontTip, selectedVehicleType, userLatitude, userLongitude, destinationLatitude, destinationLongitude, selectedPrefIds]);

  const handleRequestRide = async () => {
    if (
      !userLatitude ||
      !userLongitude ||
      !destinationLatitude ||
      !destinationLongitude ||
      !selectedVehicleType
    ) {
      Alert.alert("Error", "Missing location or vehicle type");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      Alert.alert("Error", "Not authenticated");
      return;
    }

    if (bookForOther && (!otherName.trim() || !otherPhone.trim())) {
      Alert.alert("Validation", "Please enter the passenger's name and phone number");
      setRequesting(false);
      return;
    }
    if (bookForOther && !otherConsent) {
      Alert.alert("Consent Required", "Please confirm the passenger has consented to receive an SMS with ride tracking details.");
      setRequesting(false);
      return;
    }
    setRequesting(true);
    try {
      const endpoint = scheduledAt ? `${API_URL}/api/ride/schedule` : `${API_URL}/api/ride/request`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pickup_lat: userLatitude,
          pickup_lng: userLongitude,
          pickup_address: userAddress || "",
          dropoff_lat: destinationLatitude,
          dropoff_lng: destinationLongitude,
          dropoff_address: destinationAddress || "",
          vehicle_type: selectedVehicleType,
           scheduled_at: scheduledAt || undefined,
           selected_discount_type: selectedDiscount ? selectedDiscount.type : "none",
           selected_discount_amount_bdt: selectedDiscount ? selectedDiscount.amount_bdt : 0,
           preference_ids:
            selectedPrefIds.length > 0 ? selectedPrefIds : undefined,
          secondary_rider_name: bookForOther ? otherName.trim() : undefined,
          secondary_rider_phone: bookForOther ? otherPhone.trim() : undefined,
          secondary_rider_consent: bookForOther ? otherConsent : undefined,
          upfront_tip_bdt: upfrontTip > 0 ? upfrontTip * 100 : undefined,
          stops: stops.length > 0 ? stops : undefined,
          female_driver_preference: preferFemale ? true : undefined,
        }),
      });
      const data = await response.json();
      if (data.ride_id) {
        // Seed activeRide with the ride details + fare so the search/tracking
        // screens (finding-driver, then ride-tracking) can render the fare,
        // pickup/dropoff, etc. immediately —
        // previously activeRide was never set, so the rider saw no fare and a
        // blank ride card.
        setActiveRide({
          id: data.ride_id,
          status: "pending",
          driver_id: null,
          origin_address: userAddress || "",
          destination_address: destinationAddress || "",
          origin_latitude: userLatitude ?? 0,
          origin_longitude: userLongitude ?? 0,
          destination_latitude: destinationLatitude ?? 0,
          destination_longitude: destinationLongitude ?? 0,
          vehicle_type: selectedVehicleType ?? "bike_basic",
          fare_breakdown: data.fare_breakdown ?? {},
          distance_km: data.fare_breakdown?.distance_km ?? 0,
          created_at: new Date().toISOString(),
        });
        setSearchingRideId(data.ride_id);
        setRideStatus("finding");
        router.replace(scheduledAt ? "/(main)/(customer)/ride-scheduled" : "/(main)/(customer)/finding-driver");
      } else {
        Alert.alert(
          "Request Failed",
          data.message || data.error || "Could not find a driver",
        );
      }
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Network error");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Fragment>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <RideLayout title="Confirm Ride" disabled={false}>
      <View style={{ flex: 1 }}>
        {/* Selected vehicle info */}
        {displayEstimate && vehicleDef && (
          <View style={{ flexDirection: "row", alignItems: "center", padding: 16, marginBottom: 20, borderRadius: 16, backgroundColor: surface }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
              <Image
                source={icons.cab}
                style={{ width: 32, height: 32, tintColor: textPrimary }}
                resizeMode="contain"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={{ color: textPrimary, fontSize: 18, fontFamily: fonts.heading }}>
                {vehicleDef.display_en}
              </Text>
              <Text style={{ color: textSecondary, fontSize: 14 }}>
                {displayEstimate.seats} seats
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: textPrimary, fontSize: 18, fontFamily: fonts.heading }}>
                ৳{(displayEstimate.total_bdt / 100).toFixed(0)}
              </Text>
              {/* Non-binding fare range (Phase F §6) */}
              {displayEstimate.fare_range_low_bdt != null && displayEstimate.fare_range_high_bdt != null && (
                <Text style={{ color: textSecondary, fontSize: 11 }}>
                  ৳{(displayEstimate.fare_range_low_bdt / 100).toFixed(0)} – ৳{(displayEstimate.fare_range_high_bdt / 100).toFixed(0)} est.
                </Text>
              )}
              <Text style={{ color: textSecondary, fontSize: 12 }}>
                {displayEstimate.eta_minutes} min
              </Text>
            </View>
          </View>
        )}

        {/* Ride info card */}
        <View style={{ borderRadius: 16, backgroundColor: surface, padding: 16, marginBottom: 20 }}>
          {/* Scheduled time badge */}
          {scheduledAt && (
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: dividerBorder }}>
              <Ionicons name="time-outline" size={16} color={colors.primary} />
              <Text style={{ color: textSecondary, marginLeft: 8 }}>Pickup at</Text>
              <View
                style={{ marginLeft: "auto", paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.primaryLight }}
              >
                <Text
                  style={{
                    fontFamily: fonts.headingSemi,
                    fontSize: 13,
                    color: colors.primary,
                  }}
                >
                  {new Date(scheduledAt).toLocaleString("en-GB", {
                    timeZone: "Asia/Dhaka",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </Text>
              </View>
            </View>
          )}
          {/* Traffic warning (Phase F §6) */}
          {displayEstimate?.traffic_warning && (
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8, borderRadius: 10, backgroundColor: "rgba(245, 158, 11, 0.10)" }}>
              <Ionicons name="alert-circle-outline" size={16} color="#f59e0b" />
              <Text style={{ color: "#f59e0b", fontSize: 13, marginLeft: 8, flex: 1 }}>
                {displayEstimate.traffic_message ?? 'Traffic is heavy now — trip may take longer and cost more.'}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: dividerBorder }}>
            <Text style={{ color: textSecondary }}>Distance</Text>
            <Text style={{ color: textPrimary, fontFamily: fonts.headingSemi }}>
              {rideDistance}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: dividerBorder }}>
            <Text style={{ color: textSecondary }}>Duration</Text>
            <Text style={{ color: textPrimary, fontFamily: fonts.headingSemi }}>
              {rideDuration}
            </Text>
          </View>
        {/* Discount selector */}
        {displayEstimate?.available_discounts && displayEstimate.available_discounts.length > 0 && (
          <View style={{ backgroundColor: surface, borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <Text style={{ color: textPrimary, fontSize: 14, fontFamily: fonts.headingSemi, marginBottom: 12 }}>Available Discounts</Text>
            {displayEstimate.available_discounts.map((discount: DiscountOption) => {
              const isSelected =
                selectedDiscount?.type === discount.type &&
                selectedDiscount?.amount_bdt === discount.amount_bdt;
              return (
                <TouchableOpacity
                  key={discount.type}
                  onPress={() =>
                    setSelectedDiscount(
                      isSelected
                        ? null
                        : { type: discount.type as DiscountType, amount_bdt: discount.amount_bdt },
                    )
                  }
                  style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: dividerBorder }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      borderWidth: 2,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                      backgroundColor: isSelected ? colors.primary : "transparent",
                      borderColor: isSelected ? colors.primary : border,
                    }}
                  >
                    {isSelected && <Ionicons name="checkmark-circle" size={12} color={colors.white} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: textPrimary, fontFamily: fonts.headingSemi }}>{discount.description}</Text>
                    <Text style={{ color: textSecondary, fontSize: 12 }}>{discount.percent ? `${discount.percent}% off` : `৳${(discount.amount_bdt / 100).toFixed(0)} off`}</Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: fonts.headingSemi,
                      fontSize: 14,
                      color: isSelected ? colors.primary : colors.textSecondaryLight,
                    }}
                  >
                    −৳{(discount.amount_bdt / 100).toFixed(0)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: dividerBorder }}>
            <Text style={{ color: textSecondary }}>Base fare</Text>
            <Text style={{ color: textPrimary, fontFamily: fonts.headingSemi }}>
              ৳{displayEstimate ? (displayEstimate.total_bdt / 100).toFixed(0) : "—"}
            </Text>
           </View>
           {pendingFeeDeduction && (
             <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: dividerBorder }}>
               <Text style={{ color: textSecondary }}>Pending cancellation fee</Text>
               <Text style={{ color: colors.danger, fontFamily: fonts.headingSemi }}>
                 ৳{(pendingFeeDeduction.remaining / 100).toFixed(0)} (from cashback)
               </Text>
             </View>
           )}
            {selectedDiscount && (
             <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: dividerBorder }}>
               <Text style={{ color: textSecondary }}>
                 {selectedDiscount.type === "intro"
                   ? "Intro bonus"
                   : selectedDiscount.type === "promo"
                   ? "Promo discount"
                   : selectedDiscount.type === "pass"
                   ? "Pass discount"
                   : "Wallet credit"}
               </Text>
               <Text style={{ color: colors.primary, fontFamily: fonts.headingSemi }}>
                 −৳{(selectedDiscount.amount_bdt / 100).toFixed(0)}
               </Text>
             </View>
           )}
          {upfrontTip > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: dividerBorder }}>
              <Text style={{ color: textSecondary }}>Tip</Text>
              <Text style={{ color: textPrimary, fontFamily: fonts.headingSemi }}>
                ৳{upfrontTip.toFixed(0)}
              </Text>
            </View>
          )}
          {/* Pickup fee range */}
          {displayEstimate?.pickup_fee_low_bdt != null &&
           displayEstimate.pickup_fee_high_bdt != null && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: dividerBorder }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: textSecondary }}>Pickup fee</Text>
                {displayEstimate.pickup_fee_range_low_confidence === true && (
                  <Text style={{ color: colors.amber, fontSize: 11, marginTop: 2 }}>(estimated)</Text>
                )}
              </View>
              <Text style={{ color: textPrimary, fontFamily: fonts.headingSemi }}>
                ৳{(displayEstimate.pickup_fee_low_bdt / 100).toFixed(0)}–{(displayEstimate.pickup_fee_high_bdt / 100).toFixed(0)}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 }}>
            <Text style={{ color: colors.accent, fontSize: 18, fontFamily: fonts.heading }}>Total</Text>
            <Text style={{ color: colors.accent, fontSize: 18, fontFamily: fonts.heading }}>
               ৳{displayEstimate ? (Math.round(displayEstimate.total_bdt - (selectedDiscount?.amount_bdt ?? 0) + upfrontTip * 100) / 100).toFixed(0) : "—"}
            </Text>
          </View>
        </View>

        {/* Pickup / Dropoff */}
        <View style={{ borderRadius: 16, backgroundColor: surface, padding: 16, marginBottom: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: dividerBorder }}>
            <Image
              source={icons.marker}
              style={{ width: 20, height: 20, tintColor: colors.accent }}
              resizeMode="contain"
            />
            <Text
              style={{ color: textPrimary, marginLeft: 12, flex: 1 }}
              numberOfLines={2}
            >
              {userAddress || "Pickup"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
            <Image
              source={icons.pin}
              style={{ width: 20, height: 20, tintColor: colors.danger }}
              resizeMode="contain"
            />
            <Text
              style={{ color: textPrimary, marginLeft: 12, flex: 1 }}
              numberOfLines={2}
            >
              {destinationAddress || "Dropoff"}
            </Text>
          </View>
        </View>

        {/* Book for someone else */}
        <TouchableOpacity
          onPress={() => setBookForOther(!bookForOther)}
          style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
        >
          <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, alignItems: "center", justifyContent: "center", marginRight: 8, backgroundColor: bookForOther ? colors.primary : "transparent", borderColor: bookForOther ? colors.primary : border }}>
            {bookForOther && <Ionicons name="checkmark-circle" size={12} color={colors.white} />}
          </View>
          <Text style={{ fontSize: 14, fontFamily: fonts.body, color: textSecondary }}>Book for someone else</Text>
        </TouchableOpacity>
        {bookForOther && (
          <View style={{ marginBottom: 16 }}>
            <TextInput style={{ backgroundColor: surface, borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, fontFamily: fonts.body, color: textPrimary, marginBottom: 12 }}
              placeholder="Passenger name" placeholderTextColor={colors.textSecondaryDark} value={otherName} onChangeText={setOtherName} />
            <TextInput style={{ backgroundColor: surface, borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, fontFamily: fonts.body, color: textPrimary }}
              placeholder="01XXXXXXXXX" placeholderTextColor={colors.textSecondaryDark} keyboardType="numeric" value={otherPhone} onChangeText={setOtherPhone} />
            <TouchableOpacity
              onPress={() => setOtherConsent(!otherConsent)}
              style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 8 }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: otherConsent }}
              accessibilityLabel="Confirm passenger consent for SMS"
            >
              <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, alignItems: "center", justifyContent: "center", marginRight: 8, marginTop: 1, backgroundColor: otherConsent ? colors.primary : "transparent", borderColor: otherConsent ? colors.primary : border }}>
                {otherConsent && <Ionicons name="checkmark-circle" size={12} color={colors.white} />}
              </View>
              <Text style={{ fontSize: 13, fontFamily: fonts.body, color: textSecondary, flex: 1, lineHeight: 18 }}>
                I confirm the passenger has consented to receive an SMS with ride tracking details.
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <UpfrontTipSlider value={upfrontTip} onChange={setUpfrontTip} />

        {/* Female driver preference */}
        <TouchableOpacity onPress={() => setPreferFemale(!preferFemale)} style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, alignItems: "center", justifyContent: "center", marginRight: 8, backgroundColor: preferFemale ? colors.primary : "transparent", borderColor: preferFemale ? colors.primary : border }}>
            {preferFemale && <Ionicons name="checkmark-circle" size={12} color={colors.white} />}
          </View>
          <Text style={{ fontSize: 14, fontFamily: fonts.body, color: textSecondary }}>Prefer female driver</Text>
        </TouchableOpacity>

        {/* Schedule for later toggle — §R1/S4 */}
        <TouchableOpacity
          onPress={() => {
            const next = !scheduleLater;
            setScheduleLater(next);
            if (!next) {
              // Turning OFF: clear any scheduled time so the request goes
              // through the immediate ride path.
              setScheduledAt(null);
            }
          }}
          style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
          accessibilityRole="button"
          accessibilityLabel={scheduleLater ? "Disable schedule for later" : "Enable schedule for later"}
        >
          <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, alignItems: "center", justifyContent: "center", marginRight: 8, backgroundColor: scheduleLater ? colors.primary : "transparent", borderColor: scheduleLater ? colors.primary : border }}>
            {scheduleLater && <Ionicons name="checkmark-circle" size={12} color={colors.white} />}
          </View>
          <Ionicons name="time-outline" size={16} color={scheduleLater ? colors.primary : textSecondary} style={{ marginRight: 6 }} />
          <Text style={{ fontSize: 14, fontFamily: fonts.body, color: textSecondary }}>Schedule for later</Text>
        </TouchableOpacity>

        {/* ScheduleRideSheet — inline when toggle is ON */}
        {scheduleLater && (
          <View style={{ marginBottom: 16 }}>
            <ScheduleRideSheet
              onConfirm={(iso) => {
                setScheduledAt(iso);
              }}
              onClose={() => {
                setScheduleLater(false);
                setScheduledAt(null);
              }}
              initialDate={scheduledAt ? new Date(scheduledAt) : null}
            />
          </View>
        )}

        {stops.length < 2 && (
          <TouchableOpacity onPress={() => setShowStopModal(true)} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, marginBottom: 8 }}>
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={{ color: colors.primary, fontFamily: fonts.body, fontSize: 15, marginLeft: 6 }}>Add Stop</Text>
          </TouchableOpacity>
        )}
        {stops.map((stop, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", backgroundColor: surface, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 }}>
            <Text style={{ flex: 1, fontSize: 14, fontFamily: fonts.body, color: textPrimary }}>Stop {i + 1}: {stop.address}</Text>
            <TouchableOpacity onPress={() => setStops(stops.filter((_, j) => j !== i))}><Ionicons name="close" size={16} color={colors.danger} /></TouchableOpacity>
          </View>
        ))}

        <CustomButton
          title={requesting ? "Requesting..." : scheduledAt ? "Schedule Ride" : "Request Ride"}
          onPress={handleRequestRide}
          disabled={requesting || !selectedVehicleType}
          className="w-full mt-auto"
        />
      </View>
    </RideLayout>
      <Modal visible={showStopModal} transparent animationType="slide" onRequestClose={() => setShowStopModal(false)}>
      <View style={{ flex: 1, backgroundColor: bg, paddingTop: 80, paddingHorizontal: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
          <TouchableOpacity onPress={() => setShowStopModal(false)}><Text style={{ color: colors.primary, fontFamily: fonts.body, fontSize: 16 }}>Cancel</Text></TouchableOpacity>
          <Text style={{ flex: 1, textAlign: "center", fontSize: 18, fontFamily: fonts.heading, color: textPrimary }}>Add Stop</Text>
          <View style={{ width: 48 }} />
        </View>
        <BarikoiAutocomplete
          icon={undefined}
          initialLocation=""
          textInputBackgroundColor={colors.bgLight}
          handlePress={(location: { latitude: number; longitude: number; address: string }) => {
            if (stops.length < 2) {
              setStops([...stops, { lat: location.latitude, lng: location.longitude, address: location.address }]);
              setShowStopModal(false);
            }
          }}
        />
      </View>
      </Modal>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surface, borderWidth: 1, borderColor: border }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
      <PickupFeeExplainerSheet
        visible={showPickupExplainer}
        onDismiss={() => setShowPickupExplainer(false)}
      />
      <ZoneFeeExplainerSheet
        visible={showZoneFeeExplainer}
        onDismiss={() => setShowZoneFeeExplainer(false)}
      />
    </Fragment>
  );
};

export default ConfirmRidePage;
