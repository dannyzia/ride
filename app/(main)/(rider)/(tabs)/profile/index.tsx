import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useDriverStore } from "@/store/useDriverStore";
import ThemeToggle from "@/components/ThemeToggle";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

export default function ProfileScreen() {
  const { driver } = useDriverStore();
  const isDark = useIsDark();
  const [profileData, setProfileData] = useState<{
    full_name: string;
    phone: string;
    vehicle_type: string;
    rating: number;
    completed_rides: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/driver/me`, {
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

  const menu = [
    { label: "Edit Profile", route: "/(main)/(rider)/edit-profile" },
    { label: "My Vehicles", route: "/(main)/(rider)/vehicle-management" },
    { label: "Documents", route: "/(main)/(rider)/documents" },
    { label: "Insurance", route: "/(main)/(rider)/insurance" },
    { label: "Ratings & Reviews", route: "/(main)/(rider)/ratings" },
  ] as const;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="items-center px-[24px] py-[32px] border-b" style={{ borderColor }}>
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-3"
            style={{ backgroundColor: isDark ? "rgba(12, 194, 95, 0.2)" : colors.accentLight }}
          >
            <Text className="text-[32px] font-JakartaBold tracking-tight" style={{ color: colors.primary }}>{(displayName || "D")[0].toUpperCase()}</Text>
          </View>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : error ? (
            <Text className="text-[14px] font-Jakarta" style={{ color: colors.danger }}>{error}</Text>
          ) : (
            <>
              <Text className="text-[20px] font-JakartaBold tracking-tight" style={{ color: textPrimary }}>{displayName}</Text>
              <Text className="text-[14px] font-Jakarta mt-1" style={{ color: textSecondary }}>
                {displayVehicle.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} · ★{displayRating.toFixed(1)} · {displayRides} rides
              </Text>
            </>
          )}
        </View>
        <View className="px-[24px] pt-[16px] gap-3">
          <ThemeToggle />
          {menu.map((item) => (
            <TouchableOpacity
              key={item.route}
              className="p-[14px] border rounded-[12px]"
              style={{ backgroundColor: surfaceBg, borderColor }}
              onPress={() => router.push(item.route)}
            >
              <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
