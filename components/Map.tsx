import { View, Text, Keyboard } from 'react-native'
import { useEffect, useState } from 'react'
import { useCustomer, useDriver, useDriverStore, useWSStore } from '@/store'
import { calculateRegion } from '@/lib/calcRegion'
import { usePathname, useRouter } from 'expo-router'
import { colors } from '@/theme/goRide'
import { FontAwesome6 } from '@expo/vector-icons';
import { Driver } from '@/types/type'
import Constants from "expo-constants";
import { useSession } from '@/lib/session'
import { useBarikoiMapStyle, createBarikoiClient } from '@/utils/mapUtils';

// MapLibre dynamic import (native only)
let MapViewLib: any = null;
let PointAnnotation: any = null;
try {
  const ML = require('@maplibre/maplibre-react-native');
  MapViewLib = ML.MapView || ML.default;
  PointAnnotation = ML.PointAnnotation;
} catch (_e) {
  // MapLibre not installed or not available
}

type _PlainDriver = Omit<Driver, 'setUserLocation' | 'setId' | 'setProfileImageURL' | 'setRating' | 'setFullName' | 'setRole'>;

const WEBSOCKET_API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_WEB_SOCKET_SERVER_URL as string | undefined;

const Map = () => {
  const _router = useRouter();
  const [_region, setRegion] = useState<any>(undefined);
  const mapStyleURL = useBarikoiMapStyle(false); // light theme

  const {
    userLongitude,
    userLatitude,
    destinationLatitude,
    destinationLongitude,
    destinationAddress: _destinationAddress,
  } = useCustomer();

  const { userLatitude: _driverLatitude, userLongitude: _driverLongitude, userAddress: _driverAddress } = useDriver();

  const { user } = useSession();

  const _role = user?.publicMetadata?.role;

  const { setWebSocket, ws: _ws } = useWSStore();

  const path = usePathname();

  const _isDriverUI = (path === '/find-customer' || path === '/finish-ride') ? true : false;

  const [_loading, _setLoading] = useState<boolean>(false);
  const [_error, _setError] = useState<any>(null);

  const [_driverPickupLatitude, _setDriverPickupLatitude] = useState<number>();
  const [_driverPickupLongitude, _setDriverPickupLongitude] = useState<number>();
  const [driverDropoffLatitude, _setDriverDropoffLatitude] = useState<number>();
  const [driverDropoffLongitude, _setDriverDropoffLongitude] = useState<number>();
  const [_rideStatus, _setRideStatus] = useState<string>('Offer');

  const [_offerSentToDriver, _setOfferSentToDriver] = useState(false);
  const [_tripConfirmed, setTripConfirmed] = useState(false);
  const [_tripStarted, _setTripStarted] = useState(false);
  const [_arrived, setArrived] = useState(false);
  const [_driverArrived, _setDriverArrived] = useState(false);
  const [_pickup, _setPickup] = useState(false);
  const [_dropoff, _setDropoff] = useState(false);
  const [_rideID, setRideID] = useState('');
  const [_amount, _setAmount] = useState('');
  const [_selectedDriverRideStatus, setSelectedDriverRideStatus] = useState('');
  const [_driverDestinationLatitude, _setDriverDestinationLatitude] = useState(0);
  const [_driverDestinationLongitude, _setDriverDestinationLongitude] = useState(0);
  const [_driverDestinationAddress, _setDriverDestinationAddress] = useState('');
  const [_rideOfferMap, setRideOfferMap] = useState<any>();

  const { selectedDriverId: _selectedDriverId, nearbyDrivers: _nearbyDrivers, setSelectedDriverDetails: _setSelectedDriverDetails, setNearbyDrivers: _setNearbyDrivers, updateDriverLocation: _updateDriverLocation, updateSelectedDriverLocation, selectedDriverDetails: _selectedDriverDetails } = useDriverStore();
  const { userAddress: _userAddress } = useCustomer();



  // Setting initial Region
  useEffect(() => {
    createBarikoiClient();
    if (userLatitude && userLongitude) {
      const initialRegion = calculateRegion({
        userLatitude,
        userLongitude,
        destinationLatitude: destinationLatitude || driverDropoffLatitude,
        destinationLongitude: destinationLongitude || driverDropoffLongitude,
      });
      setRegion(initialRegion);
    }
  }, [userLatitude, userLongitude, destinationLatitude, destinationLongitude, driverDropoffLatitude, driverDropoffLongitude]);

  // Update Region when destination Changes
  useEffect(() => {
    if (destinationLatitude && destinationLongitude) {
      const newRegion = calculateRegion({
        userLatitude: userLatitude!,
        userLongitude: userLongitude!,
        destinationLatitude,
        destinationLongitude,
      });
      setRegion(newRegion);
    }
  }, [destinationLatitude, destinationLongitude]);

  // WebSocket connection setup
  useEffect(() => {
    if (!WEBSOCKET_API_URL) return;
    const socket = new WebSocket(WEBSOCKET_API_URL);
    setWebSocket(socket);

    socket.onopen = () => { };
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWSMessage(msg);
      } catch { }
    };
    socket.onerror = () => { };
    socket.onclose = () => { };

    return () => { socket.close(); };
  }, []);

  const handleWSMessage = (msg: any) => {
    switch (msg.type) {
      case 'offer:new':
        setRideOfferMap(msg.payload);
        break;
      case 'ride:matched':
        handleRideMatched(msg.payload);
        break;
      case 'driver:arrived':
        setArrived(true);
        break;
      case 'driver:location':
        if (msg.payload?.driverId) updateSelectedDriverLocation(msg.payload.latitude, msg.payload.longitude, msg.payload.driverId);
        break;

    }
  };

  const handleRideMatched = (payload: any) => {
    setRideID(payload.rideId);
    setTripConfirmed(true);
    setSelectedDriverRideStatus('Arriving');
  };

  const handleMapInteraction = () => {
    Keyboard.dismiss();
  };

  return (
    <View className='flex-1'>
      {MapViewLib && userLatitude && userLongitude ? (
        <MapViewLib
          style={{ width: '100%', height: '100%', borderRadius: 16 }}
          styleURL={mapStyleURL}
          centerCoordinate={[userLongitude, userLatitude]}
          zoomLevel={14}
          onPress={handleMapInteraction}
        >
          {userLatitude && userLongitude && (
            <PointAnnotation
              id="user-location"
              coordinate={[userLongitude, userLatitude]}
            >
              <View className="w-6 h-6 rounded-full bg-primary-500 border-2 border-white" />
            </PointAnnotation>
          )}
          {destinationLatitude && destinationLongitude && (
            <PointAnnotation
              id="destination"
              coordinate={[destinationLongitude, destinationLatitude]}
            >
              <View className="w-8 h-8 items-center justify-center">
                <FontAwesome6 name="location-dot" size={24} color={colors.danger} />
              </View>
            </PointAnnotation>
          )}
        </MapViewLib>
      ) : (
        <View className='flex-1 bg-neutral-900 items-center justify-center'>
          <Text className='text-white text-lg font-JakartaBold mb-2'>
            {userLatitude && userLongitude
              ? `${userLatitude.toFixed(4)}, ${userLongitude.toFixed(4)}`
              : 'Map'}
          </Text>
          {destinationLatitude && destinationLongitude && (
            <Text className='text-neutral-400 text-xs'>
              → {destinationLatitude.toFixed(4)}, {destinationLongitude.toFixed(4)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

export default Map;
