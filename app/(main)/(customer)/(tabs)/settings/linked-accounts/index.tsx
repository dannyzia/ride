import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface LinkedAccount {
  provider: string;
  label: string;
  connected: boolean;
  connected_at: string | null;
}

export default function SettingsLinkedAccounts() {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/user/linked-accounts`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && !cancelled) {
          setAccounts(data.linked_accounts ?? []);
        }
      } catch (err) {
        logger.error("LinkedAccounts fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.replace("/(main)/(customer)/(tabs)/settings")}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Linked Accounts</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0CC25F" />
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
          <View className="mt-4 mb-4">
            <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Connected Services</Text>
            {accounts.length === 0 ? (
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark py-4">
                No linked accounts. Connect a service below.
              </Text>
            ) : (
              accounts.map((acc) => (
                <View key={acc.provider} className="flex-row items-center px-[12px] py-[8px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] mb-2">
                  <View className="w-8 h-8 rounded-full mr-3 items-center justify-center"><Text className="text-[16px]">{acc.provider === "google" ? "📱" : "🏦"}</Text></View>
                  <View className="flex-1"><Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{acc.label}</Text></View>
                  <View className="bg-goPrimary/10 rounded-full px-[8px] py-[2px]"><Text className="text-[11px] font-JakartaBold text-goPrimary">Connected</Text></View>
                </View>
              ))
            )}
            <View className="mt-4">
              <TouchableOpacity
                className="w-full bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] px-[12px] py-[10px]"
                disabled
              >
                <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Add Account — Coming soon</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}