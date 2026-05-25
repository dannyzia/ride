import React from 'react';
import { View, Text, Platform } from 'react-native';
import { logger } from '@/lib/logger';

// Graceful import for @react-native-community/slider — falls back to a no-op
// if the native module is not installed.
let Slider: React.ComponentType<any> = () => null;
if (Platform.OS !== 'web') {
  try {
    Slider = require('@react-native-community/slider').default;
  } catch (err) {
    logger.warn('@react-native-community/slider import failed, slider will be a no-op:', err);
  }
}

interface MinRateSliderProps {
  /** The system (zone) per-km rate in BDT paisa */
  systemPerKmBdt: number;
  /** The driver's current minimum per-km rate in BDT paisa (null = use system rate) */
  minPerKmBdt: number | null;
  /** Called when the user changes the slider value (value in BDT paisa) */
  onChange: (value: number) => void;
}

/**
 * A slider for drivers to set their minimum acceptable per-km rate.
 *
 * The slider range is always 70 % – 150 % of `systemPerKmBdt`.
 * Display values are converted from paisa to BDT (÷100) and shown as both a
 * currency amount and a percentage of the system rate.
 *
 * Uses `@react-native-community/slider` with a graceful fallback when the
 * native module is unavailable.
 */
export default function MinRateSlider({ systemPerKmBdt, minPerKmBdt, onChange }: MinRateSliderProps) {
  const lowerBound = Math.floor(systemPerKmBdt * 0.7);
  const upperBound = Math.ceil(systemPerKmBdt * 1.5);

  // Clamp the initial value to the valid range
  const clamped = minPerKmBdt != null
    ? Math.max(lowerBound, Math.min(upperBound, minPerKmBdt))
    : systemPerKmBdt;

  const percentage = Math.round((clamped / systemPerKmBdt) * 100);

  // Convert paisa → BDT for the user-visible label
  const systemBdt = (systemPerKmBdt / 100).toFixed(2);
  const currentBdt = (clamped / 100).toFixed(2);

  return (
    <View className="bg-cardBgColor rounded-2xl p-4 mb-4">
      {/* Header */}
      <Text className="text-primaryTextColor text-sm font-semibold mb-1">
        Your Minimum Rate (per km)
      </Text>
      <Text className="text-secondaryTextColor text-xs mb-4">
        System rate: ৳{systemBdt} &middot; You get: ৳{currentBdt} ({percentage}%)
      </Text>

      {/* Slider */}
      <Slider
        style={{ width: '100%', height: 40 }}
        minimumValue={lowerBound}
        maximumValue={upperBound}
        step={1}
        value={clamped}
        onValueChange={onChange}
        minimumTrackTintColor="#0CC25F"
        maximumTrackTintColor="#35383F"
        thumbTintColor="#0CC25F"
      />

      {/* Range labels */}
      <View className="flex-row justify-between mt-1">
        <Text className="text-secondaryTextColor text-xs">
          ৳{(lowerBound / 100).toFixed(2)} (70%)
        </Text>
        <Text className="text-secondaryTextColor text-xs">
          ৳{(upperBound / 100).toFixed(2)} (150%)
        </Text>
      </View>
    </View>
  );
}
