/**
 * P2P parcel origination (plan 27 §6.1) — sender picks pickup + dropoff with
 * the ride home's location machinery (POI search via BarikoiAutocomplete +
 * map pin via components/Map with Barikoi v2 reverse geocode — no new map
 * system), then enters item note + receiver phone. POSTs /api/delivery/parcels
 * (the retired courier-bidding POST /api/delivery/requests is a 410 stub —
 * this screen no longer touches it). No vehicle/weight/bidding selection:
 * ranking is nearest-first across delivery men + toggle-ON drivers, one fee
 * tier by distance, cash collected from the receiver on delivery.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from "@expo/vector-icons/Ionicons";
import { useIsDark } from '@/lib/useAppearance';
import { colors } from '@/theme/goRide';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { ensureCustomerLocation } from '@/lib/ensureLocation';
import { getBarikoiReverseGeocodeUrl } from '@/lib/useBarikoiMapStyle';
import { API_URL } from '@/lib/config';
import Map from '@/components/Map';
import BarikoiAutocomplete from '@/components/BarikoiAutocomplete';
import { useTranslation } from 'react-i18next';

/** A picked location — the shape both parcel legs carry into the request. */
interface PickedPlace {
  address: string;
  lat: number;
  lng: number;
}

type PickerTarget = 'pickup' | 'dropoff';

export default function RequestCreateScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const isDark = useIsDark();
  const [pickup, setPickup] = useState<PickedPlace | null>(null);
  const [dropoff, setDropoff] = useState<PickedPlace | null>(null);
  const [itemNote, setItemNote] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Location picker (same machinery as the ride home's LOCATIONS step) ──
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerPin, setPickerPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pickerPinAddress, setPickerPinAddress] = useState('');
  const [pickerPinLoading, setPickerPinLoading] = useState(false);

  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  // Ride-home reverse geocode (Barikoi v2) — silent-failure contract: a
  // failed fetch just leaves the address blank (same as home/index.tsx).
  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const res = await fetch(getBarikoiReverseGeocodeUrl(lat, lng));
      if (!res.ok) return '';
      const data = await res.json();
      return data?.place?.address || data?.place?.name || '';
    } catch {
      return ''; // non-blocking
    }
  }, []);

  // Ensure-before-use (Stage 3 #19/G6): opening the picker hydrates the
  // customer store (permission + fix + reverse geocode) so the map centers
  // on the user's area; the silent-fallback contract keeps POI search usable
  // even when permission is denied.
  const openPicker = useCallback((target: PickerTarget) => {
    setPickerTarget(target);
    setPickerPin(null);
    setPickerPinAddress('');
    ensureCustomerLocation();
  }, []);

  const closePicker = useCallback(() => {
    setPickerTarget(null);
    setPickerPin(null);
    setPickerPinAddress('');
  }, []);

  const commitPicked = useCallback(
    (place: PickedPlace) => {
      if (pickerTarget === 'pickup') setPickup(place);
      else if (pickerTarget === 'dropoff') setDropoff(place);
      closePicker();
    },
    [pickerTarget, closePicker],
  );

  // Named handlers — the testID codemod derives ids from handler identifier
  // references (slug of the function name), so keep the names canonical.
  const openPickupPicker = useCallback(() => openPicker('pickup'), [openPicker]);
  const openDropoffPicker = useCallback(() => openPicker('dropoff'), [openPicker]);

  const confirmPicked = useCallback(() => {
    if (!pickerPin) return;
    commitPicked({
      lat: pickerPin.lat,
      lng: pickerPin.lng,
      address: pickerPinAddress || `${pickerPin.lat.toFixed(4)}, ${pickerPin.lng.toFixed(4)}`,
    });
  }, [pickerPin, pickerPinAddress, commitPicked]);

  // POI suggestion tap — the autocomplete component resolves lat/lng/address.
  const handleSuggestionPicked = useCallback(
    (location: { latitude: number; longitude: number; address: string }) => {
      commitPicked({
        lat: location.latitude,
        lng: location.longitude,
        address: location.address,
      });
    },
    [commitPicked],
  );

  const handlePickerMapPress = useCallback(
    async (coords: { lat: number; lng: number }) => {
      setPickerPin(coords);
      setPickerPinLoading(true);
      setPickerPinAddress('');
      try {
        const address = await reverseGeocode(coords.lat, coords.lng);
        if (address) setPickerPinAddress(address);
      } finally {
        setPickerPinLoading(false);
      }
    },
    [reverseGeocode],
  );

  const handleSubmit = async () => {
    if (!pickup || !dropoff || !itemNote.trim() || !receiverPhone.trim()) {
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

      const res = await fetch(`${API_URL}/api/delivery/parcels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          pickup_address: pickup.address,
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          dropoff_address: dropoff.address,
          dropoff_lat: dropoff.lat,
          dropoff_lng: dropoff.lng,
          item_note: itemNote,
          receiver_phone: receiverPhone,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.replace(`/(main)/(customer)/parcel/request-detail?id=${data.leg_id}`);
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

  // ── Address field row (opens the picker — mirrors the ride home rows) ──
  const placeRow = (target: PickerTarget) => {
    const isPickup = target === 'pickup';
    return {
      labelKey: isPickup ? 'delivery_create.pickup_address' : 'delivery_create.dropoff_address',
      placeholderKey: isPickup ? 'delivery_create.pickup_placeholder' : 'delivery_create.dropoff_placeholder',
      icon: (isPickup ? 'locate-outline' : 'location') as 'locate-outline' | 'location',
      iconColor: isPickup ? colors.primary : colors.danger,
      value: isPickup ? pickup : dropoff,
    };
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.bgDark : colors.bgLight }}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <TouchableOpacity onPress={() => router.back()} testID="customer.parcel.request-create.el-1">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text className="text-lg font-JakartaBold ml-3" style={{ color: textPrimary }}>
          {t("delivery_create.title")}
        </Text>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Pickup — POI/map picker (same richness as the ride home) */}
        <Text className="text-sm font-JakartaBold mb-2 mt-4" style={{ color: textSecondary }}>
          {t("delivery_create.pickup_address")}
        </Text>
        <TouchableOpacity
          className="flex-row items-center rounded-xl px-4 py-3"
          style={{
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
          }}
          onPress={openPickupPicker}
         testID="customer.parcel.request-create.open-pickup-picker">
          <Ionicons name={placeRow('pickup').icon} size={20} color={placeRow('pickup').iconColor} />
          <View className="flex-1 ml-3">
            <Text className="text-xs font-Jakarta" style={{ color: textSecondary }}>
              {t(placeRow('pickup').labelKey)}
            </Text>
            <Text
              className="text-base font-Jakarta mt-0.5"
              style={{ color: pickup ? textPrimary : textDisabled }}
              numberOfLines={1}
            >
              {pickup?.address || t(placeRow('pickup').placeholderKey)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={textDisabled} />
        </TouchableOpacity>

        {/* Dropoff — POI/map picker */}
        <Text className="text-sm font-JakartaBold mb-2 mt-4" style={{ color: textSecondary }}>
          {t("delivery_create.dropoff_address")}
        </Text>
        <TouchableOpacity
          className="flex-row items-center rounded-xl px-4 py-3"
          style={{
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
          }}
          onPress={openDropoffPicker}
         testID="customer.parcel.request-create.open-dropoff-picker">
          <Ionicons name={placeRow('dropoff').icon} size={20} color={placeRow('dropoff').iconColor} />
          <View className="flex-1 ml-3">
            <Text className="text-xs font-Jakarta" style={{ color: textSecondary }}>
              {t(placeRow('dropoff').labelKey)}
            </Text>
            <Text
              className="text-base font-Jakarta mt-0.5"
              style={{ color: dropoff ? textPrimary : textDisabled }}
              numberOfLines={1}
            >
              {dropoff?.address || t(placeRow('dropoff').placeholderKey)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={textDisabled} />
        </TouchableOpacity>

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
         testID="customer.parcel.request-create.set-item-note"/>

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
         testID="customer.parcel.request-create.set-receiver-phone"/>

        {/* Submit */}
        <TouchableOpacity
          className="mt-8 py-4 rounded-xl items-center"
          style={{
            backgroundColor: pickup && dropoff ? colors.primary : colors.primary + '40',
          }}
          onPress={handleSubmit}
          disabled={submitting || !pickup || !dropoff}
         testID="customer.parcel.request-create.handle-submit">
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-JakartaBold text-base">
              {t("delivery_create.submit_parcel")}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* ── Location picker modal (POI search + map pin, ride-home machinery) ── */}
      <Modal
        visible={pickerTarget !== null}
        animationType="slide"
        onRequestClose={closePicker}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.bgDark : colors.bgLight }}>
          <View className="flex-row items-center px-4 py-3">
            <TouchableOpacity onPress={closePicker} testID="customer.parcel.request-create.close-picker">
              <Ionicons name="close" size={24} color={textPrimary} />
            </TouchableOpacity>
            <Text className="text-lg font-JakartaBold ml-3" style={{ color: textPrimary }}>
              {pickerTarget === 'pickup'
                ? t("delivery_create.pickup_address")
                : t("delivery_create.dropoff_address")}
            </Text>
          </View>

          {/* POI search — resolves to a commit on selection (same as the ride
              home's autocomplete screen). */}
          <View className="px-4">
            <BarikoiAutocomplete
              initialLocation={
                pickerTarget === 'pickup'
                  ? t("delivery_create.pickup_placeholder")
                  : t("delivery_create.dropoff_placeholder")
              }
              handlePress={handleSuggestionPicked}
            />
          </View>

          {/* Map pin selection — tap to drop a pin, reverse geocode it. */}
          <View className="px-4">
            <View className="rounded-xl overflow-hidden" style={{ height: 300 }}>
              <Map onMapPress={handlePickerMapPress} />
            </View>
            <View
              className="mt-3 rounded-xl px-4 py-3"
              style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
            >
              <Text className="text-sm font-Jakarta" style={{ color: textSecondary }} numberOfLines={2}>
                {pickerPinLoading
                  ? t("rider_home.getting_address")
                  : pickerPin
                    ? pickerPinAddress || `${pickerPin.lat.toFixed(4)}, ${pickerPin.lng.toFixed(4)}`
                    : t("rider_home.tap_location")}
              </Text>
            </View>

            {/* Confirm the dropped pin into the target field */}
            <TouchableOpacity
              className="mt-4 py-4 rounded-xl items-center"
              style={{
                backgroundColor: pickerPin ? colors.primary : colors.primary + '40',
              }}
              onPress={confirmPicked}
              disabled={!pickerPin}
             testID="customer.parcel.request-create.confirm-picked">
              <Text className="text-white font-JakartaBold text-base">
                {t("delivery_create.confirm_location")}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
