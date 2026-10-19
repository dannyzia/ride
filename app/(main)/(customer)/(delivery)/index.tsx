/**
 * P2P parcels list (plan 27 §6.1) — the sender's own parcel legs, newest
 * first. The retired bidding history stays on GET /api/delivery/requests
 * and is not shown here.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from "@expo/vector-icons/Ionicons";
import { useIsDark } from '@/lib/useAppearance';
import { colors } from '@/theme/goRide';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { formatBDT } from "@/lib/format";
import { useTranslation } from 'react-i18next';

interface ParcelLeg {
  leg_id: string;
  parcel_id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  delivery_fee_bdt: number | null;
  created_at: string;
}

export default function DeliveryListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const isDark = useIsDark();
  const [deliveries, setDeliveries] = useState<ParcelLeg[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDeliveries = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/delivery/parcels`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.parcels ?? []);
      }
    } catch (err) {
      logger.error('Failed to fetch deliveries', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDeliveries();
  }, [fetchDeliveries]);

  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  // S6 universal-leg states (created → offered → accepted → picked_up →
  // delivered | failed).
  const statusColors: Record<string, string> = {
    created: colors.amber,
    offered: colors.amber,
    accepted: colors.primary,
    picked_up: colors.primary,
    delivered: '#22C55E',
    failed: colors.danger,
    cancelled: colors.danger,
  };

  const renderDelivery = ({ item }: { item: ParcelLeg }) => (
    <TouchableOpacity
      className="rounded-xl p-4 mb-3"
      style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
      onPress={() => router.push(`/(main)/(customer)/(delivery)/request-detail?id=${item.leg_id}`)}
      activeOpacity={0.7}
     testID="customer.delivery.push-request-detail">
      <View className="flex-row justify-between items-start mb-2">
        <Text className="text-sm font-JakartaBold" style={{ color: textPrimary }} numberOfLines={1}>
          {item.pickup_address} → {item.dropoff_address}
        </Text>
        <View
          className="px-2 py-1 rounded-full"
          style={{ backgroundColor: (statusColors[item.status] ?? textSecondary) + '20' }}
        >
          <Text
            className="text-xs font-JakartaMedium"
            style={{ color: statusColors[item.status] ?? textSecondary }}
          >
            {item.status}
          </Text>
        </View>
      </View>
      {item.delivery_fee_bdt != null && (
        <Text className="text-sm font-JakartaMedium" style={{ color: colors.primary }}>
          {formatBDT(item.delivery_fee_bdt)}
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.bgDark : colors.bgLight }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <TouchableOpacity onPress={() => router.back()} testID="customer.delivery.el-1">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text className="text-lg font-JakartaBold" style={{ color: textPrimary }}>
          {t("delivery.title")}
        </Text>
        <TouchableOpacity onPress={() => router.push('/(main)/(customer)/(delivery)/request-create')} testID="customer.delivery.push-request-create">
          <Ionicons name="add-circle" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : deliveries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons name="bicycle-outline" size={64} color={textSecondary} />
          <Text className="text-lg font-JakartaBold mt-4" style={{ color: textPrimary }}>
            {t("delivery.empty_title")}
          </Text>
          <Text className="text-sm font-Jakarta mt-2 text-center" style={{ color: textSecondary }}>
            {t("delivery.empty_body")}
          </Text>
          <TouchableOpacity
            className="mt-6 px-8 py-3 rounded-xl"
            style={{ backgroundColor: colors.primary }}
            onPress={() => router.push('/(main)/(customer)/(delivery)/request-create')}
           testID="customer.delivery.push-request-create-2">
            <Text className="text-white font-JakartaBold">{t("delivery.empty_cta")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={deliveries}
          renderItem={renderDelivery}
          keyExtractor={(item) => item.leg_id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </SafeAreaView>
  );
}
