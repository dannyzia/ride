import { View, Text, Image, TouchableOpacity } from 'react-native'
import React from 'react'
import { RideData } from '@/types/type'
import { icons } from '@/constants/data'
import { useRouter } from 'expo-router'
import { formatDate } from '@/lib/utils'
import { colors } from '@/theme/goRide'
import { useIsDark } from '@/lib/useAppearance'

const RideCard = ({ ride }: { ride: RideData }) => {
  const router = useRouter();
  const isDark = useIsDark();

  const {
    origin_address,
    destination_address,
    created_at,
    driver,
    ride_id
  } = ride;

  const cardBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const innerBg = isDark ? colors.darkSecondary : colors.gray100;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  return (
    <TouchableOpacity onPress={() => router.push(`/(main)/(customer)/show-ride/${ride_id}`)}>
      <View
        className="rounded-2xl mb-6 p-[1.5px]"
        style={{
          backgroundColor: isDark ? colors.borderDark : colors.borderLight,
        }}
      >
        <View
          className="rounded-2xl p-3"
          style={{ backgroundColor: cardBg }}
        >
          <View className="flex flex-col items-center justify-center w-full">

            {/* Top Map + Route Info */}
            <View className="flex flex-row items-center justify-between w-full">
              <View
                className="w-[80px] h-[90px] rounded-lg items-center justify-center"
                style={{ backgroundColor: innerBg }}
              >
                <Image source={icons.point} style={{ width: 32, height: 32, tintColor: colors.primary }} />
              </View>
              <View className="flex flex-col mx-5 gap-y-4 flex-1">
                <View className="flex flex-row items-center gap-x-2">
                  <Image source={icons.to} style={{ width: 20, height: 20, tintColor: textSecondary }} />
                  <Text
                    className="text-base font-JakartaMedium"
                    style={{ color: textPrimary }}
                    numberOfLines={1}
                  >
                    {origin_address}
                  </Text>
                </View>

                <View className="flex flex-row items-center gap-x-2">
                  <Image source={icons.point} style={{ width: 20, height: 20, tintColor: textSecondary }} />
                  <Text
                    className="text-base font-JakartaMedium"
                    style={{ color: textPrimary }}
                    numberOfLines={1}
                  >
                    {destination_address}
                  </Text>
                </View>
              </View>
            </View>

            {/* Info Section */}
            <View
              className="flex flex-col w-full mt-4 rounded-lg p-4 border"
              style={{
                backgroundColor: innerBg,
                borderColor: borderColor,
              }}
            >
              <View className="flex flex-row justify-between mb-3">
                <Text
                  className="text-sm font-JakartaMedium"
                  style={{ color: textSecondary }}
                >
                  Ride Date
                </Text>
                <Text
                  className="text-sm font-JakartaMedium"
                  style={{ color: textPrimary }}
                >
                  {formatDate(created_at)}
                </Text>
              </View>

              <View className="flex flex-row justify-between mb-3">
                <Text
                  className="text-sm font-JakartaMedium"
                  style={{ color: textSecondary }}
                >
                  Driver
                </Text>
                <Text
                  className="text-sm font-JakartaMedium"
                  style={{ color: textPrimary }}
                >
                  {driver.full_name}
                </Text>
              </View>
            </View>

          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default RideCard