import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

interface LinkedAccount {
  provider: string;
  label: string;
  connected: boolean;
  connected_at: string | null;
}

export default function SettingsLinkedAccounts() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

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
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <TouchableOpacity onPress={() => router.replace("/(main)/(customer)/(tabs)/settings")}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Linked Accounts</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
          <View className="mt-4 mb-4">
            <Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>Connected Services</Text>
            {accounts.length === 0 ? (
              <Text className="text-[14px] font-Jakarta py-4" style={{ color: textSecondary }}>
                No linked accounts. Connect a service below.
              </Text>
            ) : (
              accounts.map((acc) => (
                <View key={acc.provider} className="flex-row items-center px-[12px] py-[8px] border rounded-[8px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }}>
                  <View className="w-8 h-8 rounded-full mr-3 items-center justify-center"><Ionicons name={acc.provider === "google" ? "phone-portrait" : "business"} size={16} color={textSecondary} /></View>
                  <View className="flex-1"><Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>{acc.label}</Text></View>
                  <View className="rounded-full px-[8px] py-[2px]" style={{ backgroundColor: colors.primary + "1A" }}><Text className="text-[11px] font-JakartaBold" style={{ color: colors.primary }}>Connected</Text></View>
                </View>
              ))
            )}
            <View className="mt-4">
              <TouchableOpacity
                className="w-full border rounded-[8px] px-[12px] py-[10px]"
                style={{ backgroundColor: surfaceBg, borderColor }}
                disabled
              >
                <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>Add Account — Coming soon</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
