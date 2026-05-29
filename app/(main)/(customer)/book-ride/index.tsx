import { colors } from '@/theme/goRide';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native'
import React, { useEffect, useState } from 'react'
import RideLayout from '@/components/RideLayout'
import { useRouter } from 'expo-router'
import { useCustomer } from '@/store'
import { useRiderStore, VehicleType } from '@/store/useRiderStore'
import CustomButton from '@/components/CustomButton'
import { VEHICLE_TYPES } from '@/lib/vehicleTypes'
import { supabase } from '@/lib/supabase'
import { icons } from '@/constants/data'
import Constants from 'expo-constants'

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL || '';

const VEHICLE_ICONS: Record<string, any> = {
  bike_basic: icons.cab,
  bike_standard: icons.cab,
  bike_plus: icons.cab,
  cng: icons.cab,
  car_economy: icons.cab,
  car_comfort: icons.cab,
  car_premium: icons.cab,
  car_xl: icons.cab,
};

const BookRidePage = () => {
  const router = useRouter()
  const { userAddress, destinationAddress, userLatitude, userLongitude, destinationLatitude, destinationLongitude } = useCustomer()
  const { selectedVehicleType, setSelectedVehicleType, estimates, setEstimates, estimating, setEstimating } = useRiderStore()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (userLatitude && userLongitude && destinationLatitude && destinationLongitude) {
      fetchEstimates()
    }
  }, [])

  const fetchEstimates = async () => {
    setEstimating(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const response = await fetch(`${API_URL}/api/ride/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          pickup_lat: userLatitude,
          pickup_lng: userLongitude,
          dropoff_lat: destinationLatitude,
          dropoff_lng: destinationLongitude,
        }),
      })
      const data = await response.json()
      if (data.estimates) {
        setEstimates(data.estimates)
      } else if (data.error) {
        setError(data.message || data.error)
      }
    } catch (_err) {
      setError('Failed to fetch estimates')
    } finally {
      setEstimating(false)
    }
  }

  const handleSelectVehicle = (vt: VehicleType) => {
    setSelectedVehicleType(vt)
    router.push('/(main)/confirm-ride')
  }

  const renderItem = ({ item }: { item: any }) => {
    const def = VEHICLE_TYPES.find(v => v.key === item.vehicle_type)
    const selected = selectedVehicleType === item.vehicle_type

    return (
      <TouchableOpacity
        onPress={() => handleSelectVehicle(item.vehicle_type)}
        className={`flex-row items-center p-4 mb-3 rounded-2xl border ${
          selected ? 'border-goAccent bg-goAccent/10' : 'border-transparent bg-cardBgColor'
        }`}
      >
        <View className="w-16 h-16 rounded-full bg-bgColor items-center justify-center">
          <Image
            source={VEHICLE_ICONS[item.vehicle_type] || icons.cab}
            className="w-8 h-8 tint-primaryTextColor"
            resizeMode="contain"
          />
        </View>
        <View className="flex-1 ml-4">
          <Text className="text-primaryTextColor text-lg font-JakartaBold">{def?.display_en || item.vehicle_type}</Text>
          <Text className="text-secondaryTextColor text-sm">{item.seats} seats • {item.eta_minutes} min</Text>
        </View>
        <View className="items-end">
          <Text className="text-primaryTextColor text-lg font-JakartaBold">৳{(item.total_bdt / 100).toFixed(0)}</Text>
          <Text className="text-secondaryTextColor text-xs">est.</Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <RideLayout title="Choose Vehicle" disabled={false}>
      <View className="flex-1">
        <View className="mb-4">
          <View className="flex-row items-center mb-2">
            <Image source={icons.marker} className="w-4 h-4 tint-goAccent" resizeMode="contain" />
            <Text className="text-primaryTextColor text-sm font-JakartaMedium ml-2 flex-1" numberOfLines={1}>
              {userAddress || 'Current location'}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Image source={icons.pin} className="w-4 h-4 tint-danger-500" resizeMode="contain" />
            <Text className="text-primaryTextColor text-sm font-JakartaMedium ml-2 flex-1" numberOfLines={1}>
              {destinationAddress || 'Destination'}
            </Text>
          </View>
        </View>

        {estimating ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-secondaryTextColor mt-3">Finding available vehicles...</Text>
          </View>
        ) : error ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-danger-500 text-base mb-4">{error}</Text>
            <CustomButton title="Retry" onPress={fetchEstimates} className="w-40" />
          </View>
        ) : estimates.length > 0 ? (
          <FlatList
            data={estimates}
            keyExtractor={(item) => item.vehicle_type}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-secondaryTextColor text-base">No vehicles available for this route</Text>
          </View>
        )}
      </View>
    </RideLayout>
  )
}

export default BookRidePage
