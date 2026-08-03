import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";

interface CanceledRide {
  ride_id: string;
  vehicle_type: string;
  created_at: string;
  cancel_reason: string;
  origin_address: string;
}

export default function ActivityCanceled() {
  const [rides, setRides] = useState<CanceledRide[]>([]);
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
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed to load"); return; }
        if (!cancelled) {
          const allRides = data.data || [];
          setRides(allRides.filter((r: any) => r.status === "cancelled"));
        }
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
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Canceled Rides</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0CC25F" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-goDanger text-center">{error}</Text>
        </View>
      ) : rides.length === 0 ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">No canceled rides</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          {rides.map((r) => (
            <View
              key={r.ride_id}
              className="p-[16px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-3"
            >
              <View className="flex-row justify-between items-start">
                <View className="flex-1">
                  <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
                    {r.vehicle_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  </Text>
                  <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">
                    {formatDate(r.created_at)} · {r.cancel_reason ?? "Canceled"}
                  </Text>
                  <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                    {r.origin_address ?? "—"}
                  </Text>
                </View>
              </View>
            </View>
          ))}
          <TouchableOpacity
            className="bg-goPrimary rounded-full w-full py-[16px] items-center mt-4"
            onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}
          >
            <Text className="text-[18px] font-JakartaBold text-goWhite">Book new ride</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
