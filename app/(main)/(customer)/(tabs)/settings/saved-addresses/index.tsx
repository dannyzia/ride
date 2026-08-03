import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface AddressItem {
  id: string;
  label: string;
  address: string;
  details?: string;
  is_favorite: boolean;
}

export default function SavedAddresses() {
  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAddresses = async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/rider/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError("Failed to load addresses"); return; }
      const data = await res.json();
      setAddresses(data.addresses ?? []);
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Addresses fetch failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAddresses(); }, []);

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Saved Addresses</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        {loading ? (
          <ActivityIndicator size="small" color="#0CC25F" />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger">{error}</Text>
        ) : addresses.length === 0 ? (
          <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mt-8">No saved addresses yet.</Text>
        ) : (
          addresses.map((a) => (
            <TouchableOpacity
              key={a.id}
              className="flex-row justify-between items-center p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]"
              onPress={() => router.push(`/(main)/(customer)/(tabs)/settings/saved-addresses/${a.id}`)}
            >
              <View>
                <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{a.label}</Text>
                <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{a.address}</Text>
              </View>
              {a.is_favorite && <Text className="text-[12px] font-Jakarta text-goPrimary">★ Favorite</Text>}
            </TouchableOpacity>
          ))
        )}
        <TouchableOpacity className="bg-goPrimary rounded-full w-full py-[16px] items-center mt-4" onPress={() => router.push("/(main)/(customer)/(tabs)/settings/saved-addresses/add-address")}>
          <Text className="text-[18px] font-JakartaBold text-goWhite">+ Add Address</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
