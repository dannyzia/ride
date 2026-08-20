import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

interface LostItem {
  id: string;
  item_description: string;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  reported: colors.amber, driver_confirmed: colors.primary, photo_provided: colors.primary,
  arranged_return: colors.primary, resolved: colors.greenVariant, unresolved: colors.danger,
};

export default function DriverLostItems() {
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
      const body: { item_id: string; action: string; return_method?: string } = { item_id: itemId, action };
      if (action === 'return_arranged') body.return_method = 'driver_returns';
      const res = await fetch(`${API_URL}/api/driver/lost-items`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) { Alert.alert("Updated", "Response submitted."); fetchItems(); }
      else { const d = await res.json(); Alert.alert("Error", d.error ?? "Failed"); }
    } catch { Alert.alert("Error", "Network error"); }
    finally { setSubmittingId(null); }
  };

  if (error && items.length === 0 && !loading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <View className="flex-row items-center px-6 py-4 border-b" style={{ borderBottomColor: borderColor }}>
          <TouchableOpacity onPress={() => router.back()}><Text className="text-goPrimary font-Jakarta text-base">Back</Text></TouchableOpacity>
          <Text className="flex-1 text-center text-lg font-JakartaBold" style={{ color: textPrimary }}>Lost Item Reports</Text>
          <View className="w-12" />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm font-Jakarta text-goDanger text-center">{error}</Text>
        </View>
        <TouchableOpacity
          onPress={() => setTheme(isDark ? "light" : "dark")}
          className="absolute top-16 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-6 py-4 border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}><Text className="text-goPrimary font-Jakarta text-base">Back</Text></TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-JakartaBold" style={{ color: textPrimary }}>Lost Item Reports</Text>
        <View className="w-12" />
      </View>
      {loading ? <ActivityIndicator size="large" color={colors.primary} className="mt-10" /> : (
        <FlatList className="flex-1 px-6" data={items} keyExtractor={(r: LostItem) => r.id}
          contentContainerStyle={{ paddingVertical: 16 }}
          ListEmptyComponent={<Text className="text-center font-Jakarta py-8" style={{ color: textSecondary }}>No reports</Text>}
          renderItem={({ item }) => (
            <View className="border rounded-xl p-4 mb-3" style={{ backgroundColor: surfaceBg, borderColor }}>
              <View className="flex-row justify-between items-start mb-1">
                <Text className="flex-1 text-sm font-JakartaBold" style={{ color: textPrimary }}>{item.item_description}</Text>
                <Text className="text-xs font-JakartaBold" style={STATUS_COLORS[item.status] ? { color: STATUS_COLORS[item.status] } : undefined}>{item.status.replace(/_/g, " ")}</Text>
              </View>
              {item.status === 'reported' && (
                <View className="flex-row gap-3 mt-2">
                  <TouchableOpacity onPress={() => respond(item.id, 'confirm')} disabled={submittingId === item.id}
                    className={`flex-1 py-2 rounded-full items-center ${submittingId === item.id ? "bg-goBorderDark" : ""}`}
                    style={submittingId === item.id ? undefined : { backgroundColor: colors.primary }}>
                    {submittingId === item.id ? (
                      <Text className="text-goWhite font-JakartaBold text-sm">...</Text>
                    ) : (
                      <View className="flex-row items-center gap-2">
                        <Ionicons name="checkmark-circle" size={16} color={colors.white} />
                        <Text className="text-goWhite font-JakartaBold text-sm">I Have It</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => respond(item.id, 'not_found')} disabled={submittingId === item.id}
                    className={`flex-1 py-2 rounded-full items-center border border-goDanger ${submittingId === item.id ? "opacity-40" : ""}`}>
                    <View className="flex-row items-center gap-2">
                      <Ionicons name="close-circle" size={16} color={colors.danger} />
                      <Text className="text-goDanger font-JakartaBold text-sm">Not Found</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
              {item.status === 'driver_confirmed' && (
                <TouchableOpacity onPress={() => respond(item.id, 'return_arranged')} disabled={submittingId === item.id}
                  className={`mt-2 py-2 rounded-full items-center ${submittingId === item.id ? "bg-goBorderDark" : ""}`}
                  style={submittingId === item.id ? undefined : { backgroundColor: colors.primary }}>
                  <Text className="text-goWhite font-JakartaBold text-sm">{submittingId === item.id ? "..." : "Arrange Return"}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-16 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
