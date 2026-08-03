import { useState, useEffect, useRef } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import MapLibreGL from "@/utils/maplibreLoader";
import { useBarikoiMapStyle } from "@/utils/mapUtils";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";

interface NavigationProps {
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  rideId: string;
}

interface RouteData {
  geometry: any;
  durationSeconds: number;
  distanceMeters: number;
  steps: { instruction: string; distance: number }[];
}

export default function DriverNavigation({ pickupLat, pickupLng, dropoffLat, dropoffLng, rideId }: NavigationProps) {
  const [route, setRoute] = useState<RouteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const mapStyleUrl = useBarikoiMapStyle(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/navigation/route`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ waypoints: [{ lat: pickupLat, lng: pickupLng }, { lat: dropoffLat, lng: dropoffLng }] }),
        });
        if (res.ok) {
          const data = await res.json();
          setRoute(data.route);
        }
      } catch (e) {
        logger.error("[navigation] route fetch failed", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng]);

  const nextStep = () => {
    if (route && currentStep < route.steps.length - 1) setCurrentStep(currentStep + 1);
  };

  return (
    <View className="flex-1 bg-goBgLight dark:bg-goBgDark">
      {/* Navigation banner */}
      <View className="bg-goPrimary px-4 py-3">
        {route && route.steps[currentStep] ? (
          <Text className="text-goWhite font-JakartaBold text-[16px]">{route.steps[currentStep].instruction}</Text>
        ) : loading ? (
          <Text className="text-goWhite font-Jakarta text-[14px]">Loading route...</Text>
        ) : (
          <Text className="text-goWhite font-Jakarta text-[14px]">Route loaded. Follow the map.</Text>
        )}
      </View>

      {/* Map */}
      <View className="flex-1">
        {MapLibreGL && MapLibreGL.MapView ? (
          <MapLibreGL.MapView style={{ flex: 1 }} styleURL={mapStyleUrl}
            centerCoordinate={[(pickupLng + dropoffLng) / 2, (pickupLat + dropoffLat) / 2]} zoomLevel={13}>
            {route?.geometry && MapLibreGL.ShapeSource && MapLibreGL.LineLayer && (
              <MapLibreGL.ShapeSource id="routeSource" shape={route.geometry}>
                <MapLibreGL.LineLayer id="routeLine" style={{ lineColor: colors.primary, lineWidth: 4, lineCap: "round", lineJoin: "round" }} />
              </MapLibreGL.ShapeSource>
            )}
            {MapLibreGL.PointAnnotation && (
              <>
                <MapLibreGL.PointAnnotation id="pickup" coordinate={[pickupLng, pickupLat]}>
                  <View className="w-3 h-3 rounded-full bg-goAccent" />
                </MapLibreGL.PointAnnotation>
                <MapLibreGL.PointAnnotation id="dropoff" coordinate={[dropoffLng, dropoffLat]}>
                  <View className="w-3 h-3 rounded-full bg-goDanger" />
                </MapLibreGL.PointAnnotation>
              </>
            )}
          </MapLibreGL.MapView>
        ) : (
          <View className="flex-1 items-center justify-center bg-goBgLight dark:bg-goBgDark">
            <Text className="text-goTextSecondaryLight dark:text-goTextSecondaryDark font-Jakarta">Navigation Map</Text>
          </View>
        )}
      </View>

      {/* Bottom controls */}
      <View className="flex-row px-4 py-3 bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border-t border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity className="flex-1 bg-goPrimary rounded-full py-3 items-center mr-2" onPress={nextStep}>
          <Text className="text-goWhite font-JakartaBold text-[14px]">Next Step</Text>
        </TouchableOpacity>
        <TouchableOpacity className="flex-1 border border-goBorderLight dark:border-goBorderDark rounded-full py-3 items-center ml-2" onPress={() => router.back()}>
          <Text className="text-goTextPrimaryLight dark:text-goTextPrimaryDark font-JakartaBold text-[14px]">Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
