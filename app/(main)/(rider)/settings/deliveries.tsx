/**
 * Driver settings — Deliveries toggle (S6, plan 27 §6.1 + Amendment 2 / F-15).
 *
 * Default OFF (migration 0074): a driver never receives delivery offers
 * until they turn this on. The server is the gate — enable is rejected while
 * carrying a rider (409 active_ride; match time already auto-OFFs it) or on
 * a non-active drivers row, so this screen only reflects server state.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface ToggleState {
  enabled: boolean;
  driver_status: string;
  carrying_rider: boolean;
  can_enable: boolean;
}

export default function DeliveriesToggleScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surface = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const border = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const [state, setState] = useState<ToggleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  }, []);

  const load = useCallback(async () => {
    try {
      const headers = await authHeaders();
      if (!headers) {
        router.replace("/(auth)/login");
        return;
      }
      const res = await fetch(`${API_URL}/api/driver/deliveries-toggle`, { headers });
      if (!res.ok) throw new Error(`toggle GET ${res.status}`);
      setState((await res.json()) as ToggleState);
    } catch (e) {
      logger.warn("[deliveries toggle] load failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      const headers = await authHeaders();
      if (!headers) return;
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch(`${API_URL}/api/driver/deliveries-toggle`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
            message?: string;
          } | null;
          setNotice(body?.message ?? t("delivery.toggle.failed"));
          return;
        }
        await load();
      } finally {
        setBusy(false);
      }
    },
    [authHeaders, load, t],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View
        className="flex-row items-center px-[16px] py-[14px] border-b"
        style={{ borderColor: border }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-[12px] p-[4px]"
          accessibilityLabel={t("delivery.active.back")}
         
         testID="rider.settings.deliveries.el-1">
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text className="text-[20px] font-JakartaBold tracking-tight" style={{ color: textPrimary }}>
          {t("delivery.toggle.title")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {loading ? (
          <View className="items-center py-10">
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <View
            className="rounded-[14px] p-4 border"
            style={{ borderColor: border, backgroundColor: surface }}
            testID="rider.settings.deliveries.toggle-card"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-[15px] font-JakartaSemiBold" style={{ color: textPrimary }}>
                  {t("delivery.toggle.label")}
                </Text>
                <Text className="text-[12px] font-Jakarta mt-1" style={{ color: textSecondary }}>
                  {t("delivery.toggle.hint")}
                </Text>
              </View>
              <Switch
                value={state?.enabled ?? false}
                disabled={busy || !state}
                onValueChange={(v) => void setEnabled(v)}
                trackColor={{ true: colors.primary, false: colors.borderDark }}
                thumbColor={colors.surfaceLight}
               
               testID="rider.settings.deliveries.set-enabled"/>
            </View>

            {state && !state.can_enable && state.enabled ? (
              <Text className="text-[12px] font-JakartaSemiBold mt-3" style={{ color: colors.amber }}>
                {t("delivery.toggle.off_after_ride")}
              </Text>
            ) : null}
            {state?.carrying_rider ? (
              <Text className="text-[12px] font-JakartaSemiBold mt-3" style={{ color: colors.amber }}>
                {t("delivery.toggle.carrying_rider")}
              </Text>
            ) : null}
            {notice ? (
              <Text
                className="text-[12px] font-JakartaSemiBold mt-3"
                style={{ color: colors.danger }}
                testID="rider.settings.deliveries.notice-text"
              >
                {notice}
              </Text>
            ) : null}
          </View>
        )}

        {state?.enabled ? (
          <TouchableOpacity
            className="flex-row items-center justify-between rounded-[14px] px-4 py-3 mt-4 border"
            style={{ borderColor: border, backgroundColor: surface }}
            onPress={() => router.push("/(main)/(delivery)" as never)}
           
           testID="rider.settings.deliveries.push-delivery">
            <Text className="text-[14px] font-JakartaSemiBold" style={{ color: textPrimary }}>
              {t("delivery.toggle.open_inbox")}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={textSecondary} />
          </TouchableOpacity>
        ) : null}

        <Text className="text-[12px] font-Jakarta mt-4" style={{ color: textSecondary }}>
          {t("delivery.toggle.explain")}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
