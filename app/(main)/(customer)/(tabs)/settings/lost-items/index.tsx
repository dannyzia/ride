import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Alert, Modal, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

const STATUS_COLORS: Record<string, string> = {
  reported: "#F59E0B", driver_confirmed: "#0CC25F", photo_provided: "#0CC25F",
  arranged_return: "#0CC25F", resolved: "#16A34A", unresolved: "#E31D1C",
};

interface LostItem {
  id: string;
  item_description: string;
  status: string;
  driver_photo_url?: string | null;
  return_method?: string | null;
  return_fee_bdt?: number | null;
}

interface RecentRide {
  ride_id: string;
  origin_address?: string | null;
  pickup_address?: string | null;
}

export default function RiderLostItems() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const [items, setItems] = useState<LostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [recentRides, setRecentRides] = useState<RecentRide[]>([]);
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
    } catch (_err) { Alert.alert("Error", "Network error"); }
    finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-6 py-4 border-b" style={{ borderColor }}>
        <TouchableOpacity onPress={() => router.back()}><Text className="font-Jakarta text-base" style={{ color: colors.primary }}>Back</Text></TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-JakartaBold" style={{ color: textPrimary }}>Lost Items</Text>
        <View className="w-12" />
      </View>
      {loading ? <ActivityIndicator size="large" color={colors.primary} className="mt-10" /> : error && items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6"><Text className="text-sm font-Jakarta text-center" style={{ color: colors.danger }}>{error}</Text></View>
      ) : (
        <FlatList className="flex-1 px-6" data={items} keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingVertical: 16 }}
          ListEmptyComponent={<Text className="text-center font-Jakarta py-8" style={{ color: textSecondary }}>No lost item reports</Text>}
          renderItem={({ item }) => (
            <View className="border rounded-xl p-4 mb-3" style={{ backgroundColor: surfaceBg, borderColor }}>
              <View className="flex-row justify-between items-start mb-1">
                <Text className="flex-1 text-sm font-JakartaBold" style={{ color: textPrimary }}>{item.item_description}</Text>
                <Text className="text-xs font-JakartaBold" style={{ color: STATUS_COLORS[item.status] ?? textSecondary }}>{item.status.replace(/_/g, " ")}</Text>
              </View>
              {item.driver_photo_url && (
                <View className="flex-row items-center mt-1">
                  <Ionicons name="camera" size={12} color={textSecondary} style={{ marginRight: 4 }} />
                  <Text className="text-xs font-Jakarta" style={{ color: textSecondary }}>Photo provided</Text>
                </View>
              )}
              {item.return_method && <Text className="text-xs font-Jakarta mt-0.5" style={{ color: textSecondary }}>Return: {item.return_method.replace(/_/g, " ")}</Text>}
              {(item.return_fee_bdt ?? 0) > 0 && <Text className="text-xs font-JakartaBold mt-0.5" style={{ color: colors.accent }}>Fee: ৳{(item.return_fee_bdt! / 100).toFixed(0)}</Text>}
            </View>
          )}
        />
      )}
      <TouchableOpacity onPress={openReport} className="mx-6 mb-6 py-4 rounded-full items-center" style={{ backgroundColor: colors.accent }}>
        <Text className="text-goWhite font-JakartaBold text-base">Report Lost Item</Text>
      </TouchableOpacity>
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="rounded-t-3xl p-6 max-h-[80%]" style={{ backgroundColor: surfaceBg }}>
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-JakartaBold" style={{ color: textPrimary }}>Report Lost Item</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Text className="font-JakartaBold" style={{ color: colors.danger }}>Cancel</Text></TouchableOpacity>
            </View>
            <Text className="text-sm font-Jakarta mb-2" style={{ color: textSecondary }}>Select Ride</Text>
            <FlatList data={recentRides} keyExtractor={(r) => r.ride_id} style={{ maxHeight: 120 }} className="mb-3"
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => setSelectedRideId(item.ride_id)}
                  className="py-2 px-3 rounded-lg mb-1 border"
                  style={selectedRideId === item.ride_id
                    ? { backgroundColor: colors.accentLight, borderColor: colors.accent }
                    : { backgroundColor: bg, borderColor }}>
                  <Text className="text-sm font-Jakarta" style={{ color: textPrimary }}>{item.origin_address ?? item.pickup_address ?? "Ride"}</Text>
                </TouchableOpacity>
              )}
            />
            <Text className="text-sm font-Jakarta mb-2" style={{ color: textSecondary }}>Describe the item</Text>
            <TextInput className="border rounded-lg px-4 py-3 font-Jakarta text-sm mb-4"
              style={{ backgroundColor: bg, borderColor, color: textPrimary }}
              value={description} onChangeText={setDescription} multiline placeholder="e.g. Black wallet in back seat" placeholderTextColor={textSecondary} />
            <TouchableOpacity onPress={submitReport} disabled={submitting}
              className="py-4 rounded-full items-center"
              style={{ backgroundColor: submitting ? (isDark ? colors.borderDark : colors.borderLight) : colors.accent }}>
              <Text className="text-goWhite font-JakartaBold text-base">{submitting ? "Submitting..." : "Submit Report"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
