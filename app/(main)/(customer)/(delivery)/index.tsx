/**
 * Delivery requests list — customer's active and past deliveries.
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
import { Ionicons } from '@expo/vector-icons';
import { useIsDark } from '@/lib/useAppearance';
import { colors } from '@/theme/goRide';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

interface DeliveryRequest {
  id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  quoted_fee_bdt: number | null;
  created_at: string;
}

export default function DeliveryListScreen() {
  const router = useRouter();
  const isDark = useIsDark();
  const [deliveries, setDeliveries] = useState<DeliveryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDeliveries = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/delivery/requests`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.deliveries ?? []);
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

  const statusColors: Record<string, string> = {
    pending: colors.amber,
    assigned: colors.primary,
    picked_up: colors.primary,
    in_transit: colors.primary,
    delivered: '#22C55E',
    failed: colors.danger,
    cancelled: colors.danger,
  };

  const renderDelivery = ({ item }: { item: DeliveryRequest }) => (
    <TouchableOpacity
      className="rounded-xl p-4 mb-3"
      style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
      onPress={() => router.push(`/(main)/(customer)/(delivery)/request-detail?id=${item.id}`)}
      activeOpacity={0.7}
    >
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
      {item.quoted_fee_bdt != null && (
        <Text className="text-sm font-JakartaMedium" style={{ color: colors.primary }}>
          ৳{(item.quoted_fee_bdt / 100).toFixed(0)}
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.bgDark : colors.bgLight }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text className="text-lg font-JakartaBold" style={{ color: textPrimary }}>
          Delivery
        </Text>
        <TouchableOpacity onPress={() => router.push('/(main)/(customer)/(delivery)/request-create')}>
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
            No deliveries yet
          </Text>
          <Text className="text-sm font-Jakarta mt-2 text-center" style={{ color: textSecondary }}>
            Send a package anywhere in the city
          </Text>
          <TouchableOpacity
            className="mt-6 px-8 py-3 rounded-xl"
            style={{ backgroundColor: colors.primary }}
            onPress={() => router.push('/(main)/(customer)/(delivery)/request-create')}
          >
            <Text className="text-white font-JakartaBold">Send a Package</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={deliveries}
          renderItem={renderDelivery}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </SafeAreaView>
  );
}
