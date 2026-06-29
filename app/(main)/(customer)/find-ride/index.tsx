import { colors } from "@/theme/goRide";
import { View, Text, TouchableOpacity } from "react-native";
import React, { useEffect } from "react";
import RideLayout from "@/components/RideLayout";
import BarikoiAutocomplete from "@/components/BarikoiAutocomplete";
import { icons } from "@/constants/data";
import CustomButton from "@/components/CustomButton";
import { useRouter } from "expo-router";
import { useCustomer } from "@/store";
import { MaterialIcons } from "@expo/vector-icons";

const FindRidePage = () => {
  const {
    userAddress,
    userLatitude,
    userLongitude,
    destinationAddress,
    setUserLocation,
    setDestinationLocation,
  } = useCustomer();

  const router = useRouter();

  // Show Current Location button if GPS is available
  const fromLabel = userAddress
    ? userAddress.length > 49
      ? userAddress.slice(0, 49) + "..."
      : userAddress
    : userLatitude
      ? `${userLatitude.toFixed(4)}, ${userLongitude.toFixed(4)}`
      : "Enter or choose location";

  const useCurrentLocation = () => {
    const lat = userLatitude ?? 23.8103;
    const lng = userLongitude ?? 90.4125;
    setUserLocation({
      latitude: lat,
      longitude: lng,
      address: userAddress || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    });
  };

  return (
    <RideLayout title="Ride" disabled={false}>
      <View className="">
        <Text className="text-lg font-JakartaSemiBold mb-3">From</Text>
        <TouchableOpacity
          onPress={useCurrentLocation}
          className="flex-row items-center mb-2 px-3 py-2 rounded-lg bg-goAccent/10"
        >
          <MaterialIcons name="my-location" size={16} color={colors.primary} />
          <Text className="ml-2 text-sm font-inter text-goPrimary">
            {userLatitude ? "Use Current Location" : "Use Dhaka Center"}
          </Text>
        </TouchableOpacity>
        <BarikoiAutocomplete
          icon={icons.target}
          initialLocation={fromLabel}
          textInputBackgroundColor={colors.gray100}
          handlePress={(location) => setUserLocation(location)}
        />
      </View>

      <View className="">
        <Text className="text-lg font-JakartaSemiBold mb-3">To</Text>
        <BarikoiAutocomplete
          icon={icons.map}
          initialLocation={
            destinationAddress && destinationAddress.length > 49
              ? destinationAddress.slice(0, 49) + "..."
              : destinationAddress || "Enter Destination"
          }
          textInputBackgroundColor="transparent"
          handlePress={(location) => setDestinationLocation(location)}
        />
      </View>
      <CustomButton
        title="Find now"
        onPress={() => router.push("/(main)/book-ride" as never)}
        className="mt-5 w-full"
        disabled={!userLatitude && !userLongitude ? false : false}
      />
    </RideLayout>
  );
};

export default FindRidePage;
