import { View, Text, Keyboard, Image, Appearance } from "react-native";
import { useEffect, useRef } from "react";
import { useCustomer } from "@/store";
import { colors, spacing } from "@/theme/goRide";
import { useAppearance } from "@/lib/useAppearance";
import {
  useBarikoiMapStyle,
  createBarikoiClient,
} from "@/utils/mapUtils";
import MapLibreGL from "@/utils/maplibreLoader";

const MARKER_USER = require("@/assets/icons/marker-goride-Marker Navigation.png");
const MARKER_DESTINATION = require("@/assets/icons/marker-goride-Marker Navigation-1.png");

let MapViewLib: any = MapLibreGL.MapView ?? MapLibreGL.default ?? null;
let PointAnnotation: any = MapLibreGL.PointAnnotation ?? null;
let Camera: any = MapLibreGL.Camera ?? null;

const Map = () => {
  const cameraRef = useRef<any>(null);

  const { theme } = useAppearance();
  const isDark =
    theme === "dark" || (theme === "system" && Appearance.getColorScheme() === "dark");
  const mapStyleURL = useBarikoiMapStyle(isDark);

  const {
    userLongitude,
    userLatitude,
    destinationLatitude,
    destinationLongitude,
  } = useCustomer();

  useEffect(() => {
    createBarikoiClient();
  }, []);

  useEffect(() => {
    if (userLatitude && userLongitude && cameraRef.current) {
      cameraRef.current.flyTo([userLongitude, userLatitude], 1200);
    }
  }, [userLatitude, userLongitude]);

  const handleMapInteraction = () => {
    Keyboard.dismiss();
  };

  const displayLat = userLatitude;
  const displayLng = userLongitude;

  if (displayLat == null || displayLng == null) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          borderRadius: 16,
          backgroundColor: isDark ? colors.surfaceElevatedDark : colors.gray100,
        }}
      >
        <Text
          className="text-sm"
          style={{
            color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
          }}
        >
          Waiting for GPS...
        </Text>
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
          {Camera && (
            <Camera
              ref={cameraRef}
              zoomLevel={15}
              centerCoordinate={[displayLng, displayLat]}
            />
          )}
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
            backgroundColor: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
          }}
        >
          <Text
            style={{
              color: isDark ? colors.textPrimaryDark : colors.textPrimaryLight,
              fontSize: 16,
              fontFamily: "Jakarta-SemiBold",
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
                color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
                fontSize: 12,
                fontFamily: "Jakarta-Regular",
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