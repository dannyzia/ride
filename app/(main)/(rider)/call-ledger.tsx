import { colors, spacing, radii } from "@/theme/goRide";
import { API_URL } from "@/lib/config";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ReactNativeModal from "react-native-modal";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useCallLedgerStore } from "@/store/useCallLedgerStore";

// ── Types ──────────────────────────────────────────────────────────────────

interface LedgerEntry {
  id: string;
  event_type: string;
  delta: number;
  balance_after: number;
  reason: string;
  ride_id: string | null;
  created_at: string;
}

interface MissedOffer {
  id: string;
  ride_id: string | null;
  batch_index: number;
  sent_at: string;
  outcome: string;
  rejection_reason: string | null;
  filtered_reason: string | null;
  vehicle_type: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  distance_km: number | null;
}

interface MissedSummary {
  accepted: number;
  expired: number;
  refunded: number;
  filtered: number;
  filtered_by_min_rate: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const OUTCOME_OPTIONS = [
  { key: "all", label: "All" },
  { key: "accepted", label: "Accepted" },
  { key: "expired", label: "Ignored" },
  { key: "refunded", label: "Refunded" },
  { key: "filtered", label: "Filtered" },
] as const;

const VEHICLE_TYPE_OPTIONS = [
  { key: "all", label: "All Types" },
  { key: "bike_basic", label: "Bike Basic" },
  { key: "bike_standard", label: "Bike Standard" },
  { key: "bike_plus", label: "Bike Plus" },
  { key: "cng", label: "CNG" },
  { key: "car_compact", label: "Car Compact" },
  { key: "car_economy", label: "Car Economy" },
  { key: "car_comfort", label: "Car Comfort" },
  { key: "car_premium", label: "Car Premium" },
  { key: "car_xl", label: "Car XL" },
] as const;

const DATE_RANGE_OPTIONS = [
  { key: "7d", label: "This Week", days: 7 },
  { key: "30d", label: "This Month", days: 30 },
  { key: "all", label: "All Time", days: 0 },
] as const;

const EVENT_CONFIG: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  deduction: {
    label: "Ride Deduction",
    icon: "remove-circle-outline",
    color: colors.danger,
  },
  // Phase D (§6): new deduction rows are lead debits written at offer time
  // with reason='offer_sent' — labeled distinctly from legacy per-open
  // deduction rows via the reason-aware override in renderLedgerItem.
  credit: { label: "Credit Added", icon: "add-circle-outline", color: colors.primary },
  initial_load: {
    label: "Subscription Activated",
    icon: "arrow-down",
    color: colors.primary,
  },
  expiry_writeoff: {
    label: "Expired Credits",
    icon: "time-outline",
    color: colors.grayMedium,
  },
  pro_rata_credit: {
    label: "Pro-rata Compensation",
    icon: "gift-outline",
    color: colors.adminAccent,
  },
};

const OUTCOME_CONFIG = (
  textSecondary: string,
): Record<string, { label: string; color: string }> => ({
  accepted: { label: "Accepted", color: colors.primary },
  expired: { label: "No Response", color: colors.amber },
  refunded: { label: "Refunded", color: colors.info },
  filtered: { label: "Rate Filtered", color: colors.grayMedium },
  delivered: { label: "Pending", color: textSecondary },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const datePart = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (d.toDateString() === today.toDateString()) return `Today, ${datePart}`;
  if (d.toDateString() === yesterday.toDateString())
    return `Yesterday, ${datePart}`;
  return datePart;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

// ── Component ───────────────────────────────────────────────────────────────

type TabKey = "ledger" | "missed";

export default function CallLedgerScreen() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  // Live balance: prefer the store (updated by lead:billed pushes and every
  // fetch) over the one-shot fetch-local copy.
  const liveBalance = useCallLedgerStore((s) => s.balanceCalls);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;
  const textDisabled = isDark
    ? colors.textDisabledDark
    : colors.textDisabledLight;

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>("missed");

  // Ledger state
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerRefreshing, setLedgerRefreshing] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  // Missed requests state
  const [missedOffers, setMissedOffers] = useState<MissedOffer[]>([]);
  const [missedSummary, setMissedSummary] = useState<MissedSummary | null>(
    null,
  );
  const [missedLoading, setMissedLoading] = useState(true);
  const [missedRefreshing, setMissedRefreshing] = useState(false);
  const [, setMissedHasMore] = useState(false);

  // Filters
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState("all");
  const [dateRangeFilter, setDateRangeFilter] = useState("7d");
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  // ── Fetch Ledger ──────────────────────────────────────────────────────────

  const fetchLedger = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setLedgerRefreshing(true);
      else setLedgerLoading(true);
      try {
        const params = new URLSearchParams();
        const rangeOpt = DATE_RANGE_OPTIONS.find(
          (r) => r.key === dateRangeFilter,
        );
        if (rangeOpt && rangeOpt.days > 0) {
          const fromDate = new Date(
            Date.now() - rangeOpt.days * 86400_000,
          ).toISOString();
          params.set("from_date", fromDate);
        }
        const res = await fetch(
          `${API_URL}/api/driver/call-ledger?${params.toString()}`,
        );
        if (res.ok) {
          const data = await res.json();
          setEntries(data.entries ?? []);
          setBalance(data.current_balance ?? null);
          // Keep the shared store in sync so lead:billed pushes and fetches
          // agree on one authoritative balance.
          useCallLedgerStore
            .getState()
            .setBalanceCalls(data.current_balance ?? null);
        }
      } catch {
        // silently fail
      } finally {
        setLedgerLoading(false);
        setLedgerRefreshing(false);
      }
    },
    [dateRangeFilter],
  );

  // ── Fetch Missed Requests ─────────────────────────────────────────────────

  const fetchMissed = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setMissedRefreshing(true);
      else setMissedLoading(true);
      try {
        const params = new URLSearchParams();
        if (outcomeFilter !== "all") params.set("outcome", outcomeFilter);
        if (vehicleTypeFilter !== "all")
          params.set("vehicle_type", vehicleTypeFilter);
        const rangeOpt = DATE_RANGE_OPTIONS.find(
          (r) => r.key === dateRangeFilter,
        );
        if (rangeOpt && rangeOpt.days > 0) {
          const fromDate = new Date(
            Date.now() - rangeOpt.days * 86400_000,
          ).toISOString();
          params.set("from_date", fromDate);
        }
        params.set("limit", "50");

        const res = await fetch(
          `${API_URL}/api/driver/missed-requests?${params.toString()}`,
        );
        if (res.ok) {
          const data = await res.json();
          setMissedOffers(data.offers ?? []);
          setMissedSummary(data.summary ?? null);
          setMissedHasMore(data.pagination?.has_more ?? false);
        }
      } catch {
        // silently fail
      } finally {
        setMissedLoading(false);
        setMissedRefreshing(false);
      }
    },
    [outcomeFilter, vehicleTypeFilter, dateRangeFilter],
  );

  // Initial fetch
  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);
  useEffect(() => {
    fetchMissed();
  }, [fetchMissed]);

  // ── Grouped ledger entries ────────────────────────────────────────────────

  const groupedEntries = useMemo(() => {
    const groups: Record<string, LedgerEntry[]> = {};
    for (const entry of entries) {
      const dk = new Date(entry.created_at).toDateString();
      if (!groups[dk]) groups[dk] = [];
      groups[dk].push(entry);
    }
    return Object.entries(groups).map(([_dk, ents]) => ({
      date: formatDate(ents[0].created_at),
      entries: ents.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    }));
  }, [entries]);

  const onLedgerRefresh = useCallback(() => fetchLedger(true), [fetchLedger]);
  const onMissedRefresh = useCallback(() => fetchMissed(true), [fetchMissed]);

  // ── Filter chip helper ────────────────────────────────────────────────────

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (outcomeFilter !== "all") count++;
    if (vehicleTypeFilter !== "all") count++;
    if (dateRangeFilter !== "7d") count++;
    return count;
  }, [outcomeFilter, vehicleTypeFilter, dateRangeFilter]);

  // ── Render: Summary Card ─────────────────────────────────────────────────

  const renderSummaryCard = () => {
    if (!missedSummary) return null;
    const s = missedSummary;
    return (
      <View style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }}>
        <View
          style={{
            backgroundColor: colors.primary,
            borderRadius: radii.xl,
            padding: spacing.lg,
          }}
        >
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontWeight: "700",
              fontSize: 15,
              color: colors.white,
              marginBottom: spacing.sm,
            }}
          >
            This Week
          </Text>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontWeight: "700",
                  fontSize: 22,
                  color: colors.white,
                }}
              >
                {s.accepted}
              </Text>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                Accepted
              </Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontWeight: "700",
                  fontSize: 22,
                  color: colors.white,
                }}
              >
                {s.expired}
              </Text>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                Missed
              </Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontWeight: "700",
                  fontSize: 22,
                  color: colors.white,
                }}
              >
                {s.filtered_by_min_rate}
              </Text>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                Filtered
              </Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontWeight: "700",
                  fontSize: 22,
                  color: colors.white,
                }}
              >
                {s.refunded}
              </Text>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                Refunded
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // ── Render: Filter Button ─────────────────────────────────────────────────

  const renderFilterBar = () => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        gap: spacing.sm,
      }}
    >
      <TouchableOpacity
        onPress={() => setShowFilterSheet(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radii.pill,
          borderWidth: 1,
          borderColor:
            activeFilterCount > 0 ? colors.primary : borderColor,
          backgroundColor:
            activeFilterCount > 0
              ? isDark
                ? colors.primaryLightDark
                : colors.primaryLight
              : surfaceBg,
        }}
      >
        <Ionicons
          name="options-outline"
          size={16}
          color={activeFilterCount > 0 ? colors.primary : textSecondary}
        />
        <Text
          style={{
            fontFamily: "Jakarta-SemiBold",
            fontSize: 13,
            fontWeight: "600",
            color: activeFilterCount > 0 ? colors.primary : textSecondary,
            marginLeft: 4,
          }}
        >
          Filters
        </Text>
        {activeFilterCount > 0 && (
          <View
            style={{
              marginLeft: 4,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 10,
                fontWeight: "700",
                color: colors.white,
              }}
            >
              {activeFilterCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Quick filter chips */}
      {outcomeFilter !== "all" && (
        <TouchableOpacity
          onPress={() => {
            setOutcomeFilter("all");
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing.sm,
            paddingVertical: 4,
            borderRadius: radii.pill,
            backgroundColor: isDark
              ? colors.primaryLightDark
              : colors.primaryLight,
          }}
        >
          <Text
            style={{
              fontFamily: "Jakarta-SemiBold",
              fontSize: 11,
              color: colors.primary,
              fontWeight: "600",
            }}
          >
            {OUTCOME_OPTIONS.find((o) => o.key === outcomeFilter)?.label}
          </Text>
          <Ionicons
            name="close"
            size={12}
            color={colors.primary}
            style={{ marginLeft: 2 }}
          />
        </TouchableOpacity>
      )}
      {vehicleTypeFilter !== "all" && (
        <TouchableOpacity
          onPress={() => {
            setVehicleTypeFilter("all");
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing.sm,
            paddingVertical: 4,
            borderRadius: radii.pill,
            backgroundColor: isDark
              ? colors.primaryLightDark
              : colors.primaryLight,
          }}
        >
          <Text
            style={{
              fontFamily: "Jakarta-SemiBold",
              fontSize: 11,
              color: colors.primary,
              fontWeight: "600",
            }}
          >
            {
              VEHICLE_TYPE_OPTIONS.find((v) => v.key === vehicleTypeFilter)
                ?.label
            }
          </Text>
          <Ionicons
            name="close"
            size={12}
            color={colors.primary}
            style={{ marginLeft: 2 }}
          />
        </TouchableOpacity>
      )}
    </View>
  );

  // ── Render: Filter Sheet ─────────────────────────────────────────────────

  const renderFilterSheet = () => (
    <ReactNativeModal
      isVisible={showFilterSheet}
      onBackdropPress={() => setShowFilterSheet(false)}
      onSwipeComplete={() => setShowFilterSheet(false)}
      swipeDirection="down"
      style={{ justifyContent: "flex-end", margin: 0 }}
    >
      <View
        style={{
          backgroundColor: surfaceBg,
          borderTopLeftRadius: radii.xl,
          borderTopRightRadius: radii.xl,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
          paddingBottom: spacing["3xl"],
        }}
      >
        {/* Drag handle */}
        <View
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: borderColor,
            alignSelf: "center",
            marginBottom: spacing.lg,
          }}
        />

        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontWeight: "700",
            fontSize: 18,
            color: textPrimary,
            marginBottom: spacing.lg,
          }}
        >
          Filter Requests
        </Text>

        {/* Outcome */}
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontWeight: "600",
            fontSize: 14,
            color: textSecondary,
            marginBottom: spacing.sm,
          }}
        >
          Outcome
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing.sm,
            marginBottom: spacing.lg,
          }}
        >
          {OUTCOME_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setOutcomeFilter(opt.key)}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor:
                  outcomeFilter === opt.key
                    ? colors.primary
                    : borderColor,
                backgroundColor:
                  outcomeFilter === opt.key ? colors.primary : surfaceBg,
              }}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-Medium",
                  fontSize: 13,
                  fontWeight: "500",
                  color:
                    outcomeFilter === opt.key
                      ? colors.white
                      : textSecondary,
                }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Vehicle Type */}
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontWeight: "600",
            fontSize: 14,
            color: textSecondary,
            marginBottom: spacing.sm,
          }}
        >
          Vehicle Type
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing.sm,
            marginBottom: spacing.lg,
          }}
        >
          {VEHICLE_TYPE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setVehicleTypeFilter(opt.key)}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor:
                  vehicleTypeFilter === opt.key
                    ? colors.primary
                    : borderColor,
                backgroundColor:
                  vehicleTypeFilter === opt.key ? colors.primary : surfaceBg,
              }}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-Medium",
                  fontSize: 13,
                  fontWeight: "500",
                  color:
                    vehicleTypeFilter === opt.key
                      ? colors.white
                      : textSecondary,
                }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Date Range */}
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontWeight: "600",
            fontSize: 14,
            color: textSecondary,
            marginBottom: spacing.sm,
          }}
        >
          Time Period
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: spacing.sm,
            marginBottom: spacing.lg,
          }}
        >
          {DATE_RANGE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setDateRangeFilter(opt.key)}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor:
                  dateRangeFilter === opt.key
                    ? colors.primary
                    : borderColor,
                backgroundColor:
                  dateRangeFilter === opt.key ? colors.primary : surfaceBg,
              }}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-Medium",
                  fontSize: 13,
                  fontWeight: "500",
                  color:
                    dateRangeFilter === opt.key
                      ? colors.white
                      : textSecondary,
                }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Apply button */}
        <TouchableOpacity
          onPress={() => setShowFilterSheet(false)}
          style={{
            backgroundColor: colors.primary,
            borderRadius: radii.pill,
            paddingVertical: spacing.md,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontWeight: "700",
              fontSize: 15,
              color: colors.white,
            }}
          >
            Apply Filters
          </Text>
        </TouchableOpacity>
      </View>
    </ReactNativeModal>
  );

  // ── Render: Missed Request Item ──────────────────────────────────────────

  const renderMissedItem = ({ item }: { item: MissedOffer }) => {
    const config =
      OUTCOME_CONFIG(textSecondary)[item.outcome] ?? {
        label: item.outcome,
        color: colors.grayMedium,
      };
    return (
      <View
        style={{
          backgroundColor: surfaceBg,
          borderRadius: radii.lg,
          padding: spacing.md,
          marginBottom: spacing.sm,
          borderLeftWidth: 3,
          borderLeftColor: config.color,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: spacing.xs,
          }}
        >
          <View
            style={{
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
              borderRadius: radii.xs,
              backgroundColor: config.color + "20",
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-SemiBold",
                fontSize: 11,
                fontWeight: "600",
                color: config.color,
              }}
            >
              {config.label}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 11,
              color: textDisabled,
            }}
          >
            {formatShortDate(item.sent_at)} {formatTime(item.sent_at)}
          </Text>
        </View>

        {item.pickup_address && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              marginTop: 4,
            }}
          >
            <View style={{ width: 16, alignItems: "center", marginRight: 8 }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.primary,
                  marginTop: 4,
                }}
              />
            </View>
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 13,
                color: textPrimary,
                flex: 1,
              }}
              numberOfLines={1}
            >
              {item.pickup_address}
            </Text>
          </View>
        )}
        {item.dropoff_address && (
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <View style={{ width: 16, alignItems: "center", marginRight: 8 }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.danger,
                  marginTop: 4,
                }}
              />
            </View>
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 13,
                color: textSecondary,
                flex: 1,
              }}
              numberOfLines={1}
            >
              {item.dropoff_address}
            </Text>
          </View>
        )}

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 6,
            paddingTop: 6,
            borderTopWidth: 1,
            borderTopColor: borderColor,
          }}
        >
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {item.vehicle_type && (
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 11,
                  color: textSecondary,
                }}
              >
                {item.vehicle_type.replace("_", " ")}
              </Text>
            )}
            {item.distance_km != null && (
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 11,
                  color: textSecondary,
                }}
              >
                {item.distance_km.toFixed(1)} km
              </Text>
            )}
          </View>
          {item.filtered_reason === "min_per_km" && (
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 11,
                fontStyle: "italic",
                color: colors.amber,
              }}
            >
              min rate too high
            </Text>
          )}
        </View>
      </View>
    );
  };

  // ── Render: Ledger Item ──────────────────────────────────────────────────

  const renderLedgerItem = ({
    item: group,
  }: {
    item: { date: string; entries: LedgerEntry[] };
  }) => (
    <View style={{ marginBottom: spacing.lg }}>
      <Text
        style={{
          fontFamily: "Jakarta-Regular",
          fontWeight: "600",
          fontSize: 13,
          color: textSecondary,
          marginBottom: spacing.sm,
        }}
      >
        {group.date}
      </Text>
      {group.entries.map((entry) => {
        const config = EVENT_CONFIG[entry.event_type] ?? {
          label: entry.event_type,
          icon: "infocirlceo",
          color: colors.grayMedium,
        };
        // Phase D: offer-time lead debits carry reason='offer_sent' — give
        // them the lead label; legacy deduction reasons keep the old one.
        const entryLabel =
          entry.event_type === "deduction" && entry.reason === "offer_sent"
            ? "Lead (offer sent)"
            : config.label;
        return (
          <View
            key={entry.id}
            style={{
              backgroundColor: surfaceBg,
              borderRadius: radii.lg,
              padding: spacing.md,
              marginBottom: spacing.sm,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: config.color + "15",
                alignItems: "center",
                justifyContent: "center",
                marginRight: spacing.sm,
              }}
            >
              <Ionicons name={config.icon} size={16} color={config.color} />
            </View>
            <View style={{ flex: 1 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Jakarta-Medium",
                    fontWeight: "500",
                    fontSize: 13,
                    color: textPrimary,
                  }}
                >
                  {entryLabel}
                </Text>
                <Text
                  style={{
                    fontFamily: "Jakarta-Regular",
                    fontWeight: "700",
                    fontSize: 13,
                    color: entry.delta > 0 ? colors.primary : colors.danger,
                  }}
                >
                  {entry.delta > 0 ? "+" : ""}
                  {entry.delta}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 11,
                  color: textSecondary,
                  marginTop: 2,
                }}
              >
                {formatTime(entry.created_at)} · Balance: {entry.balance_after}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );

  // ── Main Render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
        }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontWeight: "700",
            fontSize: 17,
            color: textPrimary,
          }}
        >
          Call Ledger
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs */}
      <View
        style={{
          flexDirection: "row",
          marginHorizontal: spacing.lg,
          marginBottom: spacing.sm,
          backgroundColor: borderColor + "40",
          borderRadius: radii.lg,
          padding: 3,
        }}
      >
        <TouchableOpacity
          onPress={() => setActiveTab("missed")}
          style={{
            flex: 1,
            paddingVertical: spacing.sm,
            borderRadius: radii.md,
            backgroundColor:
              activeTab === "missed" ? colors.primary : "transparent",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontWeight: "600",
              fontSize: 13,
              color:
                activeTab === "missed"
                  ? colors.white
                  : textSecondary,
            }}
          >
            Missed Requests
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab("ledger")}
          style={{
            flex: 1,
            paddingVertical: spacing.sm,
            borderRadius: radii.md,
            backgroundColor:
              activeTab === "ledger" ? colors.primary : "transparent",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontWeight: "600",
              fontSize: 13,
              color:
                activeTab === "ledger"
                  ? colors.white
                  : textSecondary,
            }}
          >
            Call History
          </Text>
        </TouchableOpacity>
      </View>

      {/* Balance Card */}
      <View
        style={{
          marginHorizontal: spacing.lg,
          marginBottom: spacing.sm,
          backgroundColor: surfaceBg,
          borderRadius: radii.xl,
          padding: spacing.lg,
        }}
      >
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontSize: 13,
            color: textSecondary,
            marginBottom: spacing.xs,
          }}
        >
          Available Balance
        </Text>
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontWeight: "700",
            fontSize: 28,
            color: textPrimary,
          }}
        >
          {liveBalance === -1
            ? "Unlimited"
            : `${liveBalance ?? balance ?? 0} calls`}
        </Text>
      </View>

      {/* Missed Requests Tab */}
      {activeTab === "missed" && (
        <>
          {renderSummaryCard()}
          {renderFilterBar()}

          {missedLoading ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : missedOffers.length === 0 ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: spacing["3xl"],
              }}
            >
              <Ionicons name="mail-outline" size={48} color={textDisabled} />
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontWeight: "600",
                  fontSize: 16,
                  color: textSecondary,
                  marginTop: spacing.md,
                  textAlign: "center",
                }}
              >
                No requests to show
              </Text>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 13,
                  color: textDisabled,
                  marginTop: spacing.sm,
                  textAlign: "center",
                }}
              >
                Ride offers sent to you will appear here. Use filters to find
                specific requests.
              </Text>
            </View>
          ) : (
            <FlatList
              data={missedOffers}
              keyExtractor={(item) => item.id}
              renderItem={renderMissedItem}
              refreshControl={
                <RefreshControl
                  refreshing={missedRefreshing}
                  onRefresh={onMissedRefresh}
                  tintColor={colors.primary}
                />
              }
              contentContainerStyle={{
                paddingHorizontal: spacing.lg,
                paddingBottom: spacing["3xl"],
              }}
            />
          )}
        </>
      )}

      {/* Call History Tab */}
      {activeTab === "ledger" &&
        (ledgerLoading ? (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : entries.length === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: spacing["3xl"],
            }}
          >
            <Ionicons name="time-outline" size={48} color={textDisabled} />
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 14,
                color: textSecondary,
                marginTop: spacing.md,
                textAlign: "center",
              }}
            >
              No call history yet. Your call usage will appear here once you
              start accepting rides.
            </Text>
          </View>
        ) : (
          <FlatList
            data={groupedEntries}
            keyExtractor={(item) => item.date}
            renderItem={renderLedgerItem}
            refreshControl={
              <RefreshControl
                refreshing={ledgerRefreshing}
                onRefresh={onLedgerRefresh}
                tintColor={colors.primary}
              />
            }
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing["3xl"],
            }}
          />
        ))}

      {/* Filter Sheet */}
      {renderFilterSheet()}

      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
