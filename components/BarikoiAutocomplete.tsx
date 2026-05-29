import React, { useRef, useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    FlatList,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { BarikoiInputProps } from '@/types/type';
import { icons } from '@/constants/data';
import { useCustomer } from '@/store';
import Constants from 'expo-constants';
import { getBarikoiAutocompleteUrl, getBarikoiPlaceDetailUrl } from '@/lib/useBarikoiMapStyle';
import { logger } from "@/lib/logger";

const _API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL;

const BarikoiAutocomplete = ({
    icon,
    containerStyle,
    handlePress,
    initialLocation,
    textInputBackgroundColor: _textInputBackgroundColor,
}: BarikoiInputProps) => {
    const inputRef = useRef<TextInput>(null);
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const { userLatitude, userLongitude } = useCustomer();

    useEffect(() => {
        if (query.length < 3) {
            setSuggestions([]);
            return;
        }

        const fetchSuggestions = async () => {
            setLoading(true);
            try {
                const url = getBarikoiAutocompleteUrl(query, userLatitude ?? undefined, userLongitude ?? undefined);
                const response = await fetch(url);
                const data = await response.json();
                const places = data.places || data.data || [];
                setSuggestions(places);
                setShowSuggestions(true);
            } catch (err) {
                logger.error('Autocomplete fetch error:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchSuggestions();
    }, [query]);

    const handleSelect = async (place: any) => {
        try {
            const placeId = place.place_id || place.id;
            const response = await fetch(getBarikoiPlaceDetailUrl(placeId));
            const data = await response.json();
            const location = data.location || data.place || data;
            const lat = parseFloat(location.lat || location.latitude || 0);
            const lng = parseFloat(location.lng || location.lon || location.longitude || 0);

            handlePress({
                latitude: lat,
                longitude: lng,
                address: place.address || place.place_name || place.description || place.name || query,
            });

            const display = (place.address || place.place_name || place.description || place.name || query);
            setQuery(display.length > 40 ? display.slice(0, 40) + '...' : display);
            setSuggestions([]);
            setShowSuggestions(false);
        } catch (err) {
            logger.error('Place details fetch error:', err);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className={`z-50 mb-5 ${containerStyle}`}
        >
            <View className="flex-row items-center bg-white rounded-full px-4 py-3 shadow shadow-neutral-300">
                <Image
                    source={icon || icons.search}
                    className="w-5 h-5 mr-3 tint-black"
                    resizeMode="contain"
                />
                <TextInput
                    ref={inputRef}
                    placeholder={initialLocation || 'Where to?'}
                    placeholderTextColor="gray"
                    value={query}
                    onChangeText={(text) => {
                        setQuery(text);
                        setShowSuggestions(true);
                    }}
                    className="flex-1 text-black text-base"
                />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => {
                        setQuery('');
                        setSuggestions([]);
                        setShowSuggestions(false);
                    }}>
                        <Image
                            source={icons.close}
                            className="w-4 h-4 tint-black"
                            resizeMode="contain"
                        />
                    </TouchableOpacity>
                )}
            </View>

            {loading && <ActivityIndicator className="mt-3" color="#666" size="small" />}

            {showSuggestions && suggestions.length > 0 && (
                <FlatList
                    data={suggestions}
                    keyExtractor={(item, idx) => item.place_id || item.id || String(idx)}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            onPress={() => handleSelect(item)}
                            className="bg-white px-4 py-3 border-b border-neutral-200"
                        >
                            <Text className="text-black">{item.address || item.place_name || item.description || item.name}</Text>
                        </TouchableOpacity>
                    )}
                    className="mt-2 max-h-60 rounded-xl bg-white"
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                />
            )}
        </KeyboardAvoidingView>
    );
};

export default BarikoiAutocomplete;
