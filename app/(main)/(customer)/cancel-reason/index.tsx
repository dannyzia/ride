import { useState, useEffect, useRef } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useRiderStore } from "@/store/useRiderStore";
import { useTranslation } from "react-i18next";

const REASONS = [
  { key: "Waiting too long", labelKey: "ride.waiting_too_long" },
  { key: "Found another ride", labelKey: "ride.found_another_ride" },
  { key: "Driver asked to cancel", labelKey: "ride.driver_asked_to_cancel" },
  { key: "Changed my mind", labelKey: "ride.changed_my_mind" },
  { key: "Other", labelKey: "ride.other" },
];

export default function CancelReason() {
  const { t } = useTranslation();
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
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <Text className="text-[16px] font-Jakarta text-goPrimary" onPress={() => router.back()}>{t('common.back')}</Text>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{t('ride.cancel_ride')}</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 8 }}>
        <View className="bg-goAccentLight dark:bg-goAccent/10 rounded-[10px] px-4 py-3 mb-2">
          <Text className="text-[13px] font-Jakarta text-goAmber text-center">
            {getFreeCancellationText()}
          </Text>
          <Text className="text-[11px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mt-0.5">
            {getGraceNote()}
          </Text>
        </View>

        {REASONS.map((reason) => (
          <TouchableOpacity
            key={reason.key}
            className={`flex-row items-center p-[16px] rounded-[10px] border ${
              selected === reason.key
                ? "border-goPrimary bg-goAccentLight"
                : "border-goBorderLight dark:border-goBorderDark bg-goSurfaceLight dark:bg-goSurfaceElevatedDark"
            }`}
            onPress={() => setSelected(reason.key)}
          >
            <View className={`w-5 h-5 rounded-full border-2 mr-[12px] items-center justify-center ${
              selected === reason.key ? "border-goPrimary" : "border-goBorderLight dark:border-goBorderDark"
            }`}>
              {selected === reason.key && <View className="w-2.5 h-2.5 rounded-full bg-goPrimary" />}
            </View>
            <Text className="text-[16px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">{t(reason.labelKey)}</Text>
          </TouchableOpacity>
        ))}
        <TextInput
          className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mt-4"
          placeholder={t('ride.optional_note')}
          placeholderTextColor="#9CA3AF"
          value={note}
          onChangeText={setNote}
        />
        {error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger text-center mt-3">{error}</Text>
        ) : null}
        <TouchableOpacity
          className={`rounded-full py-[16px] items-center mt-8 ${loading || !selected ? "bg-goBorderDark" : "bg-goDanger"}`}
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