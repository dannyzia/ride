import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ReactNativeModal from "react-native-modal";
import { API_URL } from "@/lib/config";
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import Map, { type MapHotspot } from "@/components/Map";
import ThemeToggle from "@/components/ThemeToggle";

interface HotspotRow {
  zone_id: string;
  name: string;
  lat: number;
  lng: number;
  intensity: number;
  multiplier: number;
  demand_count: number;
  supply_count: number;
  updated_at: string;
}

const relativeTime = (d: Date): string => {
  const minutes = Math.floor(Math.max(0, Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
};

export default function HotspotMapScreen() {
  const isDark = useIsDark();
  const [hotspots, setHotspots] = useState<HotspotRow[] | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [themeModalVisible, setThemeModalVisible] = useState(false);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not authenticated");
        return;
      }
      const res = await fetch(`${API_URL}/api/driver/hotspots`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError("Could not load hotspots");
        return;
      }
      const data: { hotspots?: HotspotRow[] } = await res.json();
      const rows = data.hotspots ?? [];
      setHotspots(rows);
      if (rows.length > 0) {
        const latest = rows.reduce((acc, h) =>
          new Date(h.updated_at) > new Date(acc.updated_at) ? h : acc,
        );
        setLastUpdated(new Date(latest.updated_at));
      }
    } catch (e) {
      logger.error("[hotspot-map] load failed", e);
      setError("Could not load hotspots");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const mapHotspots: MapHotspot[] | undefined =
    hotspots && hotspots.length > 0
      ? hotspots.map((h) => ({ lat: h.lat, lng: h.lng, intensity: h.intensity }))
      : undefined;

  const showEmptyState = hotspots !== null && hotspots.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text
          style={[
            styles.headerTitle,
            { color: textPrimary, fontFamily: "Jakarta-Bold" },
          ]}
        >
          Hotspot Map
        </Text>
        <TouchableOpacity
          onPress={() => setThemeModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Toggle theme"
          hitSlop={8}
        >
          <Ionicons
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={22}
            color={textPrimary}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {loading && hotspots === null ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.centerText, { color: textSecondary }]}>
              Loading demand data...
            </Text>
          </View>
        ) : error && hotspots === null ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
            <Text style={[styles.centerText, { color: textSecondary }]}>{error}</Text>
            <TouchableOpacity
              onPress={() => load()}
              accessibilityRole="button"
              accessibilityLabel="Retry"
              style={[styles.refreshBtn, { backgroundColor: surfaceBg, borderColor }]}
            >
              <Ionicons name="refresh" size={16} color={colors.primary} />
              <Text style={[styles.refreshText, { color: colors.primary }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : showEmptyState ? (
          <View style={styles.center}>
            <View
              style={[
                styles.emptyIcon,
                { backgroundColor: isDark ? colors.surfaceElevatedDark : colors.gray100 },
              ]}
            >
              <Ionicons name="map-outline" size={40} color={textSecondary} />
            </View>
            <Text style={[styles.emptyTitle, { color: textPrimary }]}>
              No active hotspots right now
            </Text>
            <Text style={[styles.centerText, { color: textSecondary }]}>
              Demand data updates every few minutes. Check back soon.
            </Text>
            <TouchableOpacity
              onPress={() => load()}
              accessibilityRole="button"
              accessibilityLabel="Refresh"
              style={[styles.refreshBtn, { backgroundColor: surfaceBg, borderColor }]}
            >
              <Ionicons name="refresh" size={16} color={colors.primary} />
              <Text style={[styles.refreshText, { color: colors.primary }]}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.mapWrap}>
            <Map hotspots={mapHotspots} />

            {/* Bottom overlay: last updated + refresh */}
            <View
              style={[styles.overlayCard, { backgroundColor: surfaceBg, borderColor }]}
            >
              <View style={styles.overlayRow}>
                <Text style={[styles.updatedText, { color: textSecondary }]}>
                  {lastUpdated ? `Last updated: ${relativeTime(lastUpdated)}` : "Updating..."}
                </Text>
                <TouchableOpacity
                  onPress={() => load(true)}
                  disabled={refreshing}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh hotspots"
                  style={[styles.refreshBtnSmall, { borderColor }]}
                >
                  {refreshing ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="refresh" size={16} color={colors.primary} />
                  )}
                  <Text style={[styles.refreshText, { color: colors.primary }]}>
                    Refresh
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Legend: green (low) → yellow → red (high) */}
              <View style={styles.legendRow}>
                <View style={[styles.legendBar, { borderColor }]}>
                  <View style={[styles.legendSegment, { backgroundColor: colors.success }]} />
                  <View style={[styles.legendSegment, { backgroundColor: colors.amber }]} />
                  <View style={[styles.legendSegment, { backgroundColor: colors.danger }]} />
                </View>
                <View style={styles.legendLabels}>
                  <Text style={[styles.legendLabel, { color: textSecondary }]}>Low</Text>
                  <Text style={[styles.legendLabel, { color: textSecondary }]}>High</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Appearance toggle */}
      <ReactNativeModal
        isVisible={themeModalVisible}
        onBackdropPress={() => setThemeModalVisible(false)}
        onBackButtonPress={() => setThemeModalVisible(false)}
      >
        <View style={{ width: "91%", alignSelf: "center" }}>
          <ThemeToggle />
        </View>
      </ReactNativeModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    letterSpacing: -0.3,
  },
  body: { flex: 1 },
  mapWrap: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: 12,
  },
  centerText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    textAlign: "center",
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 17,
    textAlign: "center",
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    marginTop: 4,
  },
  refreshBtnSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },
  refreshText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  overlayCard: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 10,
  },
  overlayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  updatedText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  legendRow: { gap: 6 },
  legendBar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: 1,
  },
  legendSegment: { flex: 1 },
  legendLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  legendLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
  },
});
