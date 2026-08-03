import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface AddressItem {
  id: string;
  label: string;
  address: string;
  details?: string;
  lat: number | null;
  lng: number | null;
}

export default function AddressDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [address, setAddress] = useState<AddressItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError("");
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError("Not authenticated"); setLoading(false); return; }
        const res = await fetch(`${API_URL}/api/rider/addresses?id=${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed to load"); return; }
        if (!cancelled) setAddress(data.addresses?.[0] ?? null);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleDelete = async () => {
    Alert.alert(
      "Delete Address",
      "Are you sure you want to delete this saved address?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true); setError("");
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const token = session?.access_token;
              if (!token) { setError("Not authenticated"); setDeleting(false); return; }
               const res = await fetch(`${API_URL}/api/rider/addresses?id=${id}`, {
                 method: "DELETE",
                 headers: { Authorization: `Bearer ${token}` },
               });
              if (!res.ok) { setError("Failed to delete"); setDeleting(false); return; }
              router.replace("/(main)/(customer)/(tabs)/settings/saved-addresses");
            } catch (err: any) {
              setError(err?.message || "Network error");
              logger.error("Delete address failed", err);
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Address Details</Text>
        <TouchableOpacity onPress={() => setShowMore(!showMore)}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">⋯</Text>
        </TouchableOpacity>
      </View>
      {showMore && (
        <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border-b border-goBorderLight dark:border-goBorderDark px-[24px] py-3">
          <TouchableOpacity className="py-2" onPress={() => { setShowMore(false); }}>
            <Text className="text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">Set as pickup</Text>
          </TouchableOpacity>
          <TouchableOpacity className="py-2" onPress={() => { setShowMore(false); }}>
            <Text className="text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">Set as destination</Text>
          </TouchableOpacity>
          <TouchableOpacity className="py-2" onPress={() => { setShowMore(false); }}>
            <Text className="text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">Edit address</Text>
          </TouchableOpacity>
          <TouchableOpacity className="py-2" onPress={handleDelete}>
            <Text className="text-[15px] font-Jakarta text-goDanger">Delete address</Text>
          </TouchableOpacity>
        </View>
      )}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0CC25F" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-goDanger text-center">{error}</Text>
        </View>
      ) : address ? (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          <View className="p-[16px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]">
            <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{address.label}</Text>
            <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-2">{address.address}</Text>
            {deleting ? (
              <ActivityIndicator size="small" color="#0CC25F" className="mt-4" />
            ) : (
              <TouchableOpacity
                className="mt-4 py-[12px] border border-goDanger rounded-full items-center"
                onPress={handleDelete}
              >
                <Text className="text-[16px] font-JakartaBold text-goDanger">Delete Address</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Address not found</Text>
        </View>
      )}
    </SafeAreaView>
  );
}