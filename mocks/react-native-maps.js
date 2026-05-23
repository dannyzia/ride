// mocks/react-native-maps.js — replaced by @maplibre/maplibre-react-native
// Kept for compatibility during transition

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
