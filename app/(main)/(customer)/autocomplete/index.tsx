import { colors } from "@/theme/goRide";
import React, { useState, useEffect } from "react";
import {
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { icons } from "@/constants/data";
import { useCustomer } from "@/store";
import { router } from "expo-router";
import { getBarikoiAutocompleteUrl } from "@/lib/useBarikoiMapStyle";

const AutocompletePage = () => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { userLatitude, userLongitude, setDestinationLocation } = useCustomer();

  const handleDestinationPress = (location: {
    latitude: number;
    longitude: number;
    address: string;
  }) => {
    setDestinationLocation(location);
    router.push("/(main)/find-ride");
  };

  useEffect(() => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    const fetchPlaces = async () => {
      setLoading(true);
      try {
        const url = getBarikoiAutocompleteUrl(
          query,
          userLatitude ?? undefined,
          userLongitude ?? undefined,
        );
        const response = await fetch(url);
        const data = await response.json();
        const places = data.places || data.data || [];
        setSuggestions(places);
      } catch (error) {
        console.error("Error fetching autocomplete:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlaces();
  }, [query]);

  const handlePlaceSelect = (place: any) => {
    // Barikoi autocomplete already returns lat/lng — no detail fetch needed.
    const lat = parseFloat(place.latitude || place.lat || 0);
    const lng = parseFloat(place.longitude || place.lng || place.lon || 0);
    const address =
      place.address ||
      place.place_name ||
      place.description ||
      place.name ||
      query;

    handleDestinationPress({ latitude: lat, longitude: lng, address });
    setQuery(address);
    setSuggestions([]);
  };

  return (
    <SafeAreaView className="flex-1 bg-bgColor px-5">
      <TouchableOpacity
        onPress={() => router.back()}
        className="flex justify-center items-center w-10 h-10 rounded-full bg-primaryTextColor"
      >
        <Image source={icons.backArrow} className="w-5 h-5" />
      </TouchableOpacity>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="mt-10 mb-6 items-center">
          <Text className="text-primaryTextColor text-3xl font-bold text-center">
            Where do you want to go?
          </Text>
        </View>

        <View className="flex-row items-center bg-cardBgColor rounded-full px-4 py-3 mb-5">
          <Image
            source={icons.search}
            className="w-6 h-6 tint-primaryTextColor"
          />
          <TextInput
            placeholder="Search destination..."
            placeholderTextColor={colors.adminSubtle}
            value={query}
            onChangeText={setQuery}
            className="flex-1 text-primaryTextColor text-base ml-3"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Image
                source={icons.close}
                className="w-5 h-5 ml-2 tint-primaryTextColor"
              />
            </TouchableOpacity>
          )}
        </View>

        {loading && (
          <ActivityIndicator
            size="large"
            color={colors.textDisabledDark}
            className="mt-5"
          />
        )}

        <FlatList
          data={suggestions}
          keyExtractor={(item, idx) => item.place_id || item.id || String(idx)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 50 }}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handlePlaceSelect(item)}
              className="p-4 border-b border-borderColor"
            >
              <Text className="text-primaryTextColor text-xl">
                {item.address ||
                  item.place_name ||
                  item.description ||
                  item.name}
              </Text>
            </TouchableOpacity>
          )}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default AutocompletePage;
