import { View, Text, Keyboard, Image } from "react-native";
import { useEffect, useRef, useState } from "react";
import { useCustomer, useDriver, useDriverStore, useWSStore } from "@/store";
import { usePathname, useRouter } from "expo-router";
import { colors, spacing } from "@/theme/goRide";
import { Driver } from "@/types/type";
import { useSession } from "@/lib/session";
import {
  useBarikoiMapStyle,
  createBarikoiClient,
} from "@/utils/mapUtils";
import MapLibreGL from "@/utils/maplibreLoader";

// GoRide marker icons
const MARKER_USER = require("@/assets/icons/marker-goride-Marker Navigation.png");
const MARKER_DESTINATION = require("@/assets/icons/marker-goride-Marker Navigation-1.png");

let MapViewLib: any = MapLibreGL.MapView ?? MapLibreGL.default ?? null;
let PointAnnotation: any = MapLibreGL.PointAnnotation ?? null;
let Camera: any = MapLibreGL.Camera ?? null;

type _PlainDriver = Omit<
  Driver,
  | "setUserLocation"
  | "setId"
  | "setProfileImageURL"
  | "setRating"
  | "setFullName"
  | "setRole"
>;

const Map = () => {
  const _router = useRouter();
  const cameraRef = useRef<any>(null);
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

  const { ws: _ws } = useWSStore();

  const path = usePathname();

  const _isDriverUI =
    path === "/find-customer" || path === "/finish-ride" ? true : false;

  const [_loading, _setLoading] = useState<boolean>(false);
  const [_error, _setError] = useState<any>(null);

  const [_driverPickupLatitude, _setDriverPickupLatitude] = useState<number>();
  const [_driverPickupLongitude, _setDriverPickupLongitude] =
    useState<number>();
  const [_rideStatus, _setRideStatus] = useState<string>("Offer");

  const [_offerSentToDriver, _setOfferSentToDriver] = useState(false);
  const [_tripConfirmed, setTripConfirmed] = useState(false);
  const [_tripStarted, _setTripStarted] = useState(false);
  const [_arrived, _setArrived] = useState(false);
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
  const [_rideOfferMap, _setRideOfferMap] = useState<any>();

  const {
    selectedDriverId: _selectedDriverId,
    nearbyDrivers: _nearbyDrivers,
    setSelectedDriverDetails: _setSelectedDriverDetails,
    setNearbyDrivers: _setNearbyDrivers,
    updateDriverLocation: _updateDriverLocation,
    updateSelectedDriverLocation: _updateSelectedDriverLocation,
    selectedDriverDetails: _selectedDriverDetails,
  } = useDriverStore();
  const { userAddress: _userAddress } = useCustomer();

  // Initialize Barikoi client once on mount.
  useEffect(() => {
    createBarikoiClient();
  }, []);

  // Re-center the camera when the user's location arrives asynchronously
  // (e.g. after expo-location resolves). Without this the map stays at the
  // initial centerCoordinate (Dhaka default) even after the real GPS fix lands.
  useEffect(() => {
    if (userLatitude && userLongitude && cameraRef.current) {
      cameraRef.current.flyTo([userLongitude, userLatitude], 1200);
    }
  }, [userLatitude, userLongitude]);

  // WebSocket is managed by the parent screen (home/index.tsx).
  // Map is a display-only component — no WS setup here.

  const _handleRideMatched = (payload: any) => {
    setRideID(payload.rideId);
    setTripConfirmed(true);
    setSelectedDriverRideStatus("Arriving");
  };

  const handleMapInteraction = () => {
    Keyboard.dismiss();
  };

  // No GPS fallback — only render the map when we have real coordinates
  const displayLat = userLatitude;
  const displayLng = userLongitude;

  if (displayLat == null || displayLng == null) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", borderRadius: 16, backgroundColor: colors.gray100 }}>
        <Text className="text-sm text-goTextSecondaryLight">Waiting for GPS...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {MapViewLib ? (
        <MapViewLib
          style={{ width: "100%", height: "100%", borderRadius: 16 }}
          styleURL={mapStyleURL}
          centerCoordinate={[displayLng, displayLat]}
          zoomLevel={userLatitude && userLongitude ? 15 : 13}
          onPress={handleMapInteraction}
        >
          {/* Camera flies to the user's real location once expo-location
              resolves. The MapView's centerCoordinate is only an *initial*
              value on @maplibre/maplibre-react-native; subsequent moves must
              go through the Camera child. */}
          {Camera && (
            <Camera
              ref={cameraRef}
              zoomLevel={15}
              centerCoordinate={[displayLng, displayLat]}
            />
          )}
          {/* User location marker */}
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
          {/* Destination marker */}
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
