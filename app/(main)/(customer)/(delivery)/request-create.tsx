/**
 * Create a new delivery request — pickup/dropoff, package details, vehicle type.
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

const VEHICLE_TYPES = [
  { value: 'bike', label: 'Bike', icon: 'bicycle' as const },
  { value: 'cng', label: 'CNG', icon: 'car' as const },
  { value: 'car', label: 'Car', icon: 'car-sport' as const },
  { value: 'van', label: 'Van', icon: 'bus' as const },
  { value: 'truck', label: 'Truck', icon: 'car' as const },
] as const;

export default function RequestCreateScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const isDark = useIsDark();
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [packageDesc, setPackageDesc] = useState('');
  const [weight, setWeight] = useState('');
  const [vehicleType, setVehicleType] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const handleSubmit = async () => {
    if (!pickupAddress.trim() || !dropoffAddress.trim()) {
      Alert.alert(t("common.error"), t("delivery_create.err_missing_addresses"));
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
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/delivery/requests`, {
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
          package_description: packageDesc || undefined,
          package_weight_kg: weight ? parseInt(weight, 10) : undefined,
          required_vehicle_type: vehicleType,
          bidding_window_seconds: 600,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.replace(`/(main)/(customer)/(delivery)/request-detail?id=${data.delivery.id}`);
      } else {
        const err = await res.json();
        Alert.alert(t("common.error"), err.message || t("delivery_create.err_create_failed"));
      }
    } catch (err) {
      logger.error('Delivery request creation failed', err);
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

        {/* Package Description */}
        <Text className="text-sm font-JakartaBold mb-2 mt-4" style={{ color: textSecondary }}>
          {t("delivery_create.package_optional")}
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
          value={packageDesc}
          onChangeText={setPackageDesc}
         testID="customer.delivery.request-create.set-package-desc"/>

        {/* Weight */}
        <Text className="text-sm font-JakartaBold mb-2 mt-4" style={{ color: textSecondary }}>
          {t("delivery_create.weight_optional")}
        </Text>
        <TextInput
          className="rounded-xl px-4 py-3 text-base font-Jakarta"
          style={{
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            color: textPrimary,
          }}
          placeholder={t("delivery_create.weight_placeholder")}
          placeholderTextColor={textSecondary}
          keyboardType="numeric"
          value={weight}
          onChangeText={setWeight}
         testID="customer.delivery.request-create.set-weight"/>

        {/* Vehicle Type */}
        <Text className="text-sm font-JakartaBold mb-2 mt-4" style={{ color: textSecondary }}>
          {t("delivery_create.vehicle_type_optional")}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {VEHICLE_TYPES.map((vt) => (
            <TouchableOpacity
              key={vt.value}
              className="flex-row items-center px-4 py-2 rounded-xl"
              style={{
                backgroundColor: vehicleType === vt.value ? colors.primary + '20' : surfaceBg,
                borderWidth: 1,
                borderColor: vehicleType === vt.value ? colors.primary : borderColor,
              }}
              onPress={() => setVehicleType(vehicleType === vt.value ? null : vt.value)}
             testID="customer.delivery.request-create.set-vehicle-type">
              <Ionicons name={vt.icon} size={18} color={vehicleType === vt.value ? colors.primary : textSecondary} />
              <Text
                className="text-sm font-JakartaMedium ml-2"
                style={{ color: vehicleType === vt.value ? colors.primary : textSecondary }}
              >
                {vt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

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
              {t("delivery_create.find_couriers")}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
