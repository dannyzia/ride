/**
 * P2P parcel detail (plan 27 §6.1) — the sender's tracking view for one
 * parcel leg: status pill, route, item note, receiver, snapshot fee (cash
 * on delivery). No bids: dispatch is sequential single-offer, the leg moves
 * created → offered → accepted → picked_up → delivered | failed.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Ionicons from "@expo/vector-icons/Ionicons";
import { useIsDark } from '@/lib/useAppearance';
import { colors } from '@/theme/goRide';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { formatBDT } from "@/lib/format";
import { useTranslation } from 'react-i18next';

interface ParcelDetail {
  leg_id: string;
  parcel_id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  delivery_fee_bdt: number | null;
  item_note: string | null;
  receiver_phone: string | null;
  courier_user_id: string | null;
  created_at: string;
}

export default function RequestDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isDark = useIsDark();
  const [detail, setDetail] = useState<ParcelDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/delivery/parcels`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const found = (data.parcels ?? []).find((p: ParcelDetail) => p.leg_id === id) ?? null;
        setDetail(found);
      }
    } catch (err) {
      logger.error('Failed to fetch parcel detail', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.bgDark : colors.bgLight }}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.bgDark : colors.bgLight }}>
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: textPrimary }}>{t("delivery_detail.not_found")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusColors: Record<string, string> = {
    created: colors.amber,
    offered: colors.amber,
    accepted: colors.primary,
    picked_up: colors.primary,
    delivered: '#22C55E',
    failed: colors.danger,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.bgDark : colors.bgLight }}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <TouchableOpacity onPress={() => router.back()} testID="customer.delivery.request-detail.el-1">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text className="text-lg font-JakartaBold ml-3" style={{ color: textPrimary }}>
          {t("delivery_detail.title")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Status */}
        <View
          className="px-3 py-1 rounded-full self-start mb-4"
          style={{ backgroundColor: (statusColors[detail.status] ?? textSecondary) + '20' }}
        >
          <Text
            className="text-sm font-JakartaBold"
            style={{ color: statusColors[detail.status] ?? textSecondary }}
          >
            {t(`delivery.status.${detail.status}`)}
          </Text>
        </View>

        {/* Route */}
        <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}>
          <View className="flex-row items-start mb-2">
            <View className="w-3 h-3 rounded-full mt-1 mr-3" style={{ backgroundColor: '#22C55E' }} />
            <Text className="flex-1 text-sm font-Jakarta" style={{ color: textPrimary }}>
              {detail.pickup_address}
            </Text>
          </View>
          <View className="w-0.5 h-4 ml-1.5 mb-2" style={{ backgroundColor: borderColor }} />
          <View className="flex-row items-start">
            <View className="w-3 h-3 rounded-full mt-1 mr-3" style={{ backgroundColor: colors.danger }} />
            <Text className="flex-1 text-sm font-Jakarta" style={{ color: textPrimary }}>
              {detail.dropoff_address}
            </Text>
          </View>
        </View>

        {/* Item + receiver */}
        <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}>
          <Text className="text-sm font-Jakarta" style={{ color: textSecondary }}>
            {t("delivery_detail.note")}
          </Text>
          <Text className="text-base font-JakartaBold mt-1 mb-3" style={{ color: textPrimary }}>
            {detail.item_note ?? "—"}
          </Text>
          <Text className="text-sm font-Jakarta" style={{ color: textSecondary }}>
            {t("delivery_detail.receiver")}
          </Text>
          <Text className="text-base font-JakartaBold mt-1" style={{ color: textPrimary }}>
            {detail.receiver_phone ?? "—"}
          </Text>
        </View>

        {/* Fee (snapshot — cash on delivery) */}
        {detail.delivery_fee_bdt != null && (
          <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}>
            <Text className="text-sm font-Jakarta" style={{ color: textSecondary }}>
              {t("delivery_detail.fee_cash")}
            </Text>
            <Text className="text-2xl font-JakartaBold mt-1" style={{ color: colors.primary }}>
              {formatBDT(detail.delivery_fee_bdt)}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
