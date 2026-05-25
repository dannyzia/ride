import { View, Text, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { auth } from '@/lib/firebase';
import { useRiderStore } from '@/store/useRiderStore';
import { VEHICLE_TYPES } from '@/lib/vehicleTypes';
import CustomButton from '@/components/CustomButton';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL ?? '';

export default function FinalPage() {
  const {
    activeRide, searchingRideId, rideStatus,
    setActiveRide, setRideStatus, setSearchingRideId, clearRoute,
  } = useRiderStore();

  const [polling, setPolling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const vehicleDef = activeRide?.vehicle_type
    ? VEHICLE_TYPES.find(v => v.key === activeRide.vehicle_type as any)
    : null;

  // Poll ride status while finding
  useEffect(() => {
    const rideId = searchingRideId || activeRide?.id;
    if (!rideId || rideStatus === 'completed' || rideStatus === 'cancelled' || rideStatus === 'expired') {
      setPolling(false);
      return;
    }

    setPolling(true);
    const apiBase = API_URL;

    const poll = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();

        const res = await fetch(`${apiBase}/api/ride/${rideId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.ride) {
          setActiveRide(data.ride);
          const newStatus = mapStatus(data.ride.status);
          setRideStatus(newStatus);
        }
      } catch {
        // Network error — retry on next poll
      }
    };

    // Immediate first poll
    poll();
    pollRef.current = setInterval(poll, 5000);

    // Elapsed timer
    const elapsedInt = setInterval(() => setElapsed(p => p + 1), 1000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(elapsedInt);
    };
  }, [searchingRideId, activeRide?.id, rideStatus]);

  const handleCancel = useCallback(async () => {
    if (!searchingRideId && !activeRide?.id) return;
    const rideId = searchingRideId || activeRide?.id;
    if (!rideId) return;

    setCancelling(true);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch(`${API_URL}/api/ride/${rideId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cancelled_by: 'rider', reason: 'rider_cancelled' }),
      });
      if (res.ok) {
        setRideStatus('cancelled');
        setSearchingRideId(null);
      }
    } catch {
      Alert.alert('Error', 'Failed to cancel ride');
    } finally {
      setCancelling(false);
    }
  }, [searchingRideId, activeRide?.id]);

  const handleGoHome = () => {
    clearRoute();
    setActiveRide(null);
    setSearchingRideId(null);
    setRideStatus('idle');
    router.replace('/(main)/(customer)/(tabs)/home');
  };

  const renderFinding = () => (
    <View className="flex-1 items-center justify-center px-6">
      <ActivityIndicator size="large" color="#0CC25F" />
      <Text className="text-xl font-urbanist-bold text-[#212121] mt-6">
        Finding your ride...
      </Text>
      <Text className="text-sm font-inter text-gray-500 mt-2 text-center">
        Searching for nearby drivers
      </Text>
      <View className="mt-8 p-4 bg-white rounded-2xl w-full border border-[#DADADA]">
        <Text className="text-sm font-inter text-gray-500">Searching for</Text>
        <Text className="text-lg font-urbanist-bold text-[#212121] mt-1">
          {vehicleDef?.display_en ?? activeRide?.vehicle_type ?? 'Vehicle'}
        </Text>
        <Text className="text-sm font-inter text-gray-400 mt-1">
          Elapsed: {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')}
        </Text>
      </View>
      <CustomButton
        title={cancelling ? 'Cancelling...' : 'Cancel Request'}
        onPress={handleCancel}
        bgVariant="danger"
        disabled={cancelling}
        className="w-full mt-6"
      />
    </View>
  );

  const renderMatched = () => (
    <View className="flex-1 px-4 pt-4">
      {/* Driver info card */}
      <View className="p-4 bg-white rounded-2xl border border-[#DADADA]">
        <Text className="text-lg font-urbanist-bold text-[#212121]">
          Driver Found!
        </Text>
        <View className="flex-row items-center mt-3">
          <View className="w-14 h-14 rounded-full bg-[#0CC25F]/10 items-center justify-center">
            <Text className="text-2xl text-[#0CC25F] font-urbanist-bold">
              {activeRide?.driver?.name?.charAt(0) ?? 'D'}
            </Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-base font-urbanist-bold text-[#212121]">
              {activeRide?.driver?.name ?? 'Driver'}
            </Text>
            <Text className="text-sm font-inter text-gray-500">
              {activeRide?.driver?.vehicle_type
                ? VEHICLE_TYPES.find(v => v.key === activeRide.driver!.vehicle_type as any)?.display_en ?? activeRide.driver.vehicle_type
                : vehicleDef?.display_en ?? ''}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-base font-urbanist-bold text-[#212121]">
              {activeRide?.driver?.rating ? `${parseFloat(activeRide.driver.rating.toString()).toFixed(1)}` : '5.0'}
            </Text>
            <Text className="text-xs font-inter text-gray-400">Rating</Text>
          </View>
        </View>
      </View>

      {/* Trip info */}
      <View className="mt-4 p-4 bg-white rounded-2xl border border-[#DADADA]">
        <View className="flex-row items-center">
          <View className="w-8 h-8 rounded-full bg-[#0CC25F]/10 items-center justify-center">
            <Text className="text-[#0CC25F] text-xs">●</Text>
          </View>
          <Text className="ml-3 text-sm font-inter text-[#212121] flex-1" numberOfLines={1}>
            {activeRide?.origin_address ?? 'Pickup'}
          </Text>
        </View>
        <View className="h-4 w-0.5 bg-gray-300 ml-4" />
        <View className="flex-row items-center">
          <View className="w-8 h-8 rounded-full bg-[#E31D1C]/10 items-center justify-center">
            <Text className="text-[#E31D1C] text-xs">■</Text>
          </View>
          <Text className="ml-3 text-sm font-inter text-[#212121] flex-1" numberOfLines={1}>
            {activeRide?.destination_address ?? 'Dropoff'}
          </Text>
        </View>
      </View>

      {/* Fare */}
      <View className="mt-4 p-4 bg-white rounded-2xl border border-[#DADADA]">
        <View className="flex-row justify-between">
          <Text className="text-sm font-inter text-gray-500">Est. Fare</Text>
          <Text className="text-lg font-urbanist-bold text-[#0CC25F]">
            ৳{activeRide?.fare_breakdown?.total_bdt
              ? (Number(activeRide.fare_breakdown.total_bdt) / 100).toFixed(0)
              : '—'}
          </Text>
        </View>
        <View className="flex-row justify-between mt-1">
          <Text className="text-sm font-inter text-gray-500">Distance</Text>
          <Text className="text-sm font-inter text-[#212121]">
            {activeRide?.distance_km ? `${activeRide.distance_km.toFixed(1)} km` : '—'}
          </Text>
        </View>
      </View>
    </View>
  );

  const renderCompleted = () => (
    <View className="flex-1 items-center justify-center px-6">
      <View className="w-20 h-20 rounded-full bg-[#0CC25F]/10 items-center justify-center mb-4">
        <Text className="text-4xl text-[#0CC25F]">✓</Text>
      </View>
      <Text className="text-2xl font-urbanist-bold text-[#212121]">
        Ride Complete!
      </Text>
      <View className="mt-6 p-4 bg-white rounded-2xl w-full border border-[#DADADA]">
        <View className="flex-row justify-between">
          <Text className="text-sm font-inter text-gray-500">Total Fare</Text>
          <Text className="text-lg font-urbanist-bold text-[#0CC25F]">
            ৳{activeRide?.fare_breakdown?.total_bdt
              ? (Number(activeRide.fare_breakdown.total_bdt) / 100).toFixed(0)
              : '—'}
          </Text>
        </View>
      </View>
      <CustomButton
        title="Back to Home"
        onPress={handleGoHome}
        className="w-full mt-6"
      />
    </View>
  );

  const renderError = () => (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-4xl mb-4">😔</Text>
      <Text className="text-xl font-urbanist-bold text-[#212121] text-center">
        No drivers available
      </Text>
      <Text className="text-sm font-inter text-gray-500 mt-2 text-center">
        Please try again later
      </Text>
      <CustomButton
        title="Back to Home"
        onPress={handleGoHome}
        className="w-full mt-6"
      />
    </View>
  );

  const renderState = () => {
    switch (rideStatus) {
      case 'finding':
        return renderFinding();
      case 'matched':
      case 'arriving':
      case 'in_progress':
        return renderMatched();
      case 'completed':
        return renderCompleted();
      case 'cancelled':
      case 'expired':
        return renderError();
      default:
        return (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#0CC25F" />
          </View>
        );
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F7FCFF]">
      <View className="flex-1">
        {renderState()}
      </View>
    </SafeAreaView>
  );
}

function mapStatus(dbStatus: string): 'finding' | 'arriving' | 'in_progress' | 'completed' | 'cancelled' | 'expired' | 'idle' {
  switch (dbStatus) {
    case 'pending':
    case 'dispatching':
      return 'finding';
    case 'matched':
    case 'driver_arriving':
      return 'arriving';
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
    case 'no_drivers':
      return 'expired';
    default:
      return 'idle';
  }
}
