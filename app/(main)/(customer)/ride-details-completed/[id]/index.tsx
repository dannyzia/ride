import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const DISPUTE_REASONS = [
  { key: "route_longer", label: "Route was longer than expected" },
  { key: "wrong_vehicle", label: "Different vehicle appeared" },
  { key: "wait_fee_unfair", label: "Waiting fee seems unfair" },
  { key: "surge_unexplained", label: "Surge pricing wasn't shown" },
  { key: "other", label: "Other issue" },
];

interface RideDetail { id: string; status: string; vehicle_type: string; origin_address: string; destination_address: string; fare_breakdown: { total_bdt?: number }; created_at: string; completed_at: string | null; driver: { name: string; phone: string; vehicle_type: string; rating: number } | null; }

export default function RideDetailsCompleted() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ride, setRide] = useState<RideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [disputeModal, setDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [claimedFareTaka, setClaimedFareTaka] = useState("");
  const [disputeNote, setDisputeNote] = useState("");
  const [disputing, setDisputing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError("");
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError("Not authenticated"); return; }
        const res = await fetch(`${API_URL}/api/ride/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed to load"); return; }
        if (!cancelled) setRide(data.ride);
      } catch (err: any) { if (!cancelled) setError(err?.message || "Network error"); logger.error("RideDetailsCompleted fetch failed", err); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const submitDispute = async () => {
    if (!disputeReason || !claimedFareTaka) { Alert.alert("Error", "Select a reason and enter fair fare"); return; }
    setDisputing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${API_URL}/api/rider/fare-disputes`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ride_id: id, dispute_reason: disputeReason, claimed_fare_bdt: parseInt(claimedFareTaka, 10) * 100, rider_note: disputeNote.trim() || undefined }),
      });
      if (res.ok) { Alert.alert("Dispute Filed", "Under review. Admin will respond within 24h."); setDisputeModal(false); }
      else { const d = await res.json(); Alert.alert("Error", d.error ?? d.message ?? "Failed"); }
    } catch (_err: any) { Alert.alert("Error", "Network error"); }
    finally { setDisputing(false); }
  };

  const dateStr = ride?.completed_at ?? ride?.created_at ?? "";
  const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
  const formattedTime = dateStr ? new Date(dateStr).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-6 py-4 border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}><Text className="text-base font-Jakarta text-goPrimary">Back</Text></TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Ride Details</Text>
        <View className="w-12" />
      </View>
      {loading ? <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#0CC25F" /></View>
      : error ? <View className="flex-1 items-center justify-center px-6"><Text className="text-[15px] font-Jakarta text-goDanger text-center mb-4">{error}</Text></View>
      : !ride ? <View className="flex-1 items-center justify-center"><Text className="text-lg font-JakartaBold text-goTextSecondaryLight dark:text-goTextSecondaryDark">Ride not found</Text></View>
      : (
        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingVertical: 24 }}>
          <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-xl p-4 mb-6">
            <View className="flex-row items-center mb-3">
              <View className="w-10 h-10 rounded-full bg-goAccentLight items-center justify-center mr-3">
                <Text className="text-xl font-JakartaBold text-goPrimary">✓</Text>
              </View>
              <View className="flex-1">
                <Text className="text-base font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{ride.vehicle_type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? "Ride"}</Text>
                <Text className="text-xs font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{formattedDate} · {formattedTime}</Text>
              </View>
            </View>
            <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-1">Pickup: {ride.origin_address ?? "—"}</Text>
            <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-1">Destination: {ride.destination_address ?? "—"}</Text>
            <Text className="text-sm font-JakartaBold text-goPrimary">Fare: ৳{((ride.fare_breakdown?.total_bdt ?? 0) / 100).toFixed(0)}</Text>
            {ride.driver && <Text className="text-sm font-Jakarta text-goTextSecondaryLight mt-1">Driver: {ride.driver.name}</Text>}
          </View>
          <View className="flex-row gap-3 mb-3">
            <TouchableOpacity className="flex-1 bg-goPrimary rounded-full py-3.5 items-center" onPress={() => router.push("/(main)/(customer)/rate-driver")}>
              <Text className="text-base font-JakartaBold text-goWhite">Rate Driver</Text>
            </TouchableOpacity>
            <TouchableOpacity className="flex-1 border border-goBorderLight dark:border-goBorderDark rounded-full py-3.5 items-center" onPress={() => router.push("/(main)/(customer)/add-tip")}>
              <Text className="text-base font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Add Tip</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setDisputeModal(true)} className="py-3.5 rounded-full border border-goDanger items-center">
            <Text className="text-base font-JakartaBold text-goDanger">💬 Dispute this fare</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
      <Modal visible={disputeModal} transparent animationType="slide" onRequestClose={() => setDisputeModal(false)}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark rounded-t-3xl p-6 max-h-[85%]">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Dispute Fare</Text>
              <TouchableOpacity onPress={() => setDisputeModal(false)}><Text className="text-goDanger font-JakartaBold">Cancel</Text></TouchableOpacity>
            </View>
            <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Reason</Text>
            {DISPUTE_REASONS.map((r) => (
              <TouchableOpacity key={r.key} onPress={() => setDisputeReason(r.key)}
                className={`flex-row items-center py-3 px-3 rounded-lg mb-1 ${disputeReason === r.key ? "bg-goAccentLight border border-goAccent" : ""}`}>
                <View className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${disputeReason === r.key ? "border-goAccent" : "border-goBorderLight dark:border-goBorderDark"}`}>
                  {disputeReason === r.key && <View className="w-2.5 h-2.5 rounded-full bg-goAccent" />}
                </View>
                <Text className="text-sm font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark flex-1">{r.label}</Text>
              </TouchableOpacity>
            ))}
            <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2 mt-3">Fair fare amount (BDT)</Text>
            <TextInput className="bg-goBgLight dark:bg-goBgDark border border-goBorderLight dark:border-goBorderDark rounded-lg px-4 py-3 text-goTextPrimaryLight dark:text-goTextPrimaryDark font-Jakarta text-base mb-3"
              keyboardType="numeric" value={claimedFareTaka} onChangeText={setClaimedFareTaka} placeholder="e.g. 150" placeholderTextColor="#64748B" />
            <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Note (optional)</Text>
            <TextInput className="bg-goBgLight dark:bg-goBgDark border border-goBorderLight dark:border-goBorderDark rounded-lg px-4 py-3 text-goTextPrimaryLight dark:text-goTextPrimaryDark font-Jakarta text-base mb-4"
              value={disputeNote} onChangeText={setDisputeNote} multiline placeholder="Explain why" placeholderTextColor="#64748B" />
            <TouchableOpacity onPress={submitDispute} disabled={disputing || !disputeReason || !claimedFareTaka}
              className={`py-4 rounded-full items-center ${disputing ? "bg-goBorderDark" : "bg-goPrimary"}`}>
              <Text className="text-goWhite font-JakartaBold text-base">{disputing ? "Submitting..." : "Submit Dispute"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
