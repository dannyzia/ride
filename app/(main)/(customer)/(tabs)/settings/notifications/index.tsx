import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useAppearance, useIsDark } from "@/lib/useAppearance";
import SettingsRow from "@/components/SettingsRow";

interface Prefs {
  ride_updates: boolean;
  promo_offers: boolean;
  service_alerts: boolean;
  email_notifications: boolean;
  sms_notifications: boolean;
}

type PrefKey = keyof Prefs;

interface PrefsResponse {
  notification_prefs?: Partial<Prefs>;
  error?: string;
}

const DEFAULT_PREFS: Prefs = {
  ride_updates: true,
  promo_offers: true,
  service_alerts: true,
  email_notifications: false,
  sms_notifications: true,
};

interface PrefRowConfig {
  key: PrefKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
}

const ALERT_ROWS: PrefRowConfig[] = [
  { key: "ride_updates", label: "Ride Updates", icon: "car-sport-outline" },
  { key: "promo_offers", label: "Promotions & Offers", icon: "pricetag-outline" },
  {
    key: "service_alerts",
    label: "Service Alerts",
    icon: "warning-outline",
    iconColor: colors.amber,
  },
];

const CHANNEL_ROWS: PrefRowConfig[] = [
  {
    key: "email_notifications",
    label: "Email Notifications",
    icon: "mail-outline",
    iconColor: colors.info,
  },
  {
    key: "sms_notifications",
    label: "SMS Notifications",
    icon: "phone-portrait-outline",
    iconColor: colors.info,
  },
];

const ErrorBanner = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) => (
  <View style={[styles.banner, { backgroundColor: `${colors.danger}1A` }]}>
    <Ionicons name="alert-circle" size={20} color={colors.danger} />
    <Text style={[styles.bannerText, { color: colors.danger }]}>{message}</Text>
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Retry"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={onRetry}
    >
      <Text style={styles.bannerAction}>Retry</Text>
    </TouchableOpacity>
  </View>
);

const SkeletonRow = ({ block }: { block: string }) => (
  <View style={styles.skeletonRow}>
    <View style={[styles.skeletonIcon, { backgroundColor: block }]} />
    <View style={[styles.skeletonBar, { backgroundColor: block }]} />
  </View>
);

export default function SettingsNotifications() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surface = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setLoadError(true);
        return;
      }
      const res = await fetch(`${API_URL}/api/user/notification-prefs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as PrefsResponse;
      if (!res.ok || !data.notification_prefs) {
        setLoadError(true);
        return;
      }
      setPrefs({ ...DEFAULT_PREFS, ...data.notification_prefs });
    } catch (err) {
      logger.error("[settings/notifications] GET failed", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback((key: PrefKey) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setSaveError(true);
        return;
      }
      const res = await fetch(`${API_URL}/api/user/notification-prefs`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(prefs),
      });
      const data = (await res.json()) as PrefsResponse;
      if (!res.ok) {
        setSaveError(true);
        return;
      }
      setPrefs({ ...DEFAULT_PREFS, ...data.notification_prefs });
      setSavedFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      logger.error("[settings/notifications] PATCH failed", err);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  const renderSwitchRow = (row: PrefRowConfig, isLast: boolean) => (
    <SettingsRow
      key={row.key}
      icon={row.icon}
      iconColor={row.iconColor}
      label={row.label}
      onPress={() => toggle(row.key)}
      showChevron={false}
      isLast={isLast}
      rightElement={
        <Switch
          value={prefs[row.key]}
          onValueChange={() => toggle(row.key)}
          trackColor={{ false: borderColor, true: colors.primary }}
          thumbColor={colors.white}
          accessibilityLabel={row.label}
        />
      }
    />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? "light-content" : "dark-content"}
      />
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>
          Notifications
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Toggle theme"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => setTheme(isDark ? "light" : "dark")}
        >
          <Ionicons
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={24}
            color={textPrimary}
          />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {loadError ? (
          <ErrorBanner
            message="Couldn't load your preferences."
            onRetry={load}
          />
        ) : null}
        {loading ? (
          <View style={[styles.card, { backgroundColor: surface }]}>
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonRow
                key={i}
                block={isDark ? colors.darkSecondary : colors.gray100}
              />
            ))}
          </View>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>
              Alert Types
            </Text>
            <View style={[styles.card, { backgroundColor: surface }]}>
              {ALERT_ROWS.map((row, index) =>
                renderSwitchRow(row, index === ALERT_ROWS.length - 1)
              )}
            </View>
            <Text
              style={[styles.sectionTitle, { color: textPrimary, marginTop: 24 }]}
            >
              Notification Channels
            </Text>
            <View style={[styles.card, { backgroundColor: surface }]}>
              {CHANNEL_ROWS.map((row, index) =>
                renderSwitchRow(row, index === CHANNEL_ROWS.length - 1)
              )}
            </View>
            {savedFlash ? (
              <View
                style={[
                  styles.banner,
                  { backgroundColor: `${colors.checkGreen}1A` },
                ]}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={colors.checkGreen}
                />
                <Text style={[styles.bannerText, { color: colors.checkGreen }]}>
                  Preferences saved
                </Text>
              </View>
            ) : null}
            {saveError ? (
              <ErrorBanner
                message="Couldn't save your preferences. Your toggles are kept."
                onRetry={save}
              />
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Save Preferences"
              activeOpacity={0.8}
              disabled={saving}
              onPress={save}
              style={[styles.saveButton, { backgroundColor: colors.primary }]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>Save Preferences</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
  },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitle: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 18,
    marginBottom: 12,
  },
  card: { borderRadius: 16, overflow: "hidden" },
  banner: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  bannerText: {
    flex: 1,
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
  },
  bannerAction: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
    color: colors.primary,
  },
  skeletonRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
  },
  skeletonIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  skeletonBar: {
    flex: 1,
    height: 16,
    borderRadius: 8,
  },
  saveButton: {
    minHeight: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  saveButtonText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 16,
    color: colors.white,
  },
});
