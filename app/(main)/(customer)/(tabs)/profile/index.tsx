import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { Image, RefreshControl, ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: string;
  profile_image_url: string | null;
  rating: number | null;
  rating_count: number;
  created_at: string;
}

const Profile = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/user/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setProfile(data.user);
      }
    } catch (err) {
      logger.error("Profile fetch failed", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProfile();
  };

  const handleSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      router.replace("/(auth)/phone-entry");
    } catch (err) {
      logger.error("Sign out failed:", err);
    }
  }, []);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center">
        <ActivityIndicator size="large" color="#0CC25F" />
      </SafeAreaView>
    );
  }

  const nameParts = (profile?.name ?? "").split(" ");
  const firstName = nameParts[0] || "Not Found";
  const lastName = nameParts.slice(1).join(" ") || "Not Found";

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#0CC25F"]}
            tintColor="#0CC25F"
          />
        }
      >
        <Text className="text-[24px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mt-6 mb-8">My Profile</Text>

        <View className="items-center justify-center mb-8">
          {profile?.profile_image_url ? (
            <Image
              source={{ uri: profile.profile_image_url }}
              className="w-[110px] h-[110px] rounded-full border-[3px] border-goPrimary"
            />
          ) : (
            <View className="w-[110px] h-[110px] rounded-full border-[3px] border-goPrimary bg-goAccentLight items-center justify-center">
              <Text className="text-[40px] font-JakartaBold tracking-tight text-goPrimary">{firstName.charAt(0)}</Text>
            </View>
          )}
        </View>

        <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark rounded-xl shadow-go-sm px-6 py-4 border border-goBorderLight dark:border-goBorderDark">
          <View className="mb-3">
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-1">First name</Text>
            <Text className="text-[16px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">{firstName}</Text>
          </View>
          <View className="mb-3">
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-1">Last name</Text>
            <Text className="text-[16px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">{lastName}</Text>
          </View>
          <View className="mb-3">
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-1">Email</Text>
            <Text className="text-[16px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">{profile?.email ?? "Not Found"}</Text>
          </View>
          <View>
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-1">Phone</Text>
            <Text className="text-[16px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">{profile?.phone ?? "Not Found"}</Text>
          </View>
          {profile?.rating ? (
            <View className="mt-3">
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Rating: {profile.rating.toFixed(2)} ({profile.rating_count} reviews)</Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={() => router.push("/(main)/(customer)/(tabs)/settings")}
          className="mt-6 bg-goSurfaceLight dark:bg-goSurfaceElevatedDark rounded-lg shadow-go-sm py-4 items-center"
        >
          <Text className="text-goTextPrimaryLight dark:text-goTextPrimaryDark font-JakartaBold text-[16px]">Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSignOut}
          className="mt-4 bg-goDanger rounded-lg py-4 items-center"
        >
          <Text className="text-goWhite font-JakartaBold text-[16px]">Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Profile;