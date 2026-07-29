import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface PayoutMethod {
  id: string;
  method_type: string;
  account_label: string;
  is_default: boolean;
}

export default function PayoutMethods() {
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchMethods = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/payout-methods`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError("Failed to load methods"); return; }
      const data = await res.json();
      setMethods(data.methods ?? []);
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Payout methods fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMethods(); }, [fetchMethods]);

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Payout Methods</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        {loading ? (
          <ActivityIndicator size="small" color="#0CC25F" />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger">{error}</Text>
        ) : methods.length === 0 ? (
          <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mt-8">No payout methods added yet.</Text>
        ) : (
          methods.map((m) => (
            <View key={m.id} className="flex-row justify-between items-center p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]">
              <View>
                <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{m.method_type}</Text>
                <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{m.account_label}{m.is_default ? " · Default" : ""}</Text>
              </View>
              <Text className="text-[18px] text-goTextSecondaryLight dark:text-goTextSecondaryDark">⋯</Text>
            </View>
          ))
        )}
        <TouchableOpacity className="bg-goPrimary rounded-full w-full py-[16px] items-center mt-4" onPress={() => router.push("/(main)/(rider)/add-payout-method")}>
          <Text className="text-[18px] font-JakartaBold text-goWhite">+ Add Method</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}