import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import NotificationCard from "@/components/NotificationCard";
import NotificationSkeleton from "@/components/NotificationSkeleton";
import EmptyState from "@/components/EmptyState";

const READ_IDS_KEY = "@rider_read_notification_ids";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  sent_at: string;
  created_at: string;
}

interface NotificationsResponse {
  notifications: NotificationRow[];
}

type CardType = "promo" | "trip" | "payment" | "system";

function toCardType(apiType: string): CardType {
  switch (apiType) {
    case "promo":
    case "promotion":
      return "promo";
    case "trip":
    case "ride":
      return "trip";
    case "payment":
    case "wallet":
      return "payment";
    default:
      return "system";
  }
}

function extractDeepLink(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const candidates = [data.deep_link, data.link, data.route];
  for (const value of candidates) {
    if (typeof value === "string" && value.startsWith("/")) return value;
  }
  return null;
}

const SAMPLE_NOTIFICATIONS: NotificationRow[] = [
  {
    id: "sample-promo",
    type: "promo",
    title: "Weekend discount inside",
    body: "Enjoy 20% off your next three rides, this weekend only.",
    data: null,
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: "sample-trip",
    type: "trip",
    title: "Trip reminder",
    body: "You have a scheduled ride coming up tomorrow morning.",
    data: null,
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: "sample-payment",
    type: "payment",
    title: "Payment received",
    body: "Your wallet top-up of BDT 200 was successful.",
    data: null,
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: "sample-system",
    type: "system",
    title: "Keep your app updated",
    body: "Update to the latest version for the best experience.",
    data: null,
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
];

export default function Inbox() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const loadReadIds = useCallback(async (): Promise<Set<string>> => {
    try {
      const raw = await AsyncStorage.getItem(READ_IDS_KEY);
      if (!raw) return new Set();
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((v): v is string => typeof v === "string"));
      }
      return new Set();
    } catch (err) {
      logger.warn("[inbox] failed to load read notification ids", err);
      return new Set();
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      setError(false);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(true);
        return;
      }
      const res = await fetch(`${API_URL}/api/rider/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as NotificationsResponse;
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch (err) {
      setError(true);
      logger.error("[inbox] notifications fetch failed", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = await loadReadIds();
      if (!cancelled) setReadIds(ids);
      await fetchNotifications();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadReadIds, fetchNotifications]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNotifications();
  }, [fetchNotifications]);

  const markRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Persist outside the state updater (updaters must be pure; StrictMode double-invokes
  // them) and prune to the last 200 ids so the AsyncStorage payload stays bounded.
  useEffect(() => {
    if (readIds.size === 0) return;
    const pruned = [...readIds].slice(-200);
    AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify(pruned)).catch((err) => {
      logger.warn("[inbox] failed to persist read notification ids", err);
    });
  }, [readIds]);

  const handlePress = useCallback(
    (notification: NotificationRow) => {
      markRead(notification.id);
      const link = extractDeepLink(notification.data);
      if (link) router.push(link);
    },
    [markRead],
  );

  const errorListHeader = useMemo(() => {
    if (!error) return null;
    return (
      <View style={styles.stateWrap}>
        <Ionicons name="warning-outline" size={48} color={colors.danger} />
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          Could not load notifications
        </Text>
        <Text style={[styles.stateSubtitle, { color: textSecondary }]}>
          Pull down to retry
        </Text>
        <Text style={[styles.sampleCaption, { color: textSecondary }]}>
          Using sample data
        </Text>
      </View>
    );
  }, [error, textSecondary]);

  const listEmpty = useMemo(
    () => (
      <EmptyState
        icon="notifications-off-outline"
        title="No notifications yet"
        subtitle="We'll notify you about rides, promos, and updates"
      />
    ),
    [],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={["top", "left", "right"]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
        translucent
      />
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>Notifications</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Toggle theme"
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
      {loading ? (
        <View style={styles.skeletonWrap}>
          <NotificationSkeleton />
          <NotificationSkeleton />
          <NotificationSkeleton />
          <NotificationSkeleton />
        </View>
      ) : (
        <FlatList
          data={error ? SAMPLE_NOTIFICATIONS : notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListHeaderComponent={errorListHeader}
          ListEmptyComponent={listEmpty}
          renderItem={({ item }) => (
            <NotificationCard
              type={toCardType(item.type)}
              title={item.title}
              body={item.body ?? ""}
              isRead={error ? true : readIds.has(item.id)}
              createdAt={item.sent_at}
              onPress={error ? undefined : () => handlePress(item)}
            />
          )}
        />
      )}
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
  skeletonWrap: {
    padding: 16,
    gap: 12,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  stateWrap: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    paddingTop: 32,
    paddingBottom: 4,
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
  sampleCaption: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 16,
    textAlign: "center",
  },
});
