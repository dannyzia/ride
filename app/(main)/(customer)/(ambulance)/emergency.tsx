/**
 * Customer emergency ambulance screen (Phase 6) — create an emergency
 * request (POST /api/emergency/requests), then poll its status until
 * assigned/en-route/completed. Cancel allowed until terminal (§B.5).
 * patient_condition is stored but never broadcast (F41).
 */
import { useCallback, useEffect, useRef, useState } from "react";
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
import { useEmergencyStore } from "@/store/useEmergencyStore";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

const STATUS_STEPS = [
  { key: "broadcasting", label: "Finding ambulance…" },
  { key: "assigned", label: "Ambulance assigned" },
  { key: "en_route_pickup", label: "Ambulance en route" },
  { key: "arrived", label: "Ambulance arrived" },
  { key: "en_route_dropoff", label: "Transporting patient" },
  { key: "completed", label: "Trip complete" },
];

export default function EmergencyAmbulanceScreen() {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const { activeEmergency, setActiveEmergency } = useEmergencyStore();
  const [serviceLevel, setServiceLevel] = useState<"BLS" | "ALS">("BLS");
  const [requiresParamedic, setRequiresParamedic] = useState(false);
  const [patientCondition, setPatientCondition] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Poll the active emergency's status (REST canonical — F25)
  const emergencyId = activeEmergency?.id ?? null;
  useEffect(() => {
    stopPolling();
    if (!emergencyId) return;
    pollRef.current = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${SERVER_URL}/api/emergency/requests/${emergencyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.request) {
          setActiveEmergency(data.request);
          if (["completed", "cancelled", "failed"].includes(data.request.status)) {
            stopPolling();
          }
        }
      } catch (err) {
        logger.error("[emergency] poll error", err);
      }
    }, 3000);
    return stopPolling;
  }, [emergencyId, setActiveEmergency, stopPolling]);

  const handleCreate = async () => {
    if (!pickupAddress || !patientCondition) {
      Alert.alert("Missing Info", "Pickup location and patient condition are required");
      return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`${SERVER_URL}/api/emergency/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pickup_address: pickupAddress,
          pickup_lat: 23.8103, // TODO: use actual GPS
          pickup_lng: 90.4125,
          dropoff_address: dropoffAddress || undefined,
          patient_condition: patientCondition,
          requires_paramedic: requiresParamedic,
          service_level: serviceLevel,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.message || "Could not broadcast emergency");
        return;
      }

      setActiveEmergency(data.request);
    } catch (err) {
      logger.error("[emergency] create error", err);
      Alert.alert("Error", "Could not broadcast emergency");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!activeEmergency) return;
    setCancelling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(
        `${SERVER_URL}/api/emergency/requests/${activeEmergency.id}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason: "cancelled_by_caller" }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setActiveEmergency(data.request);
        stopPolling();
      } else {
        const data = await res.json();
        Alert.alert("Error", data.message || "Could not cancel");
      }
    } catch (err) {
      logger.error("[emergency] cancel error", err);
    } finally {
      setCancelling(false);
    }
  };

  const statusIndex = activeEmergency
    ? STATUS_STEPS.findIndex((s) => s.key === activeEmergency.status)
    : -1;
  const isTerminal =
    activeEmergency != null &&
    ["completed", "cancelled", "failed"].includes(activeEmergency.status);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: colors.danger, marginLeft: 12 }}>
          Emergency Ambulance
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
        {activeEmergency ? (
          <>
            {/* Status panel */}
            <View style={{ backgroundColor: colors.danger + "12", borderWidth: 1, borderColor: colors.danger, borderRadius: 16, padding: 16, marginBottom: 16 }}>
              <View accessibilityLiveRegion="polite" accessibilityLabel={`Emergency status: ${activeEmergency.status.replace(/_/g, " ")}`}>
                {isTerminal ? (
                  <Text style={{ fontSize: 16, fontFamily: "JakartaSemiBold", color: textPrimary }}>
                    {activeEmergency.status === "completed"
                      ? "Trip complete"
                      : activeEmergency.status === "cancelled"
                        ? "Emergency cancelled"
                        : "No ambulance accepted in time"}
                  </Text>
                ) : (
                  STATUS_STEPS.map((step, i) => (
                    <View key={step.key} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}>
                      <Ionicons
                        name={i <= statusIndex ? "checkmark-circle" : "ellipse-outline"}
                        size={18}
                        color={i <= statusIndex ? colors.danger : textSecondary}
                      />
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: i === statusIndex ? "JakartaSemiBold" : "Jakarta",
                          color: i <= statusIndex ? textPrimary : textSecondary,
                          marginLeft: 8,
                        }}
                      >
                        {step.label}
                      </Text>
                    </View>
                  ))
                )}
              </View>
              <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 8 }}>
                {activeEmergency.service_level} · {activeEmergency.pickup_address}
              </Text>
            </View>

            {!isTerminal && (
              <TouchableOpacity
                onPress={handleCancel}
                disabled={cancelling}
                style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor: colors.danger, borderRadius: 12, height: 48, alignItems: "center", justifyContent: "center", marginBottom: 40 }}
                accessibilityRole="button"
                accessibilityLabel="Cancel emergency request"
              >
                {cancelling ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Text style={{ color: colors.danger, fontSize: 15, fontFamily: "JakartaSemiBold" }}>
                    Cancel Emergency
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            {/* Service level */}
            <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
              Service level
            </Text>
            <View style={{ flexDirection: "row", marginBottom: 16 }}>
              {(["BLS", "ALS"] as const).map((lvl) => (
                <TouchableOpacity
                  key={lvl}
                  onPress={() => setServiceLevel(lvl)}
                  accessibilityRole="button"
                  accessibilityLabel={`Service level ${lvl}`}
                  accessibilityState={{ selected: serviceLevel === lvl }}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    alignItems: "center",
                    backgroundColor: serviceLevel === lvl ? colors.danger + "18" : surfaceBg,
                    borderWidth: 2,
                    borderColor: serviceLevel === lvl ? colors.danger : borderColor,
                    borderRadius: 12,
                    marginRight: lvl === "BLS" ? 8 : 0,
                  }}
                >
                  <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: serviceLevel === lvl ? colors.danger : textSecondary }}>
                    {lvl}
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}>
                    {lvl === "BLS" ? "Basic life support" : "Advanced + paramedic"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Paramedic toggle */}
            <TouchableOpacity
              onPress={() => setRequiresParamedic(!requiresParamedic)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 14,
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor: requiresParamedic ? colors.danger : borderColor,
                borderRadius: 12,
                marginBottom: 16,
              }}
              accessibilityRole="button"
              accessibilityLabel="Requires paramedic"
              accessibilityState={{ selected: requiresParamedic }}
            >
              <Ionicons
                name={requiresParamedic ? "checkmark-circle" : "ellipse-outline"}
                size={24}
                color={requiresParamedic ? colors.danger : textSecondary}
              />
              <Text style={{ fontSize: 15, fontFamily: "JakartaMedium", color: textPrimary, marginLeft: 12 }}>
                Paramedic required
              </Text>
            </TouchableOpacity>

            {/* Patient condition — stored, NEVER broadcast (F41) */}
            <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
              Patient condition
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
                minHeight: 80,
                textAlignVertical: "top",
                marginBottom: 16,
              }}
              placeholder="Visible only to you and the responding crew"
              placeholderTextColor={textSecondary}
              value={patientCondition}
              onChangeText={setPatientCondition}
              multiline
              accessibilityLabel="Patient condition"
            />

            {/* Pickup */}
            <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
              Pickup Location
            </Text>
            <TextInput
              style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor, borderRadius: 12, padding: 14, color: textPrimary, fontSize: 15, marginBottom: 16 }}
              placeholder="Enter pickup address"
              placeholderTextColor={textSecondary}
              value={pickupAddress}
              onChangeText={setPickupAddress}
              accessibilityLabel="Pickup address"
            />

            {/* Dropoff (optional) */}
            <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
              Dropoff (optional)
            </Text>
            <TextInput
              style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor, borderRadius: 12, padding: 14, color: textPrimary, fontSize: 15, marginBottom: 20 }}
              placeholder="Hospital / destination"
              placeholderTextColor={textSecondary}
              value={dropoffAddress}
              onChangeText={setDropoffAddress}
              accessibilityLabel="Dropoff address"
            />

            <TouchableOpacity
              onPress={handleCreate}
              disabled={submitting || !pickupAddress || !patientCondition}
              style={{
                backgroundColor: colors.danger,
                borderRadius: 12,
                height: 56,
                alignItems: "center",
                justifyContent: "center",
                opacity: submitting || !pickupAddress || !patientCondition ? 0.5 : 1,
                marginBottom: 40,
              }}
              accessibilityRole="button"
              accessibilityLabel="Call ambulance now"
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontFamily: "JakartaSemiBold" }}>
                  Call Ambulance Now
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
