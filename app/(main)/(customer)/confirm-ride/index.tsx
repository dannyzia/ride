import { Image, Text, View, Alert } from "react-native";
import RideLayout from "@/components/RideLayout";
import { useCustomer } from "@/store";
import { icons } from "@/constants/data";
import { useRouter } from "expo-router";
import CustomButton from "@/components/CustomButton";
import { useEffect, useState } from "react";
import { useRiderStore, VehicleType } from "@/store/useRiderStore";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";
import Constants from 'expo-constants';
import { auth } from '@/lib/firebase';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL ?? '';
const BARIKOI_API_KEY = Constants.expoConfig?.extra?.BARIKOI_API_KEY ?? '';

const ConfirmRidePage = () => {
  const router = useRouter();
  const { userAddress, destinationAddress, userLatitude, userLongitude, destinationLatitude, destinationLongitude } = useCustomer();
  const { selectedVehicleType, estimates, setSearchingRideId, setRideStatus } = useRiderStore();
  const [rideDuration, setRideDuration] = useState<string>('');
  const [rideDistance, setRideDistance] = useState<string>('');
  const [requesting, setRequesting] = useState(false);

  const selectedEstimate = estimates.find(e => e.vehicle_type === selectedVehicleType);
  const vehicleDef = selectedVehicleType ? VEHICLE_TYPES.find(v => v.key === selectedVehicleType) : null;

  useEffect(() => {
    if (!userLongitude || !userLatitude || !destinationLongitude || !destinationLatitude) return;

    const fetchRoute = async () => {
      try {
        const url = `https://barikoi.xyz/v1/api/distance/directions/${BARIKOI_API_KEY}?from=${userLongitude},${userLatitude}&to=${destinationLongitude},${destinationLatitude}`;
        const response = await fetch(url);
        const data = await response.json();
        const seconds = data.duration || data.routes?.[0]?.duration || 0;
        const meters = data.distance || data.routes?.[0]?.distance || 0;

        const timeInMinutes = Math.round((seconds + 300) / 60);
        const duration = timeInMinutes < 60
          ? `${timeInMinutes} mins`
          : `${(timeInMinutes / 60).toFixed(1)} hours`;

        const km = meters / 1000;
        const distance = km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(meters)} m`;

        setRideDuration(duration);
        setRideDistance(distance);
      } catch {
        setRideDuration(selectedEstimate ? `${selectedEstimate.eta_minutes} min` : 'N/A');
        setRideDistance(selectedEstimate ? `${selectedEstimate.distance_km.toFixed(1)} km` : 'N/A');
      }
    };

    fetchRoute();
  }, []);

  const handleRequestRide = async () => {
    if (!userLatitude || !userLongitude || !destinationLatitude || !destinationLongitude || !selectedVehicleType) {
      Alert.alert('Error', 'Missing location or vehicle type');
      return;
    }

    const user = auth.currentUser;
    if (!user) { Alert.alert('Error', 'Not authenticated'); return; }

    setRequesting(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${API_URL}/api/ride/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pickup_lat: userLatitude,
          pickup_lng: userLongitude,
          pickup_address: userAddress || '',
          dropoff_lat: destinationLatitude,
          dropoff_lng: destinationLongitude,
          dropoff_address: destinationAddress || '',
          vehicle_type: selectedVehicleType,
        }),
      });
      const data = await response.json();
      if (data.ride_id) {
        setSearchingRideId(data.ride_id);
        setRideStatus('finding');
        router.replace('/(main)/(customer)/final-page');
      } else {
        Alert.alert('Request Failed', data.message || data.error || 'Could not find a driver');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Network error');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <RideLayout title="Confirm Ride" disabled={false}>
      <View className="flex-1">
        {/* Selected vehicle info */}
        {selectedEstimate && vehicleDef && (
          <View className="flex-row items-center p-4 mb-5 rounded-2xl bg-cardBgColor">
            <View className="w-16 h-16 rounded-full bg-bgColor items-center justify-center">
              <Image source={icons.cab} className="w-8 h-8 tint-primaryTextColor" resizeMode="contain" />
            </View>
            <View className="flex-1 ml-4">
              <Text className="text-primaryTextColor text-lg font-JakartaBold">{vehicleDef.display_en}</Text>
              <Text className="text-secondaryTextColor text-sm">{selectedEstimate.seats} seats</Text>
            </View>
            <View className="items-end">
              <Text className="text-primaryTextColor text-lg font-JakartaBold">৳{(selectedEstimate.total_bdt / 100).toFixed(0)}</Text>
              <Text className="text-secondaryTextColor text-xs">{selectedEstimate.eta_minutes} min</Text>
            </View>
          </View>
        )}

        {/* Ride info card */}
        <View className="rounded-2xl bg-cardBgColor p-4 mb-5">
          <View className="flex-row justify-between py-2 border-b border-borderColor">
            <Text className="text-secondaryTextColor">Distance</Text>
            <Text className="text-primaryTextColor font-JakartaSemiBold">{rideDistance}</Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-borderColor">
            <Text className="text-secondaryTextColor">Duration</Text>
            <Text className="text-primaryTextColor font-JakartaSemiBold">{rideDuration}</Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text className="text-secondaryTextColor">Fare</Text>
            <Text className="text-[#0CC25F] text-lg font-JakartaBold">
              ৳{selectedEstimate ? (selectedEstimate.total_bdt / 100).toFixed(0) : '—'}
            </Text>
          </View>
        </View>

        {/* Pickup / Dropoff */}
        <View className="rounded-2xl bg-cardBgColor p-4 mb-5">
          <View className="flex-row items-center py-2 border-b border-borderColor">
            <Image source={icons.marker} className="w-5 h-5 tint-[#0CC25F]" resizeMode="contain" />
            <Text className="text-primaryTextColor ml-3 flex-1" numberOfLines={2}>{userAddress || 'Pickup'}</Text>
          </View>
          <View className="flex-row items-center py-2">
            <Image source={icons.pin} className="w-5 h-5 tint-danger-500" resizeMode="contain" />
            <Text className="text-primaryTextColor ml-3 flex-1" numberOfLines={2}>{destinationAddress || 'Dropoff'}</Text>
          </View>
        </View>

        <CustomButton
          title={requesting ? 'Requesting...' : 'Request Ride'}
          onPress={handleRequestRide}
          disabled={requesting || !selectedVehicleType}
          className="w-full mt-auto"
        />
      </View>
    </RideLayout>
  );
};

export default ConfirmRidePage;
