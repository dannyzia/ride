import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const STATUS_COLORS: Record<string, string> = {
  reported: "text-goAmber", driver_confirmed: "text-goPrimary", photo_provided: "text-goPrimary",
  arranged_return: "text-goAccent", resolved: "text-goGreenVariant", unresolved: "text-goDanger",
};

export default function DriverLostItems() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setError("");
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/driver/lost-items`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setItems((await res.json()).items ?? []);
      else setError("Failed to load. Pull down to refresh.");
    } catch (e) { setError("Failed to load. Pull down to refresh."); logger.error("Fetch driver lost items failed", e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const respond = async (itemId: string, action: string) => {
    setSubmittingId(itemId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { Alert.alert("Error", "Not authenticated"); return; }
      const body: any = { item_id: itemId, action };
      if (action === 'return_arranged') body.return_method = 'driver_returns';
      const res = await fetch(`${API_URL}/api/driver/lost-items`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) { Alert.alert("Updated", "Response submitted."); fetchItems(); }
      else { const d = await res.json(); Alert.alert("Error", d.error ?? "Failed"); }
    } catch (_err: any) { Alert.alert("Error", "Network error"); }
    finally { setSubmittingId(null); }
  };

  if (error && items.length === 0 && !loading) {
    return (
      <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
        <View className="flex-row items-center px-6 py-4 border-b border-goBorderLight dark:border-goBorderDark">
          <TouchableOpacity onPress={() => router.back()}><Text className="text-goPrimary font-Jakarta text-base">Back</Text></TouchableOpacity>
          <Text className="flex-1 text-center text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Lost Item Reports</Text>
          <View className="w-12" />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm font-Jakarta text-goDanger text-center">{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-6 py-4 border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}><Text className="text-goPrimary font-Jakarta text-base">Back</Text></TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Lost Item Reports</Text>
        <View className="w-12" />
      </View>
      {loading ? <ActivityIndicator size="large" color="#0A9B4C" className="mt-10" /> : (
        <FlatList className="flex-1 px-6" data={items} keyExtractor={(r: any) => r.id}
          contentContainerStyle={{ paddingVertical: 16 }}
          ListEmptyComponent={<Text className="text-center font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark py-8">No reports</Text>}
          renderItem={({ item }) => (
            <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-xl p-4 mb-3">
              <View className="flex-row justify-between items-start mb-1">
                <Text className="flex-1 text-sm font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{item.item_description}</Text>
                <Text className={`text-xs font-JakartaBold ${STATUS_COLORS[item.status] ?? ""}`}>{item.status.replace(/_/g, " ")}</Text>
              </View>
              {item.status === 'reported' && (
                <View className="flex-row gap-3 mt-2">
                  <TouchableOpacity onPress={() => respond(item.id, 'confirm')} disabled={submittingId === item.id}
                    className={`flex-1 py-2 rounded-full items-center ${submittingId === item.id ? "bg-goBorderDark" : "bg-goAccent"}`}>
                    <Text className="text-goWhite font-JakartaBold text-sm">{submittingId === item.id ? "..." : "✓ I Have It"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => respond(item.id, 'not_found')} disabled={submittingId === item.id}
                    className={`flex-1 py-2 rounded-full border border-goDanger items-center ${submittingId === item.id ? "opacity-40" : ""}`}>
                    <Text className="text-goDanger font-JakartaBold text-sm">✗ Not Found</Text>
                  </TouchableOpacity>
                </View>
              )}
              {item.status === 'driver_confirmed' && (
                <TouchableOpacity onPress={() => respond(item.id, 'return_arranged')} disabled={submittingId === item.id}
                  className={`mt-2 py-2 rounded-full items-center ${submittingId === item.id ? "bg-goBorderDark" : "bg-goAccent"}`}>
                  <Text className="text-goWhite font-JakartaBold text-sm">{submittingId === item.id ? "..." : "Arrange Return"}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
