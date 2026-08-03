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
import { logger } from "@/lib/logger";

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

    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        // ── Try Barikoi first ──────────────────────────────
        const barikoiUrl = getBarikoiAutocompleteUrl(
          query,
          userLatitude ?? undefined,
          userLongitude ?? undefined,
        );
        const barikoiRes = await fetch(barikoiUrl);
        if (barikoiRes.ok) {
          const data = await barikoiRes.json();
          const places = data.places || data.data || [];
          if (places.length > 0) {
            setSuggestions(places);
            return;
          }
        }

        // ── Fallback: OpenStreetMap Nominatim (free, no key) ──
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=8&countrycodes=bd`;
        const nomRes = await fetch(nominatimUrl, {
          headers: { "User-Agent": "Ride-App/1.0" },
        });
        if (nomRes.ok) {
          const nomData = await nomRes.json();
          const places = nomData.map((item: any) => ({
            latitude: item.lat,
            longitude: item.lon,
            address: item.display_name,
            name: item.name || item.display_name.split(",")[0],
          }));
          setSuggestions(places);
          return;
        }

        setSuggestions([]);
      } catch (error) {
        logger.error("Error fetching autocomplete:", error);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 400); // 400ms debounce to avoid spamming the API on every keystroke

    return () => clearTimeout(timeoutId);
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
    <SafeAreaView className="flex-1 bg-goBgLight px-5">
      <TouchableOpacity
        onPress={() => router.back()}
        className="flex justify-center items-center w-10 h-10 rounded-full bg-goSurfaceLight"
      >
        <Image source={icons.backArrow} className="w-5 h-5" />
      </TouchableOpacity>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="mt-10 mb-6 items-center">
          <Text className="text-goTextPrimaryLight text-3xl font-bold text-center">
            Where do you want to go?
          </Text>
        </View>

        <View className="flex-row items-center bg-goSurfaceLight rounded-full px-4 py-3 mb-5">
          <Image
            source={icons.search}
            className="w-6 h-6"
            style={{ tintColor: colors.textSecondaryLight }}
          />
          <TextInput
            placeholder="Search destination..."
            placeholderTextColor={colors.textSecondaryLight}
            value={query}
            onChangeText={setQuery}
            className="flex-1 text-goTextPrimaryLight text-base ml-3"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Image
                source={icons.close}
                className="w-5 h-5 ml-2"
                style={{ tintColor: colors.textSecondaryLight }}
              />
            </TouchableOpacity>
          )}
        </View>

        {loading && (
          <ActivityIndicator
            size="large"
            color={colors.primary}
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
              className="p-4 border-b border-goBorderLight"
            >
              <Text className="text-goTextPrimaryLight text-xl">
                {item.address ||
                  item.place_name ||
                  item.display_name ||
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
