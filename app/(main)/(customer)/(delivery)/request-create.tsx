/**
 * P2P parcel origination (plan 27 §6.1) — sender enters pickup, dropoff,
 * item note + receiver phone. POSTs /api/delivery/parcels (the retired
 * courier-bidding POST /api/delivery/requests is a 410 stub — this screen
 * no longer touches it). No vehicle/weight/bidding selection: ranking is
 * nearest-first across delivery men + toggle-ON drivers, one fee tier by
 * distance, cash collected from the receiver on delivery.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from "@expo/vector-icons/Ionicons";
import { useIsDark } from '@/lib/useAppearance';
import { colors } from '@/theme/goRide';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { useTranslation } from 'react-i18next';

export default function RequestCreateScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const isDark = useIsDark();
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [itemNote, setItemNote] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const handleSubmit = async () => {
    if (!pickupAddress.trim() || !dropoffAddress.trim() || !itemNote.trim() || !receiverPhone.trim()) {
      Alert.alert(t("common.error"), t("delivery_create.err_missing_fields"));
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        Alert.alert(t("common.error"), t("common.not_authenticated"));
        return;
      }

      // Use Dhaka default coordinates (to be replaced with map picker)
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/delivery/parcels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          pickup_address: pickupAddress,
          pickup_lat: 23.8103,
          pickup_lng: 90.4125,
          dropoff_address: dropoffAddress,
          dropoff_lat: 23.8103,
          dropoff_lng: 90.4125,
          item_note: itemNote,
          receiver_phone: receiverPhone,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.replace(`/(main)/(customer)/(delivery)/request-detail?id=${data.leg_id}`);
      } else {
        const err = await res.json();
        Alert.alert(t("common.error"), err.message || t("delivery_create.err_create_failed"));
      }
    } catch (err) {
      logger.error('Parcel creation failed', err);
      Alert.alert(t("common.error"), t("common.something_went_wrong"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.bgDark : colors.bgLight }}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <TouchableOpacity onPress={() => router.back()} testID="customer.delivery.request-create.el-1">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text className="text-lg font-JakartaBold ml-3" style={{ color: textPrimary }}>
          {t("delivery_create.title")}
        </Text>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Pickup */}
        <Text className="text-sm font-JakartaBold mb-2 mt-4" style={{ color: textSecondary }}>
          {t("delivery_create.pickup_address")}
        </Text>
        <TextInput
          className="rounded-xl px-4 py-3 text-base font-Jakarta"
          style={{
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            color: textPrimary,
          }}
          placeholder={t("delivery_create.pickup_placeholder")}
          placeholderTextColor={textSecondary}
          value={pickupAddress}
          onChangeText={setPickupAddress}
         testID="customer.delivery.request-create.set-pickup-address"/>

        {/* Dropoff */}
        <Text className="text-sm font-JakartaBold mb-2 mt-4" style={{ color: textSecondary }}>
          {t("delivery_create.dropoff_address")}
        </Text>
        <TextInput
          className="rounded-xl px-4 py-3 text-base font-Jakarta"
          style={{
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            color: textPrimary,
          }}
          placeholder={t("delivery_create.dropoff_placeholder")}
          placeholderTextColor={textSecondary}
          value={dropoffAddress}
          onChangeText={setDropoffAddress}
         testID="customer.delivery.request-create.set-dropoff-address"/>

        {/* Item note (required — the courier reads this at pickup) */}
        <Text className="text-sm font-JakartaBold mb-2 mt-4" style={{ color: textSecondary }}>
          {t("delivery_create.item_note")}
        </Text>
        <TextInput
          className="rounded-xl px-4 py-3 text-base font-Jakarta"
          style={{
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            color: textPrimary,
          }}
          placeholder={t("delivery_create.package_placeholder")}
          placeholderTextColor={textSecondary}
          value={itemNote}
          onChangeText={setItemNote}
         testID="customer.delivery.request-create.set-item-note"/>

        {/* Receiver phone (handover contact — pays cash on delivery) */}
        <Text className="text-sm font-JakartaBold mb-2 mt-4" style={{ color: textSecondary }}>
          {t("delivery_create.receiver_phone")}
        </Text>
        <TextInput
          className="rounded-xl px-4 py-3 text-base font-Jakarta"
          style={{
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            color: textPrimary,
          }}
          placeholder={t("delivery_create.receiver_phone_placeholder")}
          placeholderTextColor={textSecondary}
          keyboardType="phone-pad"
          value={receiverPhone}
          onChangeText={setReceiverPhone}
         testID="customer.delivery.request-create.set-receiver-phone"/>

        {/* Submit */}
        <TouchableOpacity
          className="mt-8 py-4 rounded-xl items-center"
          style={{
            backgroundColor: pickupAddress && dropoffAddress ? colors.primary : colors.primary + '40',
          }}
          onPress={handleSubmit}
          disabled={submitting || !pickupAddress || !dropoffAddress}
         testID="customer.delivery.request-create.handle-submit">
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-JakartaBold text-base">
              {t("delivery_create.submit_parcel")}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
