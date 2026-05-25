// mocks/react-native-maps.js — replaced by @maplibre/maplibre-react-native
// Web fallback stub kept for metro.config.js alias safety

import React from 'react';
import { View, Text } from 'react-native';

export const Marker = () => <View />;
export const PROVIDER_GOOGLE = null;

const MapView = ({ children }) => (
    <View>
        <Text>Map not available on web</Text>
        {children}
    </View>
);

export default MapView;
