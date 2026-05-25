import { View, Text, TouchableOpacity, Keyboard, Platform } from 'react-native'
import { useEffect, useRef, useState } from 'react'
import { useCustomer, useDriver, useDriverStore, useRideOfferStore, useWSStore } from '@/store'
import { calculateRegion } from '@/lib/calcRegion'
import { usePathname, useRouter } from 'expo-router'
import { FontAwesome6 } from '@expo/vector-icons';
import { Driver } from '@/types/type'
import Constants from "expo-constants";
import { useUser } from '@/lib/useUser'

// MapLibre dynamic import (native only)
let MapViewLib: any = null;
let PointAnnotation: any = null;
try {
  const ML = require('@maplibre/maplibre-react-native');
  MapViewLib = ML.MapView || ML.default;
  PointAnnotation = ML.PointAnnotation;
} catch (e) {
  // MapLibre not installed or not available
}

type PlainDriver = Omit<Driver, 'setUserLocation' | 'setId' | 'setProfileImageURL' | 'setRating' | 'setFullName' | 'setRole'>;

const WEBSOCKET_API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_WEB_SOCKET_SERVER_URL as string | undefined;

const Map = () => {
  const router = useRouter();
  const [region, setRegion] = useState<any>(undefined);

  const {
    userLongitude,
    userLatitude,
    destinationLatitude,
    destinationLongitude,
    destinationAddress,
  } = useCustomer();

  const { userLatitude: driverLatitude, userLongitude: driverLongitude, userAddress: driverAddress } = useDriver();

  const { user } = useUser();

  const role = user?.publicMetadata?.role;

  const { setWebSocket, ws } = useWSStore();

  const path = usePathname();

  const isDriverUI = (path === '/find-customer' || path === '/finish-ride') ? true : false;

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<any>(null);

  const [driverPickupLatitude, setDriverPickupLatitude] = useState<number>();
  const [driverPickupLongitude, setDriverPickupLongitude] = useState<number>();
  const [driverDropoffLatitude, setDriverDropoffLatitude] = useState<number>();
  const [driverDropoffLongitude, setDriverDropoffLongitude] = useState<number>();
  const [rideStatus, setRideStatus] = useState<string>('Offer');

  const [offerSentToDriver, setOfferSentToDriver] = useState(false);
  const [tripConfirmed, setTripConfirmed] = useState(false);
  const [tripStarted, setTripStarted] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [driverArrived, setDriverArrived] = useState(false);
  const [pickup, setPickup] = useState(false);
  const [dropoff, setDropoff] = useState(false);
  const [rideID, setRideID] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedDriverRideStatus, setSelectedDriverRideStatus] = useState('');
  const [driverDestinationLatitude, setDriverDestinationLatitude] = useState(0);
  const [driverDestinationLongitude, setDriverDestinationLongitude] = useState(0);
  const [driverDestinationAddress, setDriverDestinationAddress] = useState('');
  const [rideOfferMap, setRideOfferMap] = useState<any>();

  const { selectedDriverId, nearbyDrivers, setSelectedDriverDetails, setNearbyDrivers, updateDriverLocation, updateSelectedDriverLocation, selectedDriverDetails } = useDriverStore();
  const { userAddress } = useCustomer();



  // Setting initial Region
  useEffect(() => {
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
                <FontAwesome6 name="location-dot" size={24} color="#E31D1C" />
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
