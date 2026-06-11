import { View, Text, Keyboard, Image } from "react-native";
import { useEffect, useState } from "react";
import { useCustomer, useDriver, useDriverStore, useWSStore } from "@/store";
import { calculateRegion } from "@/lib/calcRegion";
import { usePathname, useRouter } from "expo-router";
import { colors, spacing } from "@/theme/goRide";
import { Driver } from "@/types/type";
import Constants from "expo-constants";
import { useSession } from "@/lib/session";
import { useBarikoiMapStyle, createBarikoiClient } from "@/utils/mapUtils";
import MapLibreGL from "@/utils/maplibreLoader";

// GoRide marker icons
const MARKER_USER = require("@/assets/icons/marker-goride-Marker Navigation.png");
const MARKER_DESTINATION = require("@/assets/icons/marker-goride-Marker Navigation-1.png");
const _MARKER_DRIVER = require("@/assets/icons/marker-goride-Marker Navigation-2.png");

let MapViewLib: any = MapLibreGL.MapView ?? MapLibreGL.default ?? null;
let PointAnnotation: any = MapLibreGL.PointAnnotation ?? null;

type _PlainDriver = Omit<
  Driver,
  | "setUserLocation"
  | "setId"
  | "setProfileImageURL"
  | "setRating"
  | "setFullName"
  | "setRole"
>;

const WEBSOCKET_API_URL = Constants.expoConfig?.extra
  ?.EXPO_PUBLIC_WEB_SOCKET_SERVER_URL as string | undefined;

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

  const {
    userLatitude: _driverLatitude,
    userLongitude: _driverLongitude,
    userAddress: _driverAddress,
  } = useDriver();

  const { user } = useSession();

  const _role = user?.publicMetadata?.role;

  const { setWebSocket, ws: _ws } = useWSStore();

  const path = usePathname();

  const _isDriverUI =
    path === "/find-customer" || path === "/finish-ride" ? true : false;

  const [_loading, _setLoading] = useState<boolean>(false);
  const [_error, _setError] = useState<any>(null);

  const [_driverPickupLatitude, _setDriverPickupLatitude] = useState<number>();
  const [_driverPickupLongitude, _setDriverPickupLongitude] =
    useState<number>();
  const [driverDropoffLatitude, _setDriverDropoffLatitude] = useState<number>();
  const [driverDropoffLongitude, _setDriverDropoffLongitude] =
    useState<number>();
  const [_rideStatus, _setRideStatus] = useState<string>("Offer");

  const [_offerSentToDriver, _setOfferSentToDriver] = useState(false);
  const [_tripConfirmed, setTripConfirmed] = useState(false);
  const [_tripStarted, _setTripStarted] = useState(false);
  const [_arrived, setArrived] = useState(false);
  const [_driverArrived, _setDriverArrived] = useState(false);
  const [_pickup, _setPickup] = useState(false);
  const [_dropoff, _setDropoff] = useState(false);
  const [_rideID, setRideID] = useState("");
  const [_amount, _setAmount] = useState("");
  const [_selectedDriverRideStatus, setSelectedDriverRideStatus] = useState("");
  const [_driverDestinationLatitude, _setDriverDestinationLatitude] =
    useState(0);
  const [_driverDestinationLongitude, _setDriverDestinationLongitude] =
    useState(0);
  const [_driverDestinationAddress, _setDriverDestinationAddress] =
    useState("");
  const [_rideOfferMap, setRideOfferMap] = useState<any>();

  const {
    selectedDriverId: _selectedDriverId,
    nearbyDrivers: _nearbyDrivers,
    setSelectedDriverDetails: _setSelectedDriverDetails,
    setNearbyDrivers: _setNearbyDrivers,
    updateDriverLocation: _updateDriverLocation,
    updateSelectedDriverLocation,
    selectedDriverDetails: _selectedDriverDetails,
  } = useDriverStore();
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
  }, [
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
    driverDropoffLatitude,
    driverDropoffLongitude,
  ]);

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

    socket.onopen = () => {};
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWSMessage(msg);
      } catch {}
    };
    socket.onerror = () => {};
    socket.onclose = () => {};

    return () => {
      socket.close();
    };
  }, []);

  const handleWSMessage = (msg: any) => {
    switch (msg.type) {
      case "offer:new":
        setRideOfferMap(msg.payload);
        break;
      case "ride:matched":
        handleRideMatched(msg.payload);
        break;
      case "driver:arrived":
        setArrived(true);
        break;
      case "driver:location":
        if (msg.payload?.driverId)
          updateSelectedDriverLocation(
            msg.payload.latitude,
            msg.payload.longitude,
            msg.payload.driverId,
          );
        break;
    }
  };

  const handleRideMatched = (payload: any) => {
    setRideID(payload.rideId);
    setTripConfirmed(true);
    setSelectedDriverRideStatus("Arriving");
  };

  const handleMapInteraction = () => {
    Keyboard.dismiss();
  };

  return (
    <View style={{ flex: 1 }}>
      {MapViewLib && userLatitude && userLongitude ? (
        <MapViewLib
          style={{ width: "100%", height: "100%", borderRadius: 16 }}
          styleURL={mapStyleURL}
          centerCoordinate={[userLongitude, userLatitude]}
          zoomLevel={14}
          onPress={handleMapInteraction}
        >
          {/* User location marker — GoRide Navigation marker */}
          {userLatitude && userLongitude && (
            <PointAnnotation
              id="user-location"
              coordinate={[userLongitude, userLatitude]}
            >
              <Image
                source={MARKER_USER}
                style={{ width: 36, height: 36 }}
                resizeMode="contain"
              />
            </PointAnnotation>
          )}
          {/* Destination marker — GoRide Navigation-1 */}
          {destinationLatitude && destinationLongitude && (
            <PointAnnotation
              id="destination"
              coordinate={[destinationLongitude, destinationLatitude]}
            >
              <Image
                source={MARKER_DESTINATION}
                style={{ width: 36, height: 36 }}
                resizeMode="contain"
              />
            </PointAnnotation>
          )}
        </MapViewLib>
      ) : (
        <View
          style={{
            flex: 1,
            backgroundColor: colors.surfaceElevatedDark,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
          }}
        >
          <Text
            style={{
              color: colors.textPrimaryDark,
              fontSize: 16,
              fontFamily: "Urbanist",
              fontWeight: "600",
              marginBottom: spacing.xs,
            }}
          >
            {userLatitude && userLongitude
              ? `${userLatitude.toFixed(4)}, ${userLongitude.toFixed(4)}`
              : "Map"}
          </Text>
          {destinationLatitude && destinationLongitude && (
            <Text
              style={{
                color: colors.textSecondaryDark,
                fontSize: 12,
                fontFamily: "Urbanist",
              }}
            >
              → {destinationLatitude.toFixed(4)},{" "}
              {destinationLongitude.toFixed(4)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

export default Map;
