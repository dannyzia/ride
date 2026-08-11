import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Alert, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const STATUS_COLORS: Record<string, string> = {
  reported: "text-goAmber dark:text-goAmber", driver_confirmed: "text-goPrimary", photo_provided: "text-goPrimary",
  arranged_return: "text-goAccent", resolved: "text-goGreenVariant", unresolved: "text-goDanger dark:text-goDanger",
};

export default function RiderLostItems() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [recentRides, setRecentRides] = useState<any[]>([]);
  const [selectedRideId, setSelectedRideId] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      setError("");
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/rider/lost-items`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setItems((await res.json()).items ?? []);
    } catch (e) { setError("Failed to load. Pull down to refresh."); logger.error("Fetch lost items failed", e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openReport = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (token) {
      const res = await fetch(`${API_URL}/api/ride/get-all`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setRecentRides((await res.json()).data ?? []);
    }
    setModalVisible(true);
  };

  const submitReport = async () => {
    if (!selectedRideId || description.trim().length < 3) { Alert.alert("Error", "Select a ride and describe the item (min 3 chars)"); return; }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${API_URL}/api/rider/lost-items`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ride_id: selectedRideId, item_description: description.trim() }),
      });
      if (res.ok) { Alert.alert("Reported", "Driver has been notified."); setModalVisible(false); setDescription(""); fetchItems(); }
      else { const d = await res.json(); Alert.alert("Error", d.error ?? "Failed"); }
    } catch (_err: any) { Alert.alert("Error", "Network error"); }
    finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-6 py-4 border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}><Text className="text-goPrimary font-Jakarta text-base">Back</Text></TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Lost Items</Text>
        <View className="w-12" />
      </View>
      {loading ? <ActivityIndicator size="large" color="#0A9B4C" className="mt-10" /> : error && items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6"><Text className="text-sm font-Jakarta text-goDanger text-center">{error}</Text></View>
      ) : (
        <FlatList className="flex-1 px-6" data={items} keyExtractor={(r: any) => r.id}
          contentContainerStyle={{ paddingVertical: 16 }}
          ListEmptyComponent={<Text className="text-center font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark py-8">No lost item reports</Text>}
          renderItem={({ item }) => (
            <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-xl p-4 mb-3">
              <View className="flex-row justify-between items-start mb-1">
                <Text className="flex-1 text-sm font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{item.item_description}</Text>
                <Text className={`text-xs font-JakartaBold ${STATUS_COLORS[item.status] ?? "text-goTextSecondaryDark"}`}>{item.status.replace(/_/g, " ")}</Text>
              </View>
              {item.driver_photo_url && <Text className="text-xs font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">📷 Photo provided</Text>}
              {item.return_method && <Text className="text-xs font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-0.5">Return: {item.return_method.replace(/_/g, " ")}</Text>}
              {(item.return_fee_bdt ?? 0) > 0 && <Text className="text-xs font-JakartaBold text-goAccent mt-0.5">Fee: ৳{(item.return_fee_bdt / 100).toFixed(0)}</Text>}
            </View>
          )}
        />
      )}
      <TouchableOpacity onPress={openReport} className="mx-6 mb-6 py-4 rounded-full bg-goAccent items-center">
        <Text className="text-goWhite font-JakartaBold text-base">Report Lost Item</Text>
      </TouchableOpacity>
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark rounded-t-3xl p-6 max-h-[80%]">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Report Lost Item</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Text className="text-goDanger font-JakartaBold">Cancel</Text></TouchableOpacity>
            </View>
            <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Select Ride</Text>
            <FlatList data={recentRides} keyExtractor={(r: any) => r.ride_id} style={{ maxHeight: 120 }} className="mb-3"
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => setSelectedRideId(item.ride_id)}
                  className={`py-2 px-3 rounded-lg mb-1 ${selectedRideId === item.ride_id ? "bg-goAccentLight border border-goAccent" : "bg-goBgLight dark:bg-goBgDark"}`}>
                  <Text className="text-sm font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">{item.origin_address ?? item.pickup_address ?? "Ride"}</Text>
                </TouchableOpacity>
              )}
            />
            <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Describe the item</Text>
            <TextInput className="bg-goBgLight dark:bg-goBgDark border border-goBorderLight dark:border-goBorderDark rounded-lg px-4 py-3 text-goTextPrimaryLight dark:text-goTextPrimaryDark font-Jakarta text-sm mb-4"
              value={description} onChangeText={setDescription} multiline placeholder="e.g. Black wallet in back seat" placeholderTextColor="#64748B" />
            <TouchableOpacity onPress={submitReport} disabled={submitting}
              className={`py-4 rounded-full items-center ${submitting ? "bg-goBorderDark" : "bg-goAccent"}`}>
              <Text className="text-goWhite font-JakartaBold text-base">{submitting ? "Submitting..." : "Submit Report"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
