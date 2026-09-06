/**
 * Driver hotspot screen (tier-coded list + map).
 *
 * Lists active hotspot zones within 5 km of the driver's current location,
 * tier-coded from the zone_heat tag (hot→high, neutral→medium, cold→low).
 * Tapping a row shows the zone on the shared Map component (same MapLibre
 * library as the existing hotspot-map screen). Data source: the existing
 * GET /api/driver/hotspots endpoint — read-only, advisory; dispatch is
 * untouched.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { haversineKm } from "@/lib/hotspots";
import Map, { type MapHotspot } from "@/components/Map";
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface HotspotRow {
  zone_id: string;
  zone_name: string;
  lat: number;
  lng: number;
  tag: "hot" | "neutral" | "cold";
  score: number;
  idle_driver_count: number;
  suggest_score: number;
}

const WITHIN_KM = 5;
const AUTO_REFRESH_MS = 60_000;

function tierOf(tag: HotspotRow["tag"]): "low" | "medium" | "high" {
  if (tag === "hot") return "high";
  if (tag === "neutral") return "medium";
  return "low";
}

function tierColor(tier: "low" | "medium" | "high"): string {
  if (tier === "high") return colors.danger;
  if (tier === "medium") return colors.amber;
  return colors.success;
}

export default function HotspotScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const [rows, setRows] = useState<HotspotRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<HotspotRow | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const locate = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getLastKnownPositionAsync();
      const fresh = pos ?? (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }));
      if (fresh) setUserLoc({ lat: fresh.coords.latitude, lng: fresh.coords.longitude });
    } catch (e) {
      logger.warn("[hotspot] location unavailable", e);
    }
  }, []);

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
        setError(t("common.error"));
        return;
      }
      const res = await fetch(`${API_URL}/api/driver/hotspots`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError(t("common.error"));
        return;
      }
      const data: { hotspots?: HotspotRow[] } = await res.json();
      setRows(data.hotspots ?? []);
    } catch (e) {
      logger.error("[hotspot] load failed", e);
      setError(t("common.error"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    locate();
    autoRefreshRef.current = setInterval(() => load(true), AUTO_REFRESH_MS);
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [load, locate]);

  const sorted = useMemo(() => {
    if (!rows) return [];
    const withDist = rows.map((r) => ({
      ...r,
      distance_km: userLoc ? haversineKm(userLoc.lat, userLoc.lng, r.lat, r.lng) : null,
    }));
    if (userLoc) {
      return withDist
        .filter((r) => (r.distance_km ?? Infinity) <= WITHIN_KM)
        .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));
    }
    return withDist.sort((a, b) => b.score - a.score);
  }, [rows, userLoc]);

  const mapHotspots: MapHotspot[] | undefined =
    rows && rows.length > 0
      ? rows.map((h) => ({ lat: h.lat, lng: h.lng, intensity: h.suggest_score }))
      : undefined;

  const listEmpty = rows !== null && sorted.length === 0;

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
          accessibilityLabel={t("common.back")}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>
          {t("common.hotspot_title")}
        </Text>
        <TouchableOpacity
          onPress={() => load(true)}
          accessibilityRole="button"
          accessibilityLabel={t("common.retry")}
          hitSlop={8}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="refresh" size={22} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {/* List / Map segmented toggle */}
      <View style={[styles.segmentRow, { borderColor }]}>
        {(["list", "map"] as const).map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.segmentBtn, view === v && styles.segmentBtnActive]}
            onPress={() => setView(v)}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.segmentText,
                { color: view === v ? colors.white : textSecondary },
              ]}
            >
              {v === "list" ? t("common.hotspot_list") : t("common.hotspot_map")}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && rows === null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error && rows === null ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
          <Text style={[styles.centerText, { color: textSecondary }]}>{error}</Text>
          <TouchableOpacity
            onPress={() => load()}
            style={[styles.retryBtn, { backgroundColor: surfaceBg, borderColor }]}
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>
              {t("common.retry")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : listEmpty ? (
        <View style={styles.center}>
          <Ionicons name="map-outline" size={40} color={textSecondary} />
          <Text style={[styles.centerText, { color: textSecondary }]}>
            {t("common.hotspot_no_zone")}
          </Text>
        </View>
      ) : view === "map" ? (
        <View style={styles.mapWrap}>
          <Map hotspots={mapHotspots} />
          {selected && (
            <View style={[styles.selectedCard, { backgroundColor: surfaceBg, borderColor }]}>
              <View
                style={[styles.dot, { backgroundColor: tierColor(tierOf(selected.tag)) }]}
              />
              <Text style={[styles.selectedName, { color: textPrimary }]}>
                {selected.zone_name}
              </Text>
              <TouchableOpacity
                onPress={() => setSelected(null)}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Ionicons name="close" size={18} color={textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.zone_id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={[styles.listMeta, { color: textSecondary }]}>
              {userLoc
                ? t("common.hotspot_within_km", { km: WITHIN_KM })
                : t("common.hotspot_all_zones")}
            </Text>
          }
          renderItem={({ item }) => {
            const tier = tierOf(item.tag);
            return (
              <TouchableOpacity
                style={[
                  styles.row,
                  { backgroundColor: surfaceBg, borderColor },
                  selected?.zone_id === item.zone_id && styles.rowSelected,
                ]}
                onPress={() => {
                  setSelected(item);
                  setView("map");
                }}
                accessibilityRole="button"
                accessibilityLabel={`${item.zone_name} ${tier}`}
              >
                <View
                  style={[styles.dot, { backgroundColor: tierColor(tier) }]}
                />
                <View style={styles.rowMain}>
                  <Text style={[styles.rowName, { color: textPrimary }]}>
                    {item.zone_name}
                  </Text>
                  <Text style={[styles.rowSub, { color: textSecondary }]}>
                    {item.distance_km != null
                      ? t("common.hotspot_km_away", {
                          km: item.distance_km.toFixed(1),
                        })
                      : ""}
                    {item.idle_driver_count > 0
                      ? ` · ${t("common.hotspot_idle_drivers", {
                          count: item.idle_driver_count,
                        })}`
                      : ""}
                  </Text>
                </View>
                <Text style={[styles.rowTier, { color: tierColor(tier) }]}>
                  {t(`common.hotspot_${tier}`)}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
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
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
    letterSpacing: -0.3,
  },
  segmentRow: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: { fontFamily: "Jakarta-SemiBold", fontSize: 13 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: 12,
  },
  centerText: { fontFamily: "Jakarta-Regular", fontSize: 14, textAlign: "center" },
  retryBtn: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  retryText: { fontFamily: "Jakarta-SemiBold", fontSize: 13 },
  listContent: { padding: spacing.lg, gap: 10 },
  listMeta: { fontFamily: "Jakarta-Regular", fontSize: 12, marginBottom: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  rowSelected: { borderWidth: 2, borderColor: colors.primary },
  rowMain: { flex: 1 },
  rowName: { fontFamily: "Jakarta-SemiBold", fontSize: 14 },
  rowSub: { fontFamily: "Jakarta-Regular", fontSize: 12, marginTop: 2 },
  rowTier: { fontFamily: "Jakarta-Bold", fontSize: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  mapWrap: { flex: 1 },
  selectedCard: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  selectedName: { flex: 1, fontFamily: "Jakarta-SemiBold", fontSize: 14 },
});
