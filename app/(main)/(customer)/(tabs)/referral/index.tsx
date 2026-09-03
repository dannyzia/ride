import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  StatusBar,
  Share,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { formatBDT, formatRelativeTime } from "@/lib/format";
import EmptyState from "@/components/EmptyState";
import { useTranslation } from "react-i18next";

interface ReferralRecent {
  referee_phone: string | null;
  status: string;
  created_at: string;
  rewarded_at: string | null;
}

interface ReferralCampaign {
  name: string;
  referrer_reward_percent: number;
  referee_reward_percent: number;
  referrer_reward_bdt: number;
  referee_reward_bdt: number;
}

interface ReferralResponse {
  code: string | null;
  campaign: ReferralCampaign | null;
  stats: {
    total_referrals: number;
    successful: number;
    total_reward_bdt: number;
  };
  recent: ReferralRecent[];
}

function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 6)}•••••${phone.slice(-3)}`;
}

export default function Referral() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const [data, setData] = useState<ReferralResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;
  const buttonSecondaryBg = isDark ? colors.darkSecondary : colors.gray100;

  const fetchReferral = useCallback(async () => {
    try {
      setError(false);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(true);
        return;
      }
      const res = await fetch(`${API_URL}/api/user/referral`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const body = (await res.json()) as ReferralResponse;
      setData(body);
    } catch (err) {
      setError(true);
      logger.error("[referral] fetch failed", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchReferral();
  }, [fetchReferral]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchReferral();
  }, [fetchReferral]);

  const handleShare = useCallback(async () => {
    if (!data?.code) return;
    const rewardPart =
      data.campaign && data.campaign.referee_reward_bdt > 0
        ? t('referral.share_reward', { amount: formatBDT(data.campaign.referee_reward_bdt) })
        : "";
    const message = t('referral.share_message', { code: data.code }) + rewardPart;
    try {
      await Share.share({ message });
    } catch (err) {
      logger.warn("[referral] share failed", err);
    }
  }, [data, t]);

  const handleCopy = useCallback(async () => {
    if (!data?.code) return;
    try {
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(data.code);
    } catch (err) {
      logger.warn("[referral] clipboard unavailable", err);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  const renderRecentItem = (item: ReferralRecent, index: number) => {
    const rewarded = item.status === "rewarded";
    return (
      <View
        key={`${item.created_at}-${index}`}
        style={[styles.recentRow, { backgroundColor: surfaceBg, borderColor }]}
      >
        <View style={styles.recentInfo}>
          <Text style={[styles.recentPhone, { color: textPrimary }]} numberOfLines={1}>
            {item.referee_phone ? maskPhone(item.referee_phone) : t('referral.unknown')}
          </Text>
          <Text style={[styles.recentTime, { color: textDisabled }]}>
            {formatRelativeTime(item.created_at)}
          </Text>
        </View>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: rewarded ? colors.primaryLight : `${colors.amber}1A` },
          ]}
        >
          <Text style={[styles.statusText, { color: rewarded ? colors.primary : colors.amber }]}>
            {rewarded ? t('referral.rewarded') : t('referral.pending')}
          </Text>
        </View>
      </View>
    );
  };

  const isEmpty = !error && data && !data.code && data.recent.length === 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={["top", "left", "right"]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
        translucent
      />
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>{t('referral.title')}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('referral.toggle_theme')}
          onPress={() => setTheme(isDark ? "light" : "dark")}
          style={[styles.themeToggle, { backgroundColor: surfaceBg, borderColor }]}
        >
          <Ionicons
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={24}
            color={textPrimary}
          />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {loading ? (
          <View style={styles.skeletonWrap}>
            <View style={[styles.skeletonCard, { backgroundColor: surfaceBg, borderColor }]} />
            <View style={[styles.skeletonButtons, { backgroundColor: surfaceBg, borderColor }]}>
              <View style={[styles.skeletonHalf, { backgroundColor: buttonSecondaryBg }]} />
              <View style={[styles.skeletonHalf, { backgroundColor: buttonSecondaryBg }]} />
            </View>
            <View style={[styles.skeletonStats, { backgroundColor: surfaceBg, borderColor }]} />
          </View>
        ) : error ? (
          <View style={styles.errorWrap}>
            <Ionicons name="warning-outline" size={48} color={colors.danger} />
            <Text style={[styles.errorTitle, { color: colors.danger }]}>
              {t('referral.load_failed')}
            </Text>
            <Text style={[styles.stateSubtitle, { color: textSecondary }]}>
              {t('referral.pull_to_retry')}
            </Text>
          </View>
        ) : isEmpty ? (
          <EmptyState
            icon="gift-outline"
            title={t('referral.no_referrals')}
            subtitle={t('referral.no_referrals_sub')}
          />
        ) : data ? (
          <>
            <View style={[styles.codeCard, { backgroundColor: surfaceBg, borderColor }]}>
              <Text style={[styles.codeLabel, { color: textSecondary }]}>
                {t('referral.your_code')}
              </Text>
              {data.code ? (
                <Text style={styles.codeValue}>{data.code}</Text>
              ) : (
                <Text style={[styles.codeMissing, { color: textSecondary }]}>
                  {t('referral.no_code')}
                </Text>
              )}
            </View>

            {data.code ? (
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('referral.a11y_share_code')}
                  style={[styles.shareButton, { backgroundColor: colors.primary }]}
                  onPress={handleShare}
                >
                  <Ionicons name="share-social-outline" size={18} color={colors.white} />
                  <Text style={styles.shareButtonText}>{t('referral.share')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('referral.a11y_copy_code')}
                  style={[
                    styles.copyButton,
                    {
                      backgroundColor: copied ? colors.primaryLight : surfaceBg,
                      borderColor: copied ? colors.primary : borderColor,
                    },
                  ]}
                  onPress={handleCopy}
                >
                  <Ionicons
                    name={copied ? "checkmark-outline" : "copy-outline"}
                    size={18}
                    color={copied ? colors.primary : textPrimary}
                  />
                  <Text
                    style={[
                      styles.copyButtonText,
                      { color: copied ? colors.primary : textPrimary },
                    ]}
                  >
                    {copied ? t('referral.copied') : t('referral.copy')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={[styles.statsCard, { backgroundColor: surfaceBg, borderColor }]}>
              <View style={styles.statCol}>
                <Text style={[styles.statValue, { color: textPrimary }]}>
                  {data.stats.total_referrals}
                </Text>
                <Text style={[styles.statLabel, { color: textSecondary }]}>{t('referral.invited')}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: borderColor }]} />
              <View style={styles.statCol}>
                <Text style={[styles.statValue, { color: textPrimary }]}>
                  {data.stats.successful}
                </Text>
                <Text style={[styles.statLabel, { color: textSecondary }]}>{t('referral.successful')}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: borderColor }]} />
              <View style={styles.statCol}>
                <Text style={[styles.statValue, { color: textPrimary }]}>
                  {formatBDT(data.stats.total_reward_bdt)}
                </Text>
                <Text style={[styles.statLabel, { color: textSecondary }]}>{t('referral.earned')}</Text>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: textPrimary }]}>{t('referral.recent')}</Text>
            {data.recent.length > 0 ? (
              data.recent.map(renderRecentItem)
            ) : (
              <Text style={[styles.noRecent, { color: textSecondary }]}>
                {t('referral.recent_empty')}
              </Text>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
  },
  themeToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  skeletonWrap: {
    gap: 12,
    opacity: 0.6,
  },
  skeletonCard: {
    height: 96,
    borderRadius: 16,
    borderWidth: 1,
  },
  skeletonButtons: {
    flexDirection: "row",
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 8,
  },
  skeletonHalf: {
    flex: 1,
    borderRadius: 8,
  },
  skeletonStats: {
    height: 80,
    borderRadius: 16,
    borderWidth: 1,
  },
  errorWrap: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    paddingTop: 80,
  },
  errorTitle: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
    marginTop: 16,
    textAlign: "center",
  },
  stateSubtitle: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
  },
  codeCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
  },
  codeLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  codeValue: {
    fontFamily: "Jakarta-Bold",
    fontSize: 24,
    letterSpacing: 2,
    color: colors.primary,
    marginTop: 8,
  },
  codeMissing: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  shareButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  shareButtonText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
    color: colors.white,
  },
  copyButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  copyButtonText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 16,
  },
  statCol: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    alignSelf: "stretch",
  },
  statValue: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 18,
  },
  statLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 18,
    marginTop: 24,
    marginBottom: 12,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  recentInfo: {
    flex: 1,
  },
  recentPhone: {
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
  },
  recentTime: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 1000,
    marginLeft: 12,
  },
  statusText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
  },
  noRecent: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
});
