/**
 * Delivery request detail — shows bids, status, actions.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useIsDark } from '@/lib/useAppearance';
import { colors } from '@/theme/goRide';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

interface DeliveryBid {
  id: string;
  courier_user_id: string;
  quoted_fee_bdt: number;
  quoted_eta_minutes: number | null;
  status: string;
  submitted_at: string;
}

interface DeliveryDetail {
  id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  quoted_fee_bdt: number | null;
  declared_fee_bdt: number | null;
  deadline_at: string;
  created_at: string;
}

export default function RequestDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isDark = useIsDark();
  const [detail, setDetail] = useState<DeliveryDetail | null>(null);
  const [bids, setBids] = useState<DeliveryBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingBidId, setAcceptingBidId] = useState<string | null>(null);

  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/delivery/requests/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDetail(data.delivery);
        setBids(data.bids ?? []);
      }
    } catch (err) {
      logger.error('Failed to fetch delivery detail', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleAcceptBid = async (bidId: string) => {
    setAcceptingBidId(bidId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/delivery/requests/${id}/accept-bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bid_id: bidId }),
      });

      if (res.ok) {
        Alert.alert('Bid Accepted', 'Courier has been assigned!');
        fetchDetail();
      } else {
        const err = await res.json();
        Alert.alert('Error', err.message || 'Failed to accept bid');
      }
    } catch (err) {
      logger.error('Accept bid failed', err);
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setAcceptingBidId(null);
    }
  };

  const renderBid = ({ item }: { item: DeliveryBid }) => (
    <View
      className="rounded-xl p-4 mb-3"
      style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
    >
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-lg font-JakartaBold" style={{ color: colors.primary }}>
          ৳{(item.quoted_fee_bdt / 100).toFixed(0)}
        </Text>
        {item.quoted_eta_minutes != null && (
          <Text className="text-sm font-Jakarta" style={{ color: textSecondary }}>
            ~{item.quoted_eta_minutes} min
          </Text>
        )}
      </View>
      {detail?.status === 'pending' && (
        <TouchableOpacity
          className="py-2 rounded-lg items-center"
          style={{ backgroundColor: colors.primary }}
          onPress={() => handleAcceptBid(item.id)}
          disabled={acceptingBidId === item.id}
        >
          {acceptingBidId === item.id ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="text-white font-JakartaBold text-sm">Accept Bid</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );

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
          <Text style={{ color: textPrimary }}>Request not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusColors: Record<string, string> = {
    pending: colors.amber,
    assigned: colors.primary,
    picked_up: colors.primary,
    in_transit: colors.primary,
    delivered: '#22C55E',
    failed: colors.danger,
    cancelled: colors.danger,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.bgDark : colors.bgLight }}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text className="text-lg font-JakartaBold ml-3" style={{ color: textPrimary }}>
          Delivery Detail
        </Text>
      </View>

      <FlatList
        data={bids}
        renderItem={renderBid}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <>
            {/* Status */}
            <View
              className="px-3 py-1 rounded-full self-start mb-4"
              style={{ backgroundColor: (statusColors[detail.status] ?? textSecondary) + '20' }}
            >
              <Text
                className="text-sm font-JakartaBold"
                style={{ color: statusColors[detail.status] ?? textSecondary }}
              >
                {detail.status}
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

            {/* Price info */}
            {detail.quoted_fee_bdt != null && (
              <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}>
                <Text className="text-sm font-Jakarta" style={{ color: textSecondary }}>
                  Agreed Price
                </Text>
                <Text className="text-2xl font-JakartaBold mt-1" style={{ color: colors.primary }}>
                  ৳{(detail.quoted_fee_bdt / 100).toFixed(0)}
                </Text>
              </View>
            )}

            {/* Bids header */}
            <Text className="text-base font-JakartaBold mb-3" style={{ color: textPrimary }}>
              {bids.length > 0 ? `${bids.length} Bid${bids.length > 1 ? 's' : ''}` : 'Waiting for bids...'}
            </Text>
          </>
        }
        ListEmptyComponent={
          <View className="items-center py-8">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text className="text-sm font-Jakarta mt-2" style={{ color: textSecondary }}>
              Couriers are reviewing your request...
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
