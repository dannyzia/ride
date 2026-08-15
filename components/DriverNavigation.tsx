import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import MapLibreGL from "@/utils/maplibreLoader";
import { useBarikoiMapStyle } from "@/utils/mapUtils";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

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

export default function DriverNavigation({ pickupLat, pickupLng, dropoffLat, dropoffLng, rideId: _rideId }: NavigationProps) {
  const [route, setRoute] = useState<RouteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);

  const isDark = useIsDark();
  const mapStyleUrl = useBarikoiMapStyle(isDark);

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

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
    <View className="flex-1" style={{ backgroundColor: isDark ? colors.bgDark : colors.bgLight }}>
      {/* Navigation banner */}
      <View className="px-4 py-3" style={{ backgroundColor: colors.primary }}>
        {route && route.steps[currentStep] ? (
          <Text className="font-JakartaBold text-[16px]" style={{ color: colors.white }}>
            {route.steps[currentStep].instruction}
          </Text>
        ) : loading ? (
          <Text className="font-Jakarta text-[14px]" style={{ color: colors.white }}>
            Loading route...
          </Text>
        ) : (
          <Text className="font-Jakarta text-[14px]" style={{ color: colors.white }}>
            Route loaded. Follow the map.
          </Text>
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
                  <View className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.primary }} />
                </MapLibreGL.PointAnnotation>
                <MapLibreGL.PointAnnotation id="dropoff" coordinate={[dropoffLng, dropoffLat]}>
                  <View className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.danger }} />
                </MapLibreGL.PointAnnotation>
              </>
            )}
          </MapLibreGL.MapView>
        ) : (
          <View className="flex-1 items-center justify-center" style={{ backgroundColor: isDark ? colors.bgDark : colors.bgLight }}>
            <Text className="font-Jakarta" style={{ color: textSecondary }}>Navigation Map</Text>
          </View>
        )}
      </View>

      {/* Bottom controls */}
      <View className="flex-row px-4 py-3 border-t" style={{ backgroundColor: surfaceBg, borderTopColor: borderColor }}>
        <TouchableOpacity className="flex-1 rounded-full py-3 items-center mr-2" style={{ backgroundColor: colors.primary }} onPress={nextStep}>
          <Text className="font-JakartaBold text-[14px]" style={{ color: colors.white }}>Next Step</Text>
        </TouchableOpacity>
        <TouchableOpacity className="flex-1 rounded-full py-3 items-center ml-2 border" style={{ borderColor: borderColor }} onPress={() => router.back()}>
          <Text className="font-JakartaBold text-[14px]" style={{ color: textPrimary }}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}