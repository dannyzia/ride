/**
 * Rental request creation screen — form for car/truck/ambulance-scheduled.
 * Creates a rental request via POST /api/rental/requests.
 */
import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { useRentalStore } from "@/store/useRentalStore";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

const CATEGORIES = [
  { key: "car_rental", label: "Car Rental", icon: "car-sport", color: colors.primary },
  { key: "truck_rental", label: "Truck Rental", icon: "bus", color: colors.blue },
  { key: "ambulance_scheduled", label: "Ambulance", icon: "medkit", color: colors.danger },
] as const;

export default function RentalIndexScreen() {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const { setActiveRequest, setBids, setLoading } = useRentalStore();
  const [category, setCategory] = useState<string>("car_rental");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [trackingRequired, setTrackingRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!pickupAddress || !dropoffAddress) {
      Alert.alert("Missing Info", "Please enter both pickup and dropoff addresses");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`${SERVER_URL}/api/rental/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category,
          pickup_address: pickupAddress,
          pickup_lat: 23.8103, // TODO: use actual GPS
          pickup_lng: 90.4125,
          dropoff_address: dropoffAddress,
          dropoff_lat: 23.8200,
          dropoff_lng: 90.4200,
          tracking_required: trackingRequired,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.message || "Could not create request");
        return;
      }

      setActiveRequest({
        id: data.request_id,
        category,
        urgency: "standard",
        status: "broadcasting",
        pickup_address: pickupAddress,
        pickup_lat: 23.8103,
        pickup_lng: 90.4125,
        dropoff_address: dropoffAddress,
        dropoff_lat: 23.8200,
        dropoff_lng: 90.4200,
        requested_vehicle_type: null,
        bidding_window_seconds: 1200,
        soft_deadline_at: data.soft_deadline_at,
        awarded_bid_id: null,
        awarded_at: null,
        confirmation_deadline_at: null,
        tracking_required: trackingRequired,
        created_at: new Date().toISOString(),
      });
      setBids([]);

      router.push("/(main)/(customer)/(rental-marketplace)/bidding");
    } catch (err) {
      logger.error("[rental/create] error", err);
      Alert.alert("Error", "Could not create request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
          Rental Request
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
        {/* Category selector */}
        <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
          What do you need?
        </Text>
        <View style={{ flexDirection: "row", marginBottom: 20 }}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              onPress={() => setCategory(cat.key)}
              style={{
                flex: 1,
                paddingVertical: 16,
                alignItems: "center",
                backgroundColor: category === cat.key ? cat.color + "18" : surfaceBg,
                borderWidth: 2,
                borderColor: category === cat.key ? cat.color : borderColor,
                borderRadius: 12,
                marginRight: cat.key !== "ambulance_scheduled" ? 8 : 0,
              }}
            >
              <Ionicons
                name={cat.icon as "car-sport" | "bus" | "medkit"}
                size={28}
                color={category === cat.key ? cat.color : textSecondary}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: "JakartaMedium",
                  color: category === cat.key ? cat.color : textSecondary,
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Pickup */}
        <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
          Pickup Location
        </Text>
        <TextInput
          style={{
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 12,
            padding: 14,
            color: textPrimary,
            fontSize: 15,
            marginBottom: 16,
          }}
          placeholder="Enter pickup address"
          placeholderTextColor={textSecondary}
          value={pickupAddress}
          onChangeText={setPickupAddress}
        />

        {/* Dropoff */}
        <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
          Dropoff Location
        </Text>
        <TextInput
          style={{
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 12,
            padding: 14,
            color: textPrimary,
            fontSize: 15,
            marginBottom: 16,
          }}
          placeholder="Enter dropoff address"
          placeholderTextColor={textSecondary}
          value={dropoffAddress}
          onChangeText={setDropoffAddress}
        />

        {/* Tracking toggle */}
        <TouchableOpacity
          onPress={() => setTrackingRequired(!trackingRequired)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 14,
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor: trackingRequired ? colors.primary : borderColor,
            borderRadius: 12,
            marginBottom: 24,
          }}
        >
          <Ionicons
            name={trackingRequired ? "checkmark-circle" : "ellipse-outline"}
            size={24}
            color={trackingRequired ? colors.primary : textSecondary}
          />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: "JakartaMedium", color: textPrimary }}>
              Live Tracking Required
            </Text>
            <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}>
              Fleet must name driver+vehicle at bid time
            </Text>
          </View>
        </TouchableOpacity>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting || !pickupAddress || !dropoffAddress}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 12,
            height: 52,
            alignItems: "center",
            justifyContent: "center",
            opacity: submitting || !pickupAddress || !dropoffAddress ? 0.5 : 1,
            marginBottom: 40,
          }}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={{ color: "#FFFFFF", fontSize: 16, fontFamily: "JakartaSemiBold" }}>
              Find Bids
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
