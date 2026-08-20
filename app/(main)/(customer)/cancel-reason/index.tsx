import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import RadioGroup from "@/components/RadioGroup";
import ErrorBanner from "@/components/ErrorBanner";
import { useRiderStore } from "@/store/useRiderStore";
import { useTranslation } from "react-i18next";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { countdownRemaining } from "@/lib/time";

const REASONS = [
  { key: "Waiting too long", labelKey: "ride.waiting_too_long" },
  { key: "Found another ride", labelKey: "ride.found_another_ride" },
  { key: "Driver asked to cancel", labelKey: "ride.driver_asked_to_cancel" },
  { key: "Changed my mind", labelKey: "ride.changed_my_mind" },
  { key: "Other", labelKey: "ride.other" },
];

export default function CancelReason() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const params = useLocalSearchParams<{ rideId?: string }>();
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [feeBdt, setFeeBdt] = useState<number | null>(null);
  const { searchingRideId, activeRide } = useRiderStore();
  const rideId = params.rideId || searchingRideId || activeRide?.id;
  const rideCreatedAt = activeRide?.created_at
    ? new Date(activeRide.created_at).getTime()
    : Date.now();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const disabledBg = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - rideCreatedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [rideCreatedAt]);

  useEffect(() => {
    if (!rideId) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/ride/${rideId}/cancel-preview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setFeeBdt((await res.json()).fee_bdt ?? 0);
      } catch { /* non-blocking */ }
    })();
  }, [rideId]);

  const confirmCancel = async () => {
    if (!rideId || !selected) { setError(t('ride.select_reason')); return; }
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError(t('common.error')); return; }
      const res = await fetch(`${API_URL}/api/ride/${rideId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cancelled_by: "rider", reason: selected, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t('common.error')); return; }
      router.replace("/(main)/(customer)/canceled");
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      logger.error("Cancel ride failed", err);
    } finally {
      setLoading(false);
    }
  };

  const getFreeCancellationText = () => {
    const cd = countdownRemaining(elapsed);
    if (cd) {
      return t('ride.free_cancellation', { minutes: cd.minutes, seconds: cd.seconds });
    }
    return t('ride.cancellation_fee', { fee: ((feeBdt ?? 0) / 100).toFixed(0) });
  };

  const getGraceNote = () => {
    if (elapsed < 120) return t('ride.no_fee_within_grace');
    if (feeBdt && feeBdt > 0) return t('ride.fee_will_be_deducted');
    return t('ride.no_fee_applies');
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }} onPress={() => router.back()}>{t('common.back')}</Text>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('ride.cancel_ride')}</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 8 }}>
        <View
          className="rounded-[10px] px-4 py-3 mb-2"
          style={{ backgroundColor: isDark ? "rgba(12, 194, 95, 0.1)" : colors.accentLight }}
        >
          <Text className="text-[13px] font-Jakarta text-center" style={{ color: colors.amber }}>
            {getFreeCancellationText()}
          </Text>
          <Text className="text-[11px] font-Jakarta text-center mt-0.5" style={{ color: textSecondary }}>
            {getGraceNote()}
          </Text>
        </View>

        <RadioGroup
          options={REASONS.map((reason) => ({ key: reason.key, label: t(reason.labelKey) }))}
          value={selected}
          onChange={setSelected}
        />
        <TextInput
          className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta mt-4"
          style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
          placeholder={t('ride.optional_note')}
          placeholderTextColor={textSecondary}
          value={note}
          onChangeText={setNote}
        />
        {error ? <ErrorBanner message={error} /> : null}
        <TouchableOpacity
          className="rounded-full py-[16px] items-center mt-8"
          style={{ backgroundColor: loading || !selected ? disabledBg : colors.danger }}
          onPress={confirmCancel}
          disabled={loading || !selected}
        >
          {loading ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text className="text-[18px] font-JakartaBold text-goWhite">{t('ride.confirm_cancel')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
