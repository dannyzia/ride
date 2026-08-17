import { View, Text, Keyboard, Image } from "react-native";
import { useEffect, useRef } from "react";
import { useCustomer } from "@/store";
import { colors, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
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
let ShapeSource: any = MapLibreGL.ShapeSource ?? null;
let LineLayer: any = MapLibreGL.LineLayer ?? null;

export interface MapRoutePoint {
  lat: number;
  lng: number;
}

interface MapProps {
  /** Static snapshot mode: when `origin` is provided, the map renders
   *  origin/destination markers (+ optional route line) instead of the live
   *  user-location map. Used by read-only screens (ride detail). */
  origin?: MapRoutePoint;
  destination?: MapRoutePoint;
  /** Decoded route polyline ([lat, lng] pairs) — drawn as a primary-color
   *  line via ShapeSource + LineLayer, and used to fit the camera. */
  route?: [number, number][];
}

const Map = ({ origin, destination, route }: MapProps = {}) => {
  const cameraRef = useRef<any>(null);

  const isDark = useIsDark();
  const mapStyleURL = useBarikoiMapStyle(isDark);

  const isStatic = !!origin;

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
    if (!isStatic && userLatitude && userLongitude && cameraRef.current) {
      cameraRef.current.flyTo([userLongitude, userLatitude], 1200);
    }
  }, [isStatic, userLatitude, userLongitude]);

  const handleMapInteraction = () => {
    Keyboard.dismiss();
  };

  const displayLat = origin?.lat ?? userLatitude;
  const displayLng = origin?.lng ?? userLongitude;

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

  // Route bounding box for camera fit (static snapshot with polyline).
  const routeBounds =
    isStatic && route && route.length >= 2
      ? (() => {
          let minLat = Infinity;
          let maxLat = -Infinity;
          let minLng = Infinity;
          let maxLng = -Infinity;
          for (const [lat, lng] of route) {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
          }
          return { ne: [maxLng, maxLat], sw: [minLng, minLat] };
        })()
      : null;

  const centerLng = routeBounds
    ? (routeBounds.ne[0] + routeBounds.sw[0]) / 2
    : displayLng;
  const centerLat = routeBounds
    ? (routeBounds.ne[1] + routeBounds.sw[1]) / 2
    : displayLat;

  // Static mode: markers from props. Live mode: store locations (existing behavior).
  const originMarkerCoord = isStatic
    ? [origin.lng, origin.lat]
    : userLatitude && userLongitude
      ? [userLongitude, userLatitude]
      : null;
  const destinationMarkerCoord = isStatic
    ? destination
      ? [destination.lng, destination.lat]
      : null
    : destinationLatitude && destinationLongitude
      ? [destinationLongitude, destinationLatitude]
      : null;

  return (
    <View style={{ flex: 1 }}>
      {MapViewLib ? (
        <MapViewLib
          style={{ width: "100%", height: "100%", borderRadius: 16 }}
          styleURL={mapStyleURL}
          centerCoordinate={[centerLng, centerLat]}
          zoomLevel={routeBounds ? 12 : 15}
          onPress={handleMapInteraction}
        >
          {Camera && (
            <Camera
              ref={cameraRef}
              {...(routeBounds
                ? {
                    bounds: {
                      ...routeBounds,
                      paddingLeft: 28,
                      paddingRight: 28,
                      paddingTop: 28,
                      paddingBottom: 28,
                    },
                    animationDuration: 500,
                  }
                : { zoomLevel: 15, centerCoordinate: [centerLng, centerLat] })}
            />
          )}
          {originMarkerCoord && (
            <PointAnnotation
              id={isStatic ? "origin" : "user-location"}
              coordinate={originMarkerCoord}
            >
              <Image
                source={MARKER_USER}
                style={{ width: 36, height: 36 }}
                resizeMode="contain"
              />
            </PointAnnotation>
          )}
          {route && route.length >= 2 && ShapeSource && LineLayer && (
            <ShapeSource
              id="route-source"
              shape={{
                type: "LineString",
                coordinates: route.map(([lat, lng]) => [lng, lat]),
              }}
            >
              <LineLayer
                id="route-line"
                style={{
                  lineColor: colors.primary,
                  lineWidth: 4,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </ShapeSource>
          )}
          {destinationMarkerCoord && (
            <PointAnnotation
              id="destination"
              coordinate={destinationMarkerCoord}
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
            {`${displayLat.toFixed(4)}, ${displayLng.toFixed(4)}`}
          </Text>
          {destinationMarkerCoord && (
            <Text
              style={{
                color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
                fontSize: 12,
                fontFamily: "Jakarta-Regular",
              }}
            >
              → {destinationMarkerCoord[1].toFixed(4)},{" "}
              {destinationMarkerCoord[0].toFixed(4)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

export default Map;
