import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ReactNativeModal from "react-native-modal";
import { API_URL } from "@/lib/config";
import { relativeTime } from "@/lib/time";
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import Map, { type MapHotspot } from "@/components/Map";
import ThemeToggle from "@/components/ThemeToggle";
import { formatBDT } from "@/lib/format";

interface HotspotRow {
  zone_id: string;
  name: string;
  lat: number;
  lng: number;
  intensity: number;
  intensity_raw?: number;
  multiplier: number;
  demand_count: number;
  supply_count: number;
  updated_at: string;
}

/** Auto-refresh interval (ms) */
const AUTO_REFRESH_MS = 5 * 60 * 1000;

export default function HotspotMapScreen() {
  const isDark = useIsDark();
  const [hotspots, setHotspots] = useState<HotspotRow[] | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [selectedZone, setSelectedZone] = useState<HotspotRow | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

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

  // Initial load + auto-refresh every 5 minutes
  useEffect(() => {
    load();
    autoRefreshRef.current = setInterval(() => load(true), AUTO_REFRESH_MS);
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [load]);

  const mapHotspots: MapHotspot[] | undefined =
    hotspots && hotspots.length > 0
      ? hotspots.map((h) => ({ lat: h.lat, lng: h.lng, intensity: h.intensity }))
      : undefined;

  const showEmptyState = hotspots !== null && hotspots.length === 0;

  // Summary stats
  const totalDemand = hotspots?.reduce((s, h) => s + h.demand_count, 0) ?? 0;
  const totalSupply = hotspots?.reduce((s, h) => s + h.supply_count, 0) ?? 0;
  const maxMultiplier =
    hotspots && hotspots.length > 0
      ? Math.max(...hotspots.map((h) => h.multiplier))
      : 0;

  // Demand level label for intensity
  function demandLabel(intensity: number): string {
    if (intensity < 0.25) return "Low";
    if (intensity < 0.5) return "Moderate";
    if (intensity < 0.75) return "High";
    return "Very High";
  }

  function demandColor(intensity: number): string {
    if (intensity < 0.25) return colors.success;
    if (intensity < 0.5) return colors.amber;
    return colors.danger;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
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
            <Ionicons
              name="alert-circle-outline"
              size={40}
              color={colors.danger}
            />
            <Text style={[styles.centerText, { color: textSecondary }]}>
              {error}
            </Text>
            <TouchableOpacity
              onPress={() => load()}
              accessibilityRole="button"
              accessibilityLabel="Retry"
              style={[
                styles.refreshBtn,
                { backgroundColor: surfaceBg, borderColor },
              ]}
            >
              <Ionicons name="refresh" size={16} color={colors.primary} />
              <Text style={[styles.refreshText, { color: colors.primary }]}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        ) : showEmptyState ? (
          <View style={styles.center}>
            <View
              style={[
                styles.emptyIcon,
                {
                  backgroundColor: isDark
                    ? colors.surfaceElevatedDark
                    : colors.gray100,
                },
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
              style={[
                styles.refreshBtn,
                { backgroundColor: surfaceBg, borderColor },
              ]}
            >
              <Ionicons name="refresh" size={16} color={colors.primary} />
              <Text style={[styles.refreshText, { color: colors.primary }]}>
                Refresh
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.mapWrap}>
            <Map hotspots={mapHotspots} />

            {/* Top stats ribbon */}
            <View
              style={[
                styles.statsRibbon,
                { backgroundColor: surfaceBg, borderColor },
              ]}
            >
              <View style={styles.statItem}>
                <Text
                  style={[styles.statValue, { color: textPrimary }]}
                  numberOfLines={1}
                >
                  {totalDemand}
                </Text>
                <Text style={[styles.statLabel, { color: textSecondary }]}>
                  Demand
                </Text>
              </View>
              <View
                style={[styles.statDivider, { backgroundColor: borderColor }]}
              />
              <View style={styles.statItem}>
                <Text
                  style={[styles.statValue, { color: textPrimary }]}
                  numberOfLines={1}
                >
                  {totalSupply}
                </Text>
                <Text style={[styles.statLabel, { color: textSecondary }]}>
                  Supply
                </Text>
              </View>
              <View
                style={[styles.statDivider, { backgroundColor: borderColor }]}
              />
              <View style={styles.statItem}>
                <Text
                  style={[styles.statValue, { color: colors.primary }]}
                  numberOfLines={1}
                >
                  {maxMultiplier > 0 ? `${maxMultiplier.toFixed(1)}x` : "—"}
                </Text>
                <Text style={[styles.statLabel, { color: textSecondary }]}>
                  Max Surge
                </Text>
              </View>
              <View
                style={[styles.statDivider, { backgroundColor: borderColor }]}
              />
              <View style={styles.statItem}>
                <Text
                  style={[styles.statValue, { color: textPrimary }]}
                  numberOfLines={1}
                >
                  {hotspots?.length ?? 0}
                </Text>
                <Text style={[styles.statLabel, { color: textSecondary }]}>
                  Zones
                </Text>
              </View>
            </View>

            {/* Bottom overlay: updated time + refresh */}
            <View
              style={[
                styles.overlayCard,
                { backgroundColor: surfaceBg, borderColor },
              ]}
            >
              <View style={styles.overlayRow}>
                <Text style={[styles.updatedText, { color: textSecondary }]}>
                  {lastUpdated
                    ? `Updated: ${relativeTime(lastUpdated)}`
                    : "Updating..."}
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

              {/* Legend */}
              <View style={styles.legendRow}>
                <View style={[styles.legendBar, { borderColor }]}>
                  <View
                    style={[
                      styles.legendSegment,
                      { backgroundColor: colors.success },
                    ]}
                  />
                  <View
                    style={[
                      styles.legendSegment,
                      { backgroundColor: colors.amber },
                    ]}
                  />
                  <View
                    style={[
                      styles.legendSegment,
                      { backgroundColor: colors.danger },
                    ]}
                  />
                </View>
                <View style={styles.legendLabels}>
                  <Text style={[styles.legendLabel, { color: textSecondary }]}>
                    Low demand
                  </Text>
                  <Text style={[styles.legendLabel, { color: textSecondary }]}>
                    High demand
                  </Text>
                </View>
              </View>
            </View>

            {/* Zone list: scrollable horizontal strip */}
            {hotspots && hotspots.length > 0 && (
              <View
                style={[
                  styles.zoneStrip,
                  { backgroundColor: surfaceBg, borderColor },
                ]}
              >
                <Text
                  style={[
                    styles.zoneStripTitle,
                    { color: textPrimary },
                  ]}
                >
                  Zones
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {hotspots
                    .slice()
                    .sort((a, b) => b.intensity - a.intensity)
                    .map((zone) => (
                      <TouchableOpacity
                        key={zone.zone_id}
                        style={[
                          styles.zoneChip,
                          {
                            backgroundColor: isDark
                              ? colors.darkSecondary
                              : colors.gray100,
                            borderColor:
                              selectedZone?.zone_id === zone.zone_id
                                ? colors.primary
                                : borderColor,
                            borderWidth:
                              selectedZone?.zone_id === zone.zone_id ? 2 : 1,
                          },
                        ]}
                        onPress={() =>
                          setSelectedZone(
                            selectedZone?.zone_id === zone.zone_id
                              ? null
                              : zone,
                          )
                        }
                      >
                        <View style={styles.zoneChipHeader}>
                          <View
                            style={[
                              styles.zoneDot,
                              { backgroundColor: demandColor(zone.intensity) },
                            ]}
                          />
                          <Text
                            style={[
                              styles.zoneChipName,
                              { color: textPrimary },
                            ]}
                            numberOfLines={1}
                          >
                            {zone.name}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.zoneChipStat,
                            { color: textSecondary },
                          ]}
                        >
                          {demandLabel(zone.intensity)}
                          {zone.multiplier > 1
                            ? ` · ${zone.multiplier.toFixed(1)}x`
                            : ""}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </View>
            )}

            {/* Selected zone detail card */}
            {selectedZone && (
              <View
                style={[
                  styles.zoneDetail,
                  { backgroundColor: surfaceBg, borderColor },
                ]}
              >
                <View style={styles.zoneDetailHeader}>
                  <View
                    style={[
                      styles.zoneDot,
                      {
                        backgroundColor: demandColor(selectedZone.intensity),
                        width: 10,
                        height: 10,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.zoneDetailName,
                      { color: textPrimary },
                    ]}
                  >
                    {selectedZone.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setSelectedZone(null)}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={18} color={textSecondary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.zoneDetailGrid}>
                  <View style={styles.zoneDetailCell}>
                    <Text
                      style={[styles.zoneDetailValue, { color: textPrimary }]}
                    >
                      {selectedZone.demand_count}
                    </Text>
                    <Text
                      style={[styles.zoneDetailLabel, { color: textSecondary }]}
                    >
                      Riders
                    </Text>
                  </View>
                  <View style={styles.zoneDetailCell}>
                    <Text
                      style={[styles.zoneDetailValue, { color: textPrimary }]}
                    >
                      {selectedZone.supply_count}
                    </Text>
                    <Text
                      style={[styles.zoneDetailLabel, { color: textSecondary }]}
                    >
                      Drivers
                    </Text>
                  </View>
                  <View style={styles.zoneDetailCell}>
                    <Text
                      style={[
                        styles.zoneDetailValue,
                        {
                          color:
                            selectedZone.multiplier > 1
                              ? colors.primary
                              : textPrimary,
                        },
                      ]}
                    >
                      {selectedZone.multiplier > 0
                        ? `${selectedZone.multiplier.toFixed(1)}x`
                        : "—"}
                    </Text>
                    <Text
                      style={[styles.zoneDetailLabel, { color: textSecondary }]}
                    >
                      Surge
                    </Text>
                  </View>
                  <View style={styles.zoneDetailCell}>
                    <Text
                      style={[
                        styles.zoneDetailValue,
                        { color: demandColor(selectedZone.intensity) },
                      ]}
                    >
                      {demandLabel(selectedZone.intensity)}
                    </Text>
                    <Text
                      style={[styles.zoneDetailLabel, { color: textSecondary }]}
                    >
                      Level
                    </Text>
                  </View>
                </View>
                {selectedZone.supply_count === 0 &&
                  selectedZone.demand_count > 0 && (
                    <View
                      style={[
                        styles.hotBadge,
                        { backgroundColor: `${colors.danger}15` },
                      ]}
                    >
                      <Ionicons
                        name="flame-outline"
                        size={14}
                        color={colors.danger}
                      />
                      <Text style={[styles.hotBadgeText, { color: colors.danger }]}>
                        No drivers — high earning opportunity!
                      </Text>
                    </View>
                  )}
              </View>
            )}
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
  /* Top stats ribbon */
  statsRibbon: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 10,
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 24,
  },
  /* Bottom overlay */
  overlayCard: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
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
  /* Zone strip */
  zoneStrip: {
    position: "absolute",
    bottom: 110,
    left: spacing.sm,
    right: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  zoneStripTitle: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
    marginBottom: 6,
  },
  zoneChip: {
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    minWidth: 100,
  },
  zoneChipHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  zoneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  zoneChipName: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
    flex: 1,
  },
  zoneChipStat: {
    fontFamily: "Jakarta-Regular",
    fontSize: 10,
    marginTop: 2,
  },
  /* Zone detail card */
  zoneDetail: {
    position: "absolute",
    bottom: 190,
    left: spacing.sm,
    right: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 10,
  },
  zoneDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  zoneDetailName: {
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
    flex: 1,
  },
  zoneDetailGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  zoneDetailCell: {
    alignItems: "center",
  },
  zoneDetailValue: {
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
    letterSpacing: -0.3,
  },
  zoneDetailLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 10,
    marginTop: 2,
  },
  hotBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  hotBadgeText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
});
