import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useDriverStore } from "@/store/useDriverStore";

export default function ProfileScreen() {
  const { driver } = useDriverStore();
  const [profileData, setProfileData] = useState<{
    full_name: string;
    phone: string;
    vehicle_type: string;
    rating: number;
    completed_rides: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError("Failed to load profile"); return; }
      const data = await res.json();
      setProfileData(data.driver ?? data);
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Profile fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const displayName = profileData?.full_name || driver?.name || "Driver";
  const displayVehicle = profileData?.vehicle_type || driver?.vehicle_type || "";
  const displayRating = profileData?.rating ?? driver?.rating ?? 0;
  const displayRides = profileData?.completed_rides ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="items-center px-[24px] py-[32px] border-b border-goBorderLight dark:border-goBorderDark">
          <View className="w-20 h-20 rounded-full bg-goAccentLight dark:bg-goPrimary/20 items-center justify-center mb-3">
            <Text className="text-[32px] font-JakartaBold tracking-tight text-goPrimary">{(displayName || "D")[0].toUpperCase()}</Text>
          </View>
          {loading ? (
            <ActivityIndicator size="small" color="#0CC25F" />
          ) : error ? (
            <Text className="text-[14px] font-Jakarta text-goDanger">{error}</Text>
          ) : (
            <>
              <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark">{displayName}</Text>
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">
                {displayVehicle.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} · ★{displayRating.toFixed(1)} · {displayRides} rides
              </Text>
            </>
          )}
        </View>
        <View className="px-[24px] pt-[16px] gap-3">
          <TouchableOpacity className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]" onPress={() => router.push("/(main)/(rider)/edit-profile")}>
            <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Edit Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]" onPress={() => router.push("/(main)/(rider)/vehicle-management")}>
            <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">My Vehicles</Text>
          </TouchableOpacity>
          <TouchableOpacity className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]" onPress={() => router.push("/(main)/(rider)/documents")}>
            <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Documents</Text>
          </TouchableOpacity>
          <TouchableOpacity className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]" onPress={() => router.push("/(main)/(rider)/insurance")}>
            <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Insurance</Text>
          </TouchableOpacity>
          <TouchableOpacity className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]" onPress={() => router.push("/(main)/(rider)/ratings")}>
            <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Ratings & Reviews</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}