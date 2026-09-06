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
  StatusBar,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { icons } from "@/constants/data";
import { useCustomer } from "@/store";
import { router, useLocalSearchParams } from "expo-router";
import { getBarikoiAutocompleteUrl } from "@/lib/useBarikoiMapStyle";
import { logger } from "@/lib/logger";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

interface PlaceSuggestion {
  place_id?: string | number;
  id?: string | number;
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lng?: number | string;
  lon?: number | string;
  address?: string;
  place_name?: string;
  description?: string;
  name?: string;
  display_name?: string;
}

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
}

const AutocompletePage = () => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const { userLatitude, userLongitude, setUserLocation, setDestinationLocation } = useCustomer();
  const { type, stopIndex } = useLocalSearchParams<{ type?: string; stopIndex?: string }>();
  const locationType = type === "from" ? "from" : type === "stop" ? "stop" : "to";
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const handleLocationPress = (location: {
    latitude: number;
    longitude: number;
    address: string;
  }) => {
    // Import rider store dynamically to avoid circular deps.
    // router.back() must wait for the store update so home screen
    // renders with the correct data on first render.
    import("@/store/useRiderStore").then(({ useRiderStore }) => {
      const store = useRiderStore.getState();

      if (locationType === "from") {
        setUserLocation(location);
        store.setPickup(location.address, location.latitude, location.longitude);
        store.setPickupCoords({ lat: location.latitude, lng: location.longitude });
      } else if (locationType === "stop" && stopIndex != null) {
        const idx = parseInt(stopIndex, 10);
        if (!isNaN(idx)) {
          const next = [...store.stops];
          next[idx] = { lat: location.latitude, lng: location.longitude, address: location.address };
          store.setStops(next);
        }
      } else {
        setDestinationLocation(location);
        store.setDropoffCoords({ lat: location.latitude, lng: location.longitude });
        store.setDropoff(location.address, location.latitude, location.longitude);
      }
      router.back();
    });
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
          const places = nomData.map((item: NominatimItem) => ({
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
  }, [query, userLatitude, userLongitude]);

  const handlePlaceSelect = (place: PlaceSuggestion) => {
    // Barikoi autocomplete already returns lat/lng — no detail fetch needed.
    const lat = parseFloat(String(place.latitude || place.lat || 0));
    const lng = parseFloat(String(place.longitude || place.lng || place.lon || 0));
    const address =
      place.address ||
      place.place_name ||
      place.description ||
      place.name ||
      query;

    handleLocationPress({ latitude: lat, longitude: lng, address });
    setQuery(address);
    setSuggestions([]);
  };

  return (
    <SafeAreaView className="flex-1 px-5" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => router.back()}
        className="flex justify-center items-center w-10 h-10 rounded-full"
        style={{ backgroundColor: surfaceBg }}
      >
        <Image source={icons.backArrow} className="w-5 h-5" />
      </TouchableOpacity>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="mt-10 mb-6 items-center">
          <Text className="text-3xl font-bold text-center" style={{ color: textPrimary }}>
            {t('autocomplete.title')}
          </Text>
        </View>

        <View className="flex-row items-center rounded-full px-4 py-3 mb-5" style={{ backgroundColor: surfaceBg }}>
          <Image
            source={icons.search}
            className="w-6 h-6"
            style={{ tintColor: textSecondary }}
          />
          <TextInput
            autoFocus
            placeholder={locationType === "from" ? t('autocomplete.search_pickup') : locationType === "stop" ? t('autocomplete.search_stop') : t('home.search')}
            placeholderTextColor={textSecondary}
            value={query}
            onChangeText={setQuery}
            className="flex-1 text-base ml-3"
            style={{ color: textPrimary }}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Image
                source={icons.close}
                className="w-5 h-5 ml-2"
                style={{ tintColor: textSecondary }}
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
          keyExtractor={(item, idx) => String(item.place_id || item.id || idx)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 50 }}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handlePlaceSelect(item)}
              className="p-4 border-b"
              style={{ borderBottomColor: borderColor }}
            >
              <Text className="text-xl" style={{ color: textPrimary }}>
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
