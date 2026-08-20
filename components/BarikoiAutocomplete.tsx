import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BarikoiInputProps } from "@/types/type";
import { useCustomer } from "@/store";
import { getBarikoiAutocompleteUrl } from "@/lib/useBarikoiMapStyle";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface BarikoiPlaceSuggestion {
  latitude?: string;
  longitude?: string;
  lat?: string;
  lng?: string;
  lon?: string;
  address?: string;
  place_name?: string;
  description?: string;
  name?: string;
  place_id?: string;
  id?: string;
}

const BarikoiAutocomplete = ({
  icon,
  containerStyle,
  handlePress,
  initialLocation,
  textInputBackgroundColor: _textInputBackgroundColor,
}: BarikoiInputProps) => {
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<BarikoiPlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { userLatitude, userLongitude } = useCustomer();
  const isDark = useIsDark();

  const bg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const placeholderColor = isDark ? colors.textDisabledDark : colors.textDisabledLight;
  const suggestionBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const suggestionBorder = isDark ? colors.borderDark : colors.borderLight;
  const iconColor = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  useEffect(() => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
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
        setShowSuggestions(true);
      } catch (err) {
        logger.error("Autocomplete fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestions();
  }, [query]);

  const handleSelect = (place: BarikoiPlaceSuggestion) => {
    const lat = parseFloat(String(place.latitude || place.lat || 0));
    const lng = parseFloat(String(place.longitude || place.lng || place.lon || 0));
    const address =
      place.address ||
      place.place_name ||
      place.description ||
      place.name ||
      query;

    handlePress({ latitude: lat, longitude: lng, address });

    const display = address;
    setQuery(display.length > 40 ? display.slice(0, 40) + "..." : display);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className={`z-50 mb-5 ${containerStyle}`}
    >
      <View
        className="flex-row items-center rounded-full px-4 py-3 shadow-sm"
        style={{
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: borderColor,
        }}
      >
        <Ionicons
          name={(icon as any) || "search"}
          size={20}
          color={iconColor}
          style={{ marginRight: 12 }}
        />
        <TextInput
          ref={inputRef}
          placeholder={initialLocation || "Where to?"}
          placeholderTextColor={placeholderColor}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setShowSuggestions(true);
          }}
          className="flex-1 text-base font-Jakarta"
          style={{ color: textPrimary }}
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              setQuery("");
              setSuggestions([]);
              setShowSuggestions(false);
            }}
          >
            <Ionicons name="close-circle" size={20} color={iconColor} />
          </TouchableOpacity>
        )}
      </View>

      {loading && (
        <ActivityIndicator className="mt-3" color={colors.primary} size="small" />
      )}

      {showSuggestions && suggestions.length > 0 && (
        <FlatList
          data={suggestions}
          keyExtractor={(item, idx) => item.place_id || item.id || String(idx)}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handleSelect(item)}
              className="px-4 py-3"
              style={{
                backgroundColor: suggestionBg,
                borderBottomWidth: 1,
                borderBottomColor: suggestionBorder,
              }}
            >
              <Text
                className="text-base font-Jakarta"
                style={{ color: textPrimary }}
              >
                {item.address ||
                  item.place_name ||
                  item.description ||
                  item.name}
              </Text>
            </TouchableOpacity>
          )}
          className="mt-2 max-h-60 rounded-xl"
          style={{
            backgroundColor: suggestionBg,
            borderWidth: 1,
            borderColor: suggestionBorder,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        />
      )}
    </KeyboardAvoidingView>
  );
};

export default BarikoiAutocomplete;