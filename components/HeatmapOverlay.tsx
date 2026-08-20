import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { colors } from "@/theme/goRide";

export interface HeatSpot {
  lat: number;
  lng: number;
  /** 0..1 demand intensity — drives size, opacity and the heat color. */
  intensity: number;
}

export interface HeatBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface HeatmapOverlayProps {
  hotspots: HeatSpot[];
  bounds: HeatBounds;
  width: number;
  height: number;
  onPress?: (index: number) => void;
}

/** Linear interpolation between two #RRGGBB colors. Mirrors Map.tsx. */
function lerpHex(from: string, to: string, t: number): string {
  const f = [1, 3, 5].map((i) => parseInt(from.slice(i, i + 2), 16));
  const g = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16));
  const ch = f.map((v, i) =>
    Math.round(v + (g[i] - v) * Math.max(0, Math.min(1, t))),
  );
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Heat ramp: green (low) → amber → red (high). Mirrors Map.tsx. */
function heatColor(intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity));
  if (t < 0.5) return lerpHex(colors.success, colors.amber, t * 2);
  return lerpHex(colors.amber, colors.danger, (t - 0.5) * 2);
}

/** §8.2 demand heatmap overlay. Transparent layer of translucent heat circles
 * projected from lat/lng bounds onto any container — no map lib required. */
const HeatmapOverlay = ({ hotspots, bounds, width, height, onPress }: HeatmapOverlayProps) => {
  const lngSpan = bounds.maxLng - bounds.minLng;
  const latSpan = bounds.maxLat - bounds.minLat;

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { width, height }]}>
      {hotspots.map((spot, index) => {
        const intensity = Math.max(0, Math.min(1, spot.intensity));
        const diameter = 20 + intensity * 30;
        const centerLeft = lngSpan > 0 ? ((spot.lng - bounds.minLng) / lngSpan) * width : width / 2;
        const centerTop = latSpan > 0 ? ((bounds.maxLat - spot.lat) / latSpan) * height : height / 2;
        const hitSlop = Math.max(0, Math.ceil((64 - diameter) / 2));
        return (
          <TouchableOpacity
            key={`${spot.lat},${spot.lng},${index}`}
            accessibilityRole="button"
            accessibilityLabel={`Hotspot ${index + 1}`}
            disabled={!onPress}
            hitSlop={hitSlop}
            onPress={() => onPress?.(index)}
            style={{
              position: "absolute",
              left: centerLeft - diameter / 2,
              top: centerTop - diameter / 2,
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
              backgroundColor: heatColor(intensity),
              opacity: 0.35 + 0.45 * intensity,
            }}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
  },
});

export default HeatmapOverlay;
