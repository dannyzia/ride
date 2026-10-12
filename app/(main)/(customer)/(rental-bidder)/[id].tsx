/**
 * Rental assignment detail — fleet staff picks a driver + vehicle for a won bid.
 * §F.6: 5-min SLA ring, driver picker, vehicle picker, ride-hailing overlap warning,
 * force-withdraw pre-assignment only (hidden once picked).
 *
 * Route: /(rental-bidder)/[id] — id is the assignment ID.
 */
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useTranslation } from "react-i18next";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";
const SLA_MINUTES = 5;

interface Assignment {
  id: string;
  request_id: string;
  bid_id: string;
  fleet_id: string;
  status: string;
  driver_user_id: string | null;
  vehicle_id: string | null;
  released_at: string | null;
  assigned_at: string | null;
  fulfilled_at: string | null;
}

interface Driver {
  id: string;
  user_id: string;
  name: string;
  vehicle_type: string;
  rating: number;
  completed_rides_count: number;
  is_online: boolean;
}

interface Vehicle {
  id: string;
  registration_number: string;
  body_type: string;
  vehicle_type: string;
}

export default function AssignmentDetailScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const { id } = useLocalSearchParams<{ id: string }>();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      // Fetch assignment detail
      const assignRes = await fetch(`${SERVER_URL}/api/rental/assignments/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (assignRes.ok) {
        const data = await assignRes.json();
        setAssignment(data.assignment);
      }

      // Fetch fleet drivers and vehicles (need fleet_id from assignment)
      if (assignment?.fleet_id) {
        const driversRes = await fetch(
          `${SERVER_URL}/api/fleet/${assignment.fleet_id}/drivers`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (driversRes.ok) {
          const dData = await driversRes.json();
          setDrivers((dData.drivers ?? []).filter((d: Driver) => d.is_online));
        }

        const vehiclesRes = await fetch(
          `${SERVER_URL}/api/fleet/${assignment.fleet_id}/vehicles`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (vehiclesRes.ok) {
          const vData = await vehiclesRes.json();
          setVehicles(vData.vehicles ?? []);
        }
      }
    } catch (err) {
      logger.error("[assignment] fetch error", err);
    } finally {
      setLoading(false);
    }
  }, [id, assignment?.fleet_id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // SLA countdown
  const slaRemaining = assignment?.assigned_at
    ? Math.max(0, SLA_MINUTES * 60 - Math.floor((Date.now() - new Date(assignment.assigned_at).getTime()) / 1000))
    : SLA_MINUTES * 60;
  const slaMinutes = Math.floor(slaRemaining / 60);
  const slaSeconds = slaRemaining % 60;

  const isFulfilled = assignment?.status === "fulfilled";
  const canPick = !isFulfilled && !assignment?.released_at;
  const canWithdraw = !isFulfilled && !assignment?.released_at && !assignment?.driver_user_id;

  const handlePick = async () => {
    if (!selectedDriver || !selectedVehicle || !id) return;
    setPicking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`${SERVER_URL}/api/rental/assignments/${id}/pick`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          driver_user_id: selectedDriver,
          vehicle_id: selectedVehicle,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        Alert.alert(t("rental_assignment.err_pick_title"), data.message || t("rental_assignment.err_pick_body"));
        return;
      }

      Alert.alert(t("rental_assignment.driver_assigned_title"), t("rental_assignment.driver_assigned_body"), [
        { text: t("common.ok"), onPress: () => router.back() },
      ]);
    } catch (err) {
      logger.error("[assignment] pick error", err);
      Alert.alert(t("common.error"), t("rental_assignment.err_pick_body"));
    } finally {
      setPicking(false);
    }
  };

  const handleWithdraw = async () => {
    if (!id) return;
    Alert.alert(t("rental_assignment.withdraw_title"), t("rental_assignment.withdraw_body"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("rental_assignment.withdraw_confirm"),
        style: "destructive",
        onPress: async () => {
          setWithdrawing(true);
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) return;

            // Use the bid withdraw endpoint
            const res = await fetch(`${SERVER_URL}/api/rental/bids/${assignment?.bid_id}/withdraw`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ force: true }),
            });

            if (!res.ok) {
              const data = await res.json();
              Alert.alert(t("rental_assignment.err_withdraw_title"), data.message || t("rental_assignment.err_withdraw_body"));
              return;
            }

            Alert.alert(t("rental_assignment.withdrawn_title"), t("rental_assignment.withdrawn_body"), [
              { text: t("common.ok"), onPress: () => router.back() },
            ]);
          } catch (err) {
            logger.error("[assignment] withdraw error", err);
          } finally {
            setWithdrawing(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} testID="customer.rental-bidder.id.el-1">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
          {isFulfilled ? t("rental_assignment.title_complete") : t("rental_assignment.title")}
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
        {/* SLA Ring */}
        {!isFulfilled && (
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View
              style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                borderWidth: 4,
                borderColor: slaRemaining > 120 ? colors.primary : slaRemaining > 60 ? colors.amber : colors.danger,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 28, fontFamily: "JakartaBold", color: textPrimary }}>
                {slaMinutes}:{String(slaSeconds).padStart(2, "0")}
              </Text>
              <Text style={{ fontSize: 11, fontFamily: "Jakarta", color: textSecondary }}>{t("rental_assignment.sla_label")}</Text>
            </View>
            <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 8 }}>
              {t("rental_assignment.sla_hint", { minutes: SLA_MINUTES })}
            </Text>
          </View>
        )}

        {/* §B.7 Ride-hailing overlap warning */}
        <View style={{ backgroundColor: colors.amber + "18", borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="warning" size={18} color={colors.amber} />
            <Text style={{ fontSize: 13, fontFamily: "JakartaSemiBold", color: colors.amber, marginLeft: 8 }}>
              {t("rental_assignment.overlap_warning")}
            </Text>
          </View>
          <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 6 }}>
            {t("rental_assignment.overlap_body")}
          </Text>
        </View>

        {/* Status */}
        <View style={{ backgroundColor: surfaceBg, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor }}>
          <Text style={{ fontSize: 14, fontFamily: "JakartaSemiBold", color: textPrimary }}>{t("rental_assignment.status_label")}</Text>
          <Text style={{ fontSize: 13, fontFamily: "Jakarta", color: textSecondary, marginTop: 4 }}>
            {isFulfilled
              ? t("rental_assignment.status_fulfilled")
              : assignment?.driver_user_id
                ? t("rental_assignment.status_picked")
                : t("rental_assignment.status_none")}
          </Text>
        </View>

        {/* Driver Picker */}
        {canPick && (
          <>
            <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
              {t("rental_assignment.select_driver")}
            </Text>
            {drivers.length === 0 ? (
              <Text style={{ fontSize: 13, fontFamily: "Jakarta", color: textSecondary, marginBottom: 16 }}>
                {t("rental_assignment.no_online_drivers")}
              </Text>
            ) : (
              drivers.map((d) => {
                const isSelected = selectedDriver === d.id;
                return (
                  <TouchableOpacity
                    key={d.id}
                    onPress={() => setSelectedDriver(d.id)}
                    style={{
                      backgroundColor: surfaceBg,
                      borderWidth: 2,
                      borderColor: isSelected ? colors.primary : borderColor,
                      borderRadius: 12,
                      padding: 14,
                      marginBottom: 8,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                   testID="customer.rental-bidder.id.set-selected-driver">
                    <View style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: colors.primary + "20",
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 12,
                    }}>
                      <Ionicons name="person" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: "JakartaSemiBold", color: textPrimary }}>
                        {d.name}
                      </Text>
                      <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary }}>
                        {t("rental_assignment.driver_meta", {
                          vehicle: d.vehicle_type.replace(/_/g, " "),
                          rating: d.rating?.toFixed(1) ?? "5.0",
                          trips: d.completed_rides_count,
                        })}
                      </Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })
            )}

            {/* Vehicle Picker */}
            {selectedDriver && (
              <>
                <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8, marginTop: 12 }}>
                  {t("rental_assignment.select_vehicle")}
                </Text>
                {vehicles.map((v) => {
                  const isSelected = selectedVehicle === v.id;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => setSelectedVehicle(v.id)}
                      style={{
                        backgroundColor: surfaceBg,
                        borderWidth: 2,
                        borderColor: isSelected ? colors.primary : borderColor,
                        borderRadius: 12,
                        padding: 14,
                        marginBottom: 8,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                     testID="customer.rental-bidder.id.set-selected-vehicle">
                      <Ionicons name="car" size={20} color={isSelected ? colors.primary : textSecondary} style={{ marginRight: 12 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontFamily: "JakartaSemiBold", color: textPrimary }}>
                          {v.registration_number}
                        </Text>
                        <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary }}>
                          {v.body_type} · {v.vehicle_type.replace(/_/g, " ")}
                        </Text>
                      </View>
                      {isSelected && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Bottom actions */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        {canPick && selectedDriver && selectedVehicle && (
          <TouchableOpacity
            onPress={handlePick}
            disabled={picking}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 12,
              height: 52,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 8,
            }}
           testID="customer.rental-bidder.id.handle-pick">
            {picking ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
            <Text style={{ color: "#FFFFFF", fontSize: 16, fontFamily: "JakartaSemiBold" }}>
              {t("rental_assignment.assign_driver")}
            </Text>
            )}
          </TouchableOpacity>
        )}

        {canWithdraw && (
          <TouchableOpacity
            onPress={handleWithdraw}
            disabled={withdrawing}
            style={{
              borderWidth: 2,
              borderColor: colors.danger,
              borderRadius: 12,
              height: 52,
              alignItems: "center",
              justifyContent: "center",
            }}
           testID="customer.rental-bidder.id.handle-withdraw">
            <Text style={{ color: colors.danger, fontSize: 16, fontFamily: "JakartaSemiBold" }}>
              {t("rental_assignment.withdraw_cta")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
