import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  StyleSheet,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";
import { colors, radii } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";
import { formatBDT, formatDate } from "@/lib/format";
import TransactionRow from "@/components/TransactionRow";
import EmptyState from "@/components/EmptyState";
import WalletSkeleton from "@/components/WalletSkeleton";
import { useTranslation } from "react-i18next";

// ── API contracts (app/api/rider/wallet+api.ts) ────────────────────────────
// GET /api/rider/wallet → { balance_bdt, recent_transactions: [...] }
// transaction_type values come from wallet_rider_transaction_type enum:
// referral_reward | ride_discount | adjustment | upfront_tip | cashback_earn |
// cashback_redeem | cashback_expire

interface WalletTxn {
  id: string;
  transaction_type: string;
  amount_bdt: number;
  balance_after: number;
  created_at: string;
}

interface WalletResponse {
  balance_bdt: number;
  recent_transactions: WalletTxn[];
}

// ── API contract (app/api/rider/passes+api.ts) ─────────────────────────────
// GET /api/rider/passes → { passes: [...catalog], active_subscription | null }

interface RiderPass {
  id: string;
  name: string;
  max_rides: number | null;
}

interface RiderSubscription {
  id: string;
  pass_id: string;
  status: string;
  rides_used: number;
  valid_until: string;
}

interface PassesResponse {
  passes: RiderPass[];
  active_subscription: RiderSubscription | null;
}

// TransactionRow's union: "top_up" | "ride_payment" | "pass_purchase" | "refund".
// The API enum has no direct equivalents, so each value maps to the nearest
// semantic row (credits → refund, ride-related/ debits → ride_payment).
type RowType = "top_up" | "ride_payment" | "pass_purchase" | "refund";

function mapTxn(txn: WalletTxn): { type: RowType; titleKey: string | null; title: string } {
  switch (txn.transaction_type) {
    case "referral_reward":
      return { type: "refund", titleKey: "rider_wallet.txn_referral_reward", title: "Referral Reward" };
    case "ride_discount":
      return { type: "ride_payment", titleKey: "rider_wallet.txn_ride_discount", title: "Ride Discount" };
    case "upfront_tip":
      return { type: "ride_payment", titleKey: "rider_wallet.txn_upfront_tip", title: "Upfront Tip" };
    case "cashback_earn":
      return { type: "refund", titleKey: "rider_wallet.txn_cashback_earned", title: "Cashback Earned" };
    case "cashback_redeem":
      return { type: "ride_payment", titleKey: "rider_wallet.txn_cashback_redeemed", title: "Cashback Redeemed" };
    case "cashback_expire":
      return { type: "ride_payment", titleKey: "rider_wallet.txn_cashback_expired", title: "Cashback Expired" };
    case "adjustment":
      return txn.amount_bdt >= 0
        ? { type: "refund", titleKey: "rider_wallet.txn_wallet_credit", title: "Wallet Credit" }
        : { type: "ride_payment", titleKey: "rider_wallet.txn_wallet_adjustment", title: "Wallet Adjustment" };
    default:
      return {
        type: "ride_payment",
        titleKey: null,
        title: txn.transaction_type
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
      };
  }
}

const RECENT_COUNT = 5;

export default function WalletScreen() {
  const { t } = useTranslation();
  const [balanceBdt, setBalanceBdt] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<WalletTxn[]>([]);
  const [activePass, setActivePass] = useState<RiderSubscription | null>(null);
  const [passName, setPassName] = useState<string>("");
  const [passMaxRides, setPassMaxRides] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [showAllTxns, setShowAllTxns] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const txnsSectionY = useRef(0);

  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const fetchWallet = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("no_session");

      const headers = { Authorization: `Bearer ${token}` };

      const walletRes = await fetch(`${API_URL}/api/rider/wallet`, { headers });
      if (!walletRes.ok) throw new Error(`wallet_${walletRes.status}`);
      const wallet: WalletResponse = await walletRes.json();
      setBalanceBdt(wallet.balance_bdt ?? 0);
      setTransactions(wallet.recent_transactions ?? []);
      setError(false);

      // Passes are secondary — a failure here must not fail the wallet screen.
      try {
        const passesRes = await fetch(`${API_URL}/api/rider/passes`, { headers });
        if (passesRes.ok) {
          const data: PassesResponse = await passesRes.json();
          const sub = data.active_subscription;
          if (sub) {
            const pass = data.passes?.find((p) => p.id === sub.pass_id) ?? null;
            setActivePass(sub);
            setPassName(pass?.name ?? t('rider_wallet.ride_pass'));
            setPassMaxRides(pass?.max_rides ?? null);
          } else {
            setActivePass(null);
          }
        }
      } catch (passErr) {
        logger.warn("[wallet] passes fetch failed", passErr);
        setActivePass(null);
      }
    } catch (e) {
      logger.error("[wallet] fetch failed", e);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchWallet();
  }, [fetchWallet]);

  const openTransactions = useCallback(() => {
    setShowAllTxns(true);
    scrollRef.current?.scrollTo({ y: txnsSectionY.current, animated: true });
  }, []);

  const visibleTxns = showAllTxns ? transactions : transactions.slice(0, RECENT_COUNT);

  const passProgress =
    activePass && passMaxRides && passMaxRides > 0
      ? Math.min(1, Math.max(0, activePass.rides_used / passMaxRides))
      : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={["top", "left", "right"]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textPrimary }]}>{t('wallet.title')}</Text>
          <TouchableOpacity
            onPress={() => setTheme(isDark ? "light" : "dark")}
            accessibilityRole="button"
            accessibilityLabel={t('rider_wallet.toggle_theme')}
            hitSlop={8}
          >
            <Ionicons
              name={isDark ? "sunny-outline" : "moon-outline"}
              size={24}
              color={textPrimary}
            />
          </TouchableOpacity>
        </View>

        {loading ? (
          <WalletSkeleton />
        ) : error || balanceBdt === null ? (
          <View style={styles.errorState}>
            <Ionicons name="warning-outline" size={48} color={colors.danger} />
            <Text style={[styles.errorTitle, { color: textPrimary }]}>{t('rider_wallet.load_failed')}</Text>
            <Text style={[styles.errorSub, { color: textSecondary }]}>{t('rider_wallet.pull_to_retry')}</Text>
          </View>
        ) : (
          <>
            {/* Balance card */}
            <View style={[styles.balanceCard, { backgroundColor: surfaceBg, borderTopColor: colors.primary }]}>
              <Text style={[styles.balanceLabel, { color: textSecondary }]}>{t('rider_wallet.available_balance')}</Text>
              <Text style={styles.balanceValue}>{formatBDT(balanceBdt, { decimals: true })}</Text>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.topUpButton, { backgroundColor: colors.primary }]}
                  onPress={() => router.push("/(main)/(customer)/(tabs)/settings/top-up")}
                  accessibilityRole="button"
                  accessibilityLabel={t('rider_wallet.top_up_wallet')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.topUpButtonText}>{t('wallet.top_up')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.txnsButton, { backgroundColor: surfaceBg, borderColor }]}
                  onPress={openTransactions}
                  accessibilityRole="button"
                  accessibilityLabel={t('rider_wallet.show_all_transactions')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.txnsButtonText, { color: textPrimary }]}>{t('rider_wallet.transactions')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Active passes — hidden entirely when the rider has none */}
            {activePass ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: textPrimary }]}>{t('rider_wallet.active_passes')}</Text>
                <View
                  style={[
                    styles.passCard,
                    { backgroundColor: surfaceBg, borderLeftColor: colors.primary },
                  ]}
                >
                  <Text style={[styles.passName, { color: textPrimary }]}>{passName}</Text>
                  <Text style={[styles.passMeta, { color: textSecondary }]}>
                    {passMaxRides !== null
                      ? t('rider_wallet.rides_used_of', { used: activePass.rides_used, max: passMaxRides })
                      : t('rider_wallet.rides_used', { count: activePass.rides_used })}
                  </Text>
                  {passProgress !== null ? (
                    <View style={[styles.passTrack, { backgroundColor: borderColor }]}>
                      <View
                        style={[styles.passFill, { width: `${Math.round(passProgress * 100)}%` }]}
                      />
                    </View>
                  ) : null}
                  <Text style={[styles.passExpiry, { color: textDisabled }]}>
                    {t('rider_wallet.valid_until', { date: formatDate(activePass.valid_until) })}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Transactions */}
            <View
              style={styles.section}
              onLayout={(e) => {
                txnsSectionY.current = e.nativeEvent.layout.y;
              }}
            >
              <Text style={[styles.sectionTitle, { color: textPrimary }]}>{t('wallet.recent_transactions')}</Text>
              {visibleTxns.length === 0 ? (
                <EmptyState
                  icon="receipt-outline"
                  iconSize={48}
                  title={t('rider_wallet.no_transactions')}
                  subtitle={t('rider_wallet.no_transactions_sub')}
                />
              ) : (
                visibleTxns.map((txn) => {
                  const mapped = mapTxn(txn);
                  return (
                    <TransactionRow
                      key={txn.id}
                      type={mapped.type}
                      title={mapped.titleKey ? t(mapped.titleKey) : mapped.title}
                      amountBdt={txn.amount_bdt}
                      status="success"
                      date={txn.created_at}
                    />
                  );
                })
              )}
              {!showAllTxns && transactions.length > RECENT_COUNT ? (
                <TouchableOpacity
                  onPress={() => setShowAllTxns(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('rider_wallet.show_all_transactions')}
                  style={styles.showMore}
                  hitSlop={8}
                >
                  <Text style={[styles.showMoreText, { color: colors.primary }]}>
                    {t('rider_wallet.show_all_count', { count: transactions.length })}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
  },
  balanceCard: {
    marginHorizontal: 16,
    borderRadius: radii.lg,
    borderTopWidth: 4,
    padding: 20,
  },
  balanceLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  balanceValue: {
    fontFamily: "Jakarta-Bold",
    fontSize: 36,
    color: colors.primary,
    marginTop: 6,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  topUpButton: {
    flex: 1,
    height: 48,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  topUpButtonText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
    color: colors.white,
  },
  txnsButton: {
    flex: 1,
    height: 48,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  txnsButtonText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 18,
    marginBottom: 12,
  },
  passCard: {
    borderRadius: radii.lg,
    borderLeftWidth: 3,
    padding: 16,
  },
  passName: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  passMeta: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 4,
  },
  passTrack: {
    height: 6,
    borderRadius: 3,
    marginTop: 10,
    overflow: "hidden",
  },
  passFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  passExpiry: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 8,
  },
  errorState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    marginTop: 120,
  },
  errorTitle: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
    marginTop: 16,
  },
  errorSub: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 8,
  },
  showMore: {
    alignItems: "center",
    paddingVertical: 12,
  },
  showMoreText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
});
