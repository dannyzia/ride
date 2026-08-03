import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, Switch, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface Controls {
  share_usage_data: boolean;
  personalized_ads: boolean;
}

const DEFAULT_CONTROLS: Controls = {
  share_usage_data: true,
  personalized_ads: false,
};

export default function SettingsDataAnalytics() {
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/user/data-controls`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && !cancelled) {
          setControls({ ...DEFAULT_CONTROLS, ...data.data_controls });
        }
      } catch (err) {
        logger.error("DataAnalytics fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const updateControl = useCallback(async (key: keyof Controls, value: boolean) => {
    setControls((prev) => ({ ...prev, [key]: value }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      await fetch(`${API_URL}/api/user/data-controls`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [key]: value }),
      });
    } catch (err) {
      logger.error("DataAnalytics PATCH failed", err);
    }
  }, []);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center">
        <ActivityIndicator size="large" color="#0CC25F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.replace("/(main)/(customer)/(tabs)/settings")}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Data & Analytics</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="mt-4 mb-4">
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Privacy Settings</Text>
          <View className="flex-row items-center justify-between px-[12px] py-[10px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] mb-2">
            <Text className="flex-1 text-[14px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">Share usage data</Text>
            <Switch value={controls.share_usage_data} onValueChange={(v) => updateControl("share_usage_data", v)} trackColor={{ false: "#767577", true: "#0CC25F" }} thumbColor={controls.share_usage_data ? "#f5dd4b" : "#f4f3f4"} />
          </View>
          <View className="flex-row items-center justify-between px-[12px] py-[10px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] mb-2">
            <Text className="flex-1 text-[14px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">Personalized ads</Text>
            <Switch value={controls.personalized_ads} onValueChange={(v) => updateControl("personalized_ads", v)} trackColor={{ false: "#767577", true: "#0CC25F" }} thumbColor={controls.personalized_ads ? "#f5dd4b" : "#f4f3f4"} />
          </View>
        </View>
        <View className="mt-4">
          <TouchableOpacity className="w-full bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] px-[12px] py-[10px] mb-2" onPress={() => router.push("/(main)/(customer)/(tabs)/settings/request-data")}>
            <Text className="text-[14px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">Request My Data</Text>
          </TouchableOpacity>
          <TouchableOpacity className="w-full bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] px-[12px] py-[10px]" onPress={() => router.push("/(main)/(customer)/(tabs)/settings/delete-data")}>
            <Text className="text-[14px] font-Jakarta text-goDanger dark:text-goDanger">Delete My Data</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}