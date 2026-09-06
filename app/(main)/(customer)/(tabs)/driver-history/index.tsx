import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

interface Trip {
  ride_id: string;
  origin_address: string;
  destination_address: string;
  status: string;
  vehicle_type: string;
  fare_breakdown: { total_bdt?: number } | null;
  created_at: string;
}

export default function DriverTripHistory() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

useEffect(() => {
     let cancelled = false;
     (async () => {
       try {
         setLoading(true); setError("");
         const { data: { session } } = await supabase.auth.getSession();
         const token = session?.access_token;
         if (!token) { setError(t('wallet.not_authenticated')); setLoading(false); return; }
         const res = await fetch(`${API_URL}/api/ride/get-all`, {
           headers: { Authorization: `Bearer ${token}` },
         });
         const json = await res.json();
         if (!res.ok) { setError(json.error || t('driver_history.failed_to_load')); return; }
         if (!cancelled) setTrips(json.data || []);
       } catch (err) {
         if (!cancelled) setError((err instanceof Error ? err.message : String(err)) || t('wallet.network_error'));
       } finally {
         if (!cancelled) setLoading(false);
       }
     })();
     return () => { cancelled = true; };
   }, [t]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat("bn-BD", {
        month: "short",
        day: "numeric",
        numberingSystem: "latn",
        timeZone: "Asia/Dhaka",
      }).format(d);
    } catch { return iso; }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px]" style={{ borderBottomWidth: 1, borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('driver_history.title')}</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-center" style={{ color: colors.danger }}>{error}</Text>
        </View>
      ) : trips.length === 0 ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta" style={{ color: textSecondary }}>{t('driver_history.no_trips')}</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          {trips.map((trip) => (
            <TouchableOpacity
              key={trip.ride_id}
              className="flex-row justify-between items-center p-[14px] border rounded-[12px] mb-3"
              style={{ backgroundColor: surfaceBg, borderColor }}
              onPress={() => router.push(`/(main)/(customer)/(tabs)/driver-history/${trip.ride_id}`)}
            >
              <View>
                <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>
                  {trip.destination_address ?? t('driver_history.destination')}
                </Text>
                <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                  {formatDate(trip.created_at)} · {trip.vehicle_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </Text>
              </View>
              <Text className="text-[15px] font-JakartaBold" style={{ color: colors.primary }}>
                ৳{((trip.fare_breakdown?.total_bdt ?? 0) / 100).toFixed(0)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
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
