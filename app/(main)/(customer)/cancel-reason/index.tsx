import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useRiderStore } from "@/store/useRiderStore";
import { useTranslation } from "react-i18next";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

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
    } catch (err: any) {
      setError(err?.message || t('common.error'));
      logger.error("Cancel ride failed", err);
    } finally {
      setLoading(false);
    }
  };

  const getFreeCancellationText = () => {
    if (elapsed < 120) {
      const minutes = Math.floor((120 - elapsed) / 60);
      const seconds = (120 - elapsed) % 60;
      return t('ride.free_cancellation', { minutes, seconds: String(seconds).padStart(2, '0') });
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

        {REASONS.map((reason) => {
          const isSelected = selected === reason.key;
          return (
            <TouchableOpacity
              key={reason.key}
              className="flex-row items-center p-[16px] rounded-[10px] border"
              style={
                isSelected
                  ? { borderColor: colors.primary, backgroundColor: colors.accentLight }
                  : { borderColor, backgroundColor: surfaceBg }
              }
              onPress={() => setSelected(reason.key)}
            >
              <View
                className="w-5 h-5 rounded-full border-2 mr-[12px] items-center justify-center"
                style={{ borderColor: isSelected ? colors.primary : borderColor }}
              >
                {isSelected && <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.primary }} />}
              </View>
              <Text className="text-[16px] font-Jakarta" style={{ color: textPrimary }}>{t(reason.labelKey)}</Text>
            </TouchableOpacity>
          );
        })}
        <TextInput
          className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta mt-4"
          style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
          placeholder={t('ride.optional_note')}
          placeholderTextColor="#9CA3AF"
          value={note}
          onChangeText={setNote}
        />
        {error ? (
          <Text className="text-[14px] font-Jakarta text-center mt-3" style={{ color: colors.danger }}>{error}</Text>
        ) : null}
        <TouchableOpacity
          className="rounded-full py-[16px] items-center mt-8"
          style={{ backgroundColor: loading || !selected ? disabledBg : colors.danger }}
          onPress={confirmCancel}
          disabled={loading || !selected}
        >
          {loading ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[18px] font-JakartaBold text-goWhite">{t('ride.confirm_cancel')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
