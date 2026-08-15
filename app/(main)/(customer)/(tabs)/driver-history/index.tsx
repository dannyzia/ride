import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";

interface Trip {
  ride_id: string;
  origin_address: string;
  destination_address: string;
  status: string;
  vehicle_type: string;
  fare_breakdown: any;
  created_at: string;
}

export default function DriverTripHistory() {
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
        if (!token) { setError("Not authenticated"); setLoading(false); return; }
        const res = await fetch(`${API_URL}/api/ride/get-all`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Failed to load trips"); return; }
        if (!cancelled) setTrips(json.data || []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">My Trips</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-goDanger text-center">{error}</Text>
        </View>
      ) : trips.length === 0 ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">No trips yet</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          {trips.map((t) => (
            <TouchableOpacity
              key={t.ride_id}
              className="flex-row justify-between items-center p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-3"
              onPress={() => router.push(`/(main)/(customer)/(tabs)/driver-history/${t.ride_id}`)}
            >
              <View>
                <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
                  {t.destination_address ?? "Destination"}
                </Text>
                <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                  {formatDate(t.created_at)} · {t.vehicle_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </Text>
              </View>
              <Text className="text-[15px] font-JakartaBold text-goPrimary">
                ৳{((t.fare_breakdown?.total_bdt ?? 0) / 100).toFixed(0)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}