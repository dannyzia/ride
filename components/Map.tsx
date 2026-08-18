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
let CircleLayer: any = MapLibreGL.CircleLayer ?? null;

export interface MapRoutePoint {
  lat: number;
  lng: number;
}

export interface MapHotspot {
  lat: number;
  lng: number;
  /** 0..1 demand intensity — drives the green→amber→red heat color. */
  intensity: number;
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
  /** Hotspot overlay mode: when `hotspots` is provided (and `origin` is not),
   *  the map renders a demand-heat circle per zone and fits the camera to
   *  their bounding box. Used by the driver hotspot map. */
  hotspots?: MapHotspot[];
}

/** Linear interpolation between two #RRGGBB colors. */
function lerpHex(from: string, to: string, t: number): string {
  const f = [1, 3, 5].map((i) => parseInt(from.slice(i, i + 2), 16));
  const g = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16));
  const ch = f.map((v, i) =>
    Math.round(v + (g[i] - v) * Math.max(0, Math.min(1, t))),
  );
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Heat ramp: green (low) → amber → red (high). */
function heatColor(intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity));
  if (t < 0.5) return lerpHex(colors.success, colors.amber, t * 2);
  return lerpHex(colors.amber, colors.danger, (t - 0.5) * 2);
}

const Map = ({ origin, destination, route, hotspots }: MapProps = {}) => {
  const cameraRef = useRef<any>(null);

  const isDark = useIsDark();
  const mapStyleURL = useBarikoiMapStyle(isDark);

  const isStatic = !!origin || !!hotspots;

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

  // Hotspot mode drives the camera from the zone bounding box, not GPS.
  const hotspotBounds =
    hotspots && hotspots.length >= 1
      ? (() => {
          let minLat = Infinity;
          let maxLat = -Infinity;
          let minLng = Infinity;
          let maxLng = -Infinity;
          for (const h of hotspots) {
            if (h.lat < minLat) minLat = h.lat;
            if (h.lat > maxLat) maxLat = h.lat;
            if (h.lng < minLng) minLng = h.lng;
            if (h.lng > maxLng) maxLng = h.lng;
          }
          return { ne: [maxLng, maxLat], sw: [minLng, minLat] };
        })()
      : null;

  // Route bounding box for camera fit (static snapshot with polyline).
  const routeBounds =
    isStatic && !hotspotBounds && route && route.length >= 2
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

  const bounds = hotspotBounds ?? routeBounds;

  const displayLat =
    origin?.lat ??
    (hotspotBounds ? (hotspotBounds.ne[1] + hotspotBounds.sw[1]) / 2 : userLatitude);
  const displayLng =
    origin?.lng ??
    (hotspotBounds ? (hotspotBounds.ne[0] + hotspotBounds.sw[0]) / 2 : userLongitude);

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

  const centerLng = bounds ? (bounds.ne[0] + bounds.sw[0]) / 2 : displayLng;
  const centerLat = bounds ? (bounds.ne[1] + bounds.sw[1]) / 2 : displayLat;

  // Static mode: markers from props. Live mode: store locations (existing behavior).
  const originMarkerCoord = isStatic && !hotspots
    ? origin
      ? [origin.lng, origin.lat]
      : null
    : userLatitude && userLongitude
      ? [userLongitude, userLatitude]
      : null;
  const destinationMarkerCoord = isStatic && !hotspots
    ? destination
      ? [destination.lng, destination.lat]
      : null
    : destinationLatitude && destinationLongitude
      ? [destinationLongitude, destinationLatitude]
      : null;

  const hotspotFeatures =
    hotspots && hotspots.length >= 1
      ? hotspots.map((h) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [h.lng, h.lat] },
          properties: {
            color: heatColor(h.intensity),
            opacity: 0.35 + 0.45 * h.intensity,
          },
        }))
      : null;

  return (
    <View style={{ flex: 1 }}>
      {MapViewLib ? (
        <MapViewLib
          style={{ width: "100%", height: "100%", borderRadius: 16 }}
          styleURL={mapStyleURL}
          centerCoordinate={[centerLng, centerLat]}
          zoomLevel={bounds ? 12 : 15}
          onPress={handleMapInteraction}
        >
          {Camera && (
            <Camera
              ref={cameraRef}
              {...(bounds
                ? {
                    bounds: {
                      ...bounds,
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
          {hotspotFeatures && hotspotFeatures.length > 0 && ShapeSource && CircleLayer && (
            <ShapeSource
              id="hotspots-source"
              shape={{ type: "FeatureCollection", features: hotspotFeatures }}
            >
              <CircleLayer
                id="hotspots-layer"
                style={{
                  circleColor: ["get", "color"],
                  circleOpacity: ["get", "opacity"],
                  circleRadius: 26,
                  circleBlur: 0.45,
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
