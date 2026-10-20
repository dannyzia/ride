/**
 * Driver settings — Women-Only toggle (S8 §4.4, R-2).
 *
 * Default OFF (migration 0087 DEFAULT false): a driver keeps receiving mixed
 * ride offers until she turns this on. The server is the gate — enable is
 * rejected unless she is a verified female bike-family driver while the
 * `women_only_rides_enabled` kill switch is on — so this screen only reflects
 * server state (a tampered client cannot widen its own eligibility).
 *
 * Copy keys land in S8b-9 (26-key en+bn contract); referenced here per the
 * established S8b pattern (cf. SetGenderPrompt referencing gender_* keys).
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
  gender: string;
  gender_verified: boolean;
  vehicle_type: string;
  women_only_feature_enabled: boolean;
  can_enable: boolean;
}

// S8b-9 contract keys only. `women_only_not_verified` has no contract copy —
// it falls back to the server message (honest English, Copy Truth Rule).
const ERROR_COPY_KEY: Record<string, string> = {
  women_only_disabled: "error_women_only_disabled",
  women_only_not_eligible: "error_women_only_not_eligible",
  women_only_bike_only: "error_women_only_bike_only",
};

export default function WomenOnlyToggleScreen() {
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
      const res = await fetch(`${API_URL}/api/driver/women-only-toggle`, { headers });
      if (!res.ok) throw new Error(`toggle GET ${res.status}`);
      setState((await res.json()) as ToggleState);
    } catch (e) {
      logger.warn("[women-only toggle] load failed", {
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
        const res = await fetch(`${API_URL}/api/driver/women-only-toggle`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
            message?: string;
          } | null;
          const copyKey = body?.error ? ERROR_COPY_KEY[body.error] : undefined;
          setNotice(copyKey ? t(copyKey) : (body?.message ?? t("driver_women_only_toggle_hint")));
          // Refresh eligibility (a 403 can mean the server state moved).
          await load();
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
          accessibilityLabel={t("common.back")}
          testID="rider.settings.women-only.el-1">
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text className="text-[20px] font-JakartaBold tracking-tight" style={{ color: textPrimary }}>
          {t("driver_women_only_toggle_title")}
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
            testID="rider.settings.women-only.toggle-card"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-[15px] font-JakartaSemiBold" style={{ color: textPrimary }}>
                  {t("driver_women_only_toggle_title")}
                </Text>
                <Text className="text-[12px] font-Jakarta mt-1" style={{ color: textSecondary }}>
                  {t("driver_women_only_toggle_hint")}
                </Text>
              </View>
              <Switch
                value={state?.enabled ?? false}
                disabled={busy || !state}
                onValueChange={(v) => void setEnabled(v)}
                trackColor={{ true: colors.primary, false: colors.borderDark }}
                thumbColor={colors.surfaceLight}
                testID="rider.settings.women-only.set-enabled"/>
            </View>

            {state && !state.women_only_feature_enabled ? (
              <Text className="text-[12px] font-JakartaSemiBold mt-3" style={{ color: colors.amber }}>
                {t("banner_women_only_paused")}
              </Text>
            ) : null}
            {state?.enabled ? (
              <Text className="text-[12px] font-JakartaSemiBold mt-3" style={{ color: colors.primary }}>
                {t("driver_women_only_banner")}
              </Text>
            ) : null}
            {notice ? (
              <Text
                className="text-[12px] font-JakartaSemiBold mt-3"
                style={{ color: colors.danger }}
                testID="rider.settings.women-only.notice-text"
              >
                {notice}
              </Text>
            ) : null}
          </View>
        )}

        <Text className="text-[12px] font-Jakarta mt-4" style={{ color: textSecondary }}>
          {t("driver_women_only_toggle_hint")}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
