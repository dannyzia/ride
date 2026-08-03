import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface DuesData {
  subscription: {
    package_name: string | null;
    expires_at: string;
    calls_remaining: number;
    status: string;
  } | null;
  commission_due_bdt: number;
  total_outstanding_bdt: number;
}

export default function DueAmounts() {
  const [data, setData] = useState<DuesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError("Not authenticated"); return; }
        const res = await fetch(`${API_URL}/api/driver/dues`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Failed"); return; }
        if (!cancelled) setData(json);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Network error");
        logger.error("DueAmounts fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Due Amounts</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0CC25F" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[14px] font-Jakarta text-goDanger text-center mb-4">{error}</Text>
          <TouchableOpacity className="bg-goPrimary rounded-full px-[24px] py-[12px]" onPress={() => { setLoading(true); setError(""); }}>
            <Text className="text-[16px] font-JakartaBold text-goWhite">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          {data.subscription ? (
            <View className="p-[16px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-4">
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">SUBSCRIPTION</Text>
              <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mt-1">{data.subscription.package_name ?? "Active Plan"}</Text>
              <View className="flex-row justify-between mt-2">
                <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Calls remaining: {data.subscription.calls_remaining}</Text>
                <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Expires: {new Date(data.subscription.expires_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</Text>
              </View>
              <View className="flex-row justify-between mt-1">
                <View className="bg-goPrimary/10 rounded-full px-[10px] py-[4px]">
                  <Text className="text-[12px] font-JakartaBold text-goPrimary">{data.subscription.status}</Text>
                </View>
              </View>
              <TouchableOpacity className="bg-goPrimary rounded-full w-full py-[14px] items-center mt-3" onPress={() => router.push("/(main)/(rider)/subscription-plans")}>
                <Text className="text-[16px] font-JakartaBold text-goWhite">Renew</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="p-[16px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-4">
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">No active subscription</Text>
              <TouchableOpacity className="bg-goPrimary rounded-full w-full py-[14px] items-center mt-3" onPress={() => router.push("/(main)/(rider)/subscription-plans")}>
                <Text className="text-[16px] font-JakartaBold text-goWhite">Browse Packages</Text>
              </TouchableOpacity>
            </View>
          )}
          <View className="p-[16px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-4">
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">COMMISSION DUE</Text>
            <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mt-1">৳{(data.commission_due_bdt / 100).toFixed(0)}</Text>
            <View className="flex-row justify-between mt-2">
              <View className="bg-goDanger/10 rounded-full px-[10px] py-[4px]">
                <Text className="text-[12px] font-JakartaBold text-goDanger">Unsettled</Text>
              </View>
            </View>
          </View>
          <View className="p-[16px] bg-goAccentLight border border-goPrimary rounded-[12px] mb-4">
            <View className="flex-row justify-between items-center">
              <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">TOTAL OUTSTANDING</Text>
              <Text className="text-[22px] font-JakartaBold tracking-tight text-goDanger">৳{(data.total_outstanding_bdt / 100).toFixed(0)}</Text>
            </View>
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}