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
import { useTranslation } from "react-i18next";

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

const OUTCOME_KEYS = ['all', 'accepted', 'expired', 'refunded', 'filtered'] as const;
const OUTCOME_I18N: Record<string, string> = {
  all: 'common.all', accepted: 'call_ledger.accepted', expired: 'call_ledger.ignored',
  refunded: 'call_ledger.refunded', filtered: 'call_ledger.filtered',
};

const VEHICLE_TYPE_KEYS = ['all', 'bike_basic', 'bike_standard', 'bike_plus', 'cng', 'car_compact', 'car_economy', 'car_comfort', 'car_premium', 'car_xl'] as const;
const VEHICLE_TYPE_I18N: Record<string, string> = {
  all: 'call_ledger.all_types',
};

const DATE_RANGE_KEYS = ['7d', '30d', 'all'] as const;
const DATE_RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, all: 0 };
const DATE_RANGE_I18N: Record<string, string> = {
  '7d': 'call_ledger.this_week', '30d': 'call_ledger.this_month', all: 'call_ledger.all_time',
};

const EVENT_ICONS: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  deduction: { icon: "remove-circle-outline", color: colors.danger },
  credit: { icon: "add-circle-outline", color: colors.primary },
  initial_load: { icon: "arrow-down", color: colors.primary },
  expiry_writeoff: { icon: "time-outline", color: colors.grayMedium },
  pro_rata_credit: { icon: "gift-outline", color: colors.adminAccent },
};
const EVENT_I18N: Record<string, string> = {
  deduction: 'call_ledger.ride_deduction', credit: 'call_ledger.credit_added',
  initial_load: 'call_ledger.subscription_activated', expiry_writeoff: 'call_ledger.expired_credits',
  pro_rata_credit: 'call_ledger.pro_rata_compensation',
};

const getOutcomeConfig = (
  textSecondary: string,
  t: (key: string) => string,
): Record<string, { label: string; color: string }> => ({
  accepted: { label: t('call_ledger.accepted'), color: colors.primary },
  expired: { label: t('call_ledger.no_response'), color: colors.amber },
  refunded: { label: t('call_ledger.refunded'), color: colors.info },
  filtered: { label: t('call_ledger.rate_filtered'), color: colors.grayMedium },
  delivered: { label: t('call_ledger.pending'), color: textSecondary },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string, t: (key: string) => string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const datePart = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (d.toDateString() === today.toDateString()) return `${t('call_ledger.today')}, ${datePart}`;
  if (d.toDateString() === yesterday.toDateString())
    return `${t('call_ledger.yesterday')}, ${datePart}`;
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
  const { t } = useTranslation();
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
        const rangeDays = DATE_RANGE_DAYS[dateRangeFilter] ?? 0;
        if (rangeDays > 0) {
          const fromDate = new Date(
            Date.now() - rangeDays * 86400_000,
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
        const rangeDays = DATE_RANGE_DAYS[dateRangeFilter] ?? 0;
        if (rangeDays > 0) {
          const fromDate = new Date(
            Date.now() - rangeDays * 86400_000,
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
      date: formatDate(ents[0].created_at, t),
      entries: ents.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    }));
  }, [entries, t]);

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
            {t('call_ledger.this_week')}
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
                {t('call_ledger.accepted')}
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
                {t('call_ledger.missed')}
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
                {t('call_ledger.filtered')}
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
                {t('call_ledger.refunded')}
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
          {t('call_ledger.filters')}
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
            {t(OUTCOME_I18N[outcomeFilter] ?? 'common.all')}
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
              vehicleTypeFilter === 'all'
                ? t(VEHICLE_TYPE_I18N['all'])
                : vehicleTypeFilter.replace(/_/g, ' ')
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
          {t('call_ledger.filter_requests')}
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
          {t('call_ledger.outcome')}
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing.sm,
            marginBottom: spacing.lg,
          }}
        >
          {OUTCOME_KEYS.map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => setOutcomeFilter(key)}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor:
                  outcomeFilter === key
                    ? colors.primary
                    : borderColor,
                backgroundColor:
                  outcomeFilter === key ? colors.primary : surfaceBg,
              }}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-Medium",
                  fontSize: 13,
                  fontWeight: "500",
                  color:
                    outcomeFilter === key
                      ? colors.white
                      : textSecondary,
                }}
              >
                {t(OUTCOME_I18N[key] ?? 'common.all')}
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
          {t('call_ledger.vehicle_type')}
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing.sm,
            marginBottom: spacing.lg,
          }}
        >
          {VEHICLE_TYPE_KEYS.map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => setVehicleTypeFilter(key)}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor:
                  vehicleTypeFilter === key
                    ? colors.primary
                    : borderColor,
                backgroundColor:
                  vehicleTypeFilter === key ? colors.primary : surfaceBg,
              }}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-Medium",
                  fontSize: 13,
                  fontWeight: "500",
                  color:
                    vehicleTypeFilter === key
                      ? colors.white
                      : textSecondary,
                }}
              >
                {key === 'all' ? t(VEHICLE_TYPE_I18N['all']) : key.replace(/_/g, ' ')}
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
          {t('call_ledger.time_period')}
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: spacing.sm,
            marginBottom: spacing.lg,
          }}
        >
          {DATE_RANGE_KEYS.map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => setDateRangeFilter(key)}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor:
                  dateRangeFilter === key
                    ? colors.primary
                    : borderColor,
                backgroundColor:
                  dateRangeFilter === key ? colors.primary : surfaceBg,
              }}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-Medium",
                  fontSize: 13,
                  fontWeight: "500",
                  color:
                    dateRangeFilter === key
                      ? colors.white
                      : textSecondary,
                }}
              >
                {t(DATE_RANGE_I18N[key] ?? 'call_ledger.all_time')}
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
            {t('call_ledger.apply_filters')}
          </Text>
        </TouchableOpacity>
      </View>
    </ReactNativeModal>
  );

  // ── Render: Missed Request Item ──────────────────────────────────────────

  const renderMissedItem = ({ item }: { item: MissedOffer }) => {      const config =
      getOutcomeConfig(textSecondary, t)[item.outcome] ?? {
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
              {t('call_ledger.min_rate_too_high')}
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
        const evtIcon = EVENT_ICONS[entry.event_type] ?? { icon: 'infocirlceo' as keyof typeof Ionicons.glyphMap, color: colors.grayMedium };
        // Phase D: offer-time lead debits carry reason='offer_sent' — give
        // them the lead label; legacy deduction reasons keep the old one.
        const entryLabel =
          entry.event_type === "deduction" && entry.reason === "offer_sent"
            ? t('call_ledger.lead_offer_sent')
            : t(EVENT_I18N[entry.event_type] ?? 'call_ledger.no_entries');
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
                backgroundColor: evtIcon.color + "15",
                alignItems: "center",
                justifyContent: "center",
                marginRight: spacing.sm,
              }}
            >
              <Ionicons name={evtIcon.icon} size={16} color={evtIcon.color} />
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
                {formatTime(entry.created_at)} · {t('call_ledger.balance', { count: entry.balance_after })}
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
          {t('call_ledger.header')}
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
            {t('call_ledger.tab_missed')}
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
            {t('call_ledger.tab_history')}
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
          {t('call_ledger.available_balance')}
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
            ? t('call_ledger.unlimited')
            : t('call_ledger.calls_count', { count: liveBalance ?? balance ?? 0 })}
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
                {t('call_ledger.no_requests')}
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
                {t('call_ledger.no_requests_desc')}
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
              {t('call_ledger.no_history')}
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
