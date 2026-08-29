import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  FlatList,
  Linking,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors, spacing, radii } from "@/theme/goRide";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";
import { enqueueSosAlert } from "@/lib/sosQueue";
import NetInfo from "@react-native-community/netinfo";

// ─── Types ────────────────────────────────────────────────────────

type IconName = keyof typeof Ionicons.glyphMap;
type ButtonRole = "customer" | "driver" | "admin";

interface NavItem {
  route: string;
  label: string;
  icon: IconName;
  group: string;
}

interface SOSContact {
  label: string;
  number: string;
}

// ─── Menu items ───────────────────────────────────────────────────

const CUSTOMER_ITEMS: NavItem[] = [
  { route: "/(main)/(customer)/(tabs)/home/index", label: "Home", icon: "home-outline", group: "Ride" },
  { route: "/(main)/(customer)/find-ride", label: "Book Ride", icon: "car-outline", group: "Ride" },
  { route: "/(main)/(customer)/schedule-ride", label: "Schedule Ride", icon: "calendar-outline", group: "Ride" },
  { route: "/(main)/(customer)/(tabs)/rides/index", label: "My Rides", icon: "time-outline", group: "Activity" },
  { route: "/(main)/(customer)/(tabs)/wallet/index", label: "Wallet", icon: "wallet-outline", group: "Activity" },
  { route: "/(main)/(customer)/(tabs)/chat/index", label: "Inbox", icon: "chatbubble-outline", group: "Activity" },
  { route: "/(main)/(customer)/(tabs)/profile/index", label: "Profile", icon: "person-outline", group: "Account" },
  { route: "/(main)/(customer)/(tabs)/settings/index", label: "Settings", icon: "settings-outline", group: "Account" },
  { route: "/(main)/(customer)/apply-promos", label: "Promos", icon: "pricetag-outline", group: "Account" },
  { route: "/(main)/(customer)/emergency-sos", label: "Emergency SOS", icon: "alert-circle-outline", group: "Safety" },
];

const DRIVER_ITEMS: NavItem[] = [
  { route: "/(main)/(rider)/(tabs)/index", label: "Home", icon: "home-outline", group: "Main" },
  { route: "/(main)/(rider)/(tabs)/earning/index", label: "Earnings", icon: "cash-outline", group: "Main" },
  { route: "/(main)/(rider)/(tabs)/activity/index", label: "Activity", icon: "time-outline", group: "Main" },
  { route: "/(main)/(rider)/(tabs)/wallet/index", label: "Wallet", icon: "wallet-outline", group: "Main" },
  { route: "/(main)/(rider)/(tabs)/profile/index", label: "Profile", icon: "person-outline", group: "Account" },
  { route: "/(main)/(rider)/settings", label: "Settings", icon: "settings-outline", group: "Account" },
  { route: "/(main)/(rider)/packages", label: "Packages", icon: "cube-outline", group: "Programs" },
  { route: "/(main)/(rider)/incentives", label: "Incentives", icon: "trophy-outline", group: "Programs" },
  { route: "/(main)/(rider)/call-ledger", label: "Call Ledger", icon: "clipboard-outline", group: "Programs" },
  { route: "/(main)/(rider)/documents", label: "Documents", icon: "document-text-outline", group: "Compliance" },
  { route: "/(main)/(rider)/verification", label: "Verification", icon: "checkmark-circle-outline", group: "Compliance" },
];

const GROUP_ORDER_CUSTOMER = ["Ride", "Activity", "Account", "Safety"];
const GROUP_ORDER_DRIVER = ["Main", "Account", "Programs", "Compliance"];

// ─── SOS constants ────────────────────────────────────────────────

const SOS_API_URL = Constants.expoConfig?.extra?.serverUrl ?? "";
const SOS_COOLDOWN_SECONDS = 5;

// ─── Component ────────────────────────────────────────────────────

interface GlobalActionButtonsProps {
  role: ButtonRole;
  /** Ride ID for SOS alert correlation (available on ride-tracking screens). */
  rideId?: string;
}

export function GlobalActionButtons({ role, rideId }: GlobalActionButtonsProps) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const isDark = useIsDark();

  // ── Hamburger state ──
  const [menuOpen, setMenuOpen] = useState(false);

  // ── SOS state ──
  const [sosVisible, setSosVisible] = useState(false);
  const [contacts, setContacts] = useState<SOSContact[]>([]);
  const [sosLoading, setSosLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [queued, setQueued] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // ── Theme tokens ──
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textMuted = isDark ? colors.textDisabledDark : colors.textDisabledLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const overlayBg = isDark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.4)";
  const activeBg = isDark ? "rgba(12,194,95,0.10)" : colors.primaryLight;
  const activeText = colors.primary;
  const fabBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const fabBorder = isDark ? colors.borderDark : colors.borderLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  // ── Menu items by role ──
  const items = role === "customer" ? CUSTOMER_ITEMS : DRIVER_ITEMS;
  const groupOrder = role === "customer" ? GROUP_ORDER_CUSTOMER : GROUP_ORDER_DRIVER;

  const grouped = groupOrder.reduce<Record<string, NavItem[]>>((acc, group) => {
    acc[group] = items.filter((i) => i.group === group);
    return acc;
  }, {});

  // ── Navigation ──
  const navigateTo = useCallback((route: string) => {
    setMenuOpen(false);
    if (route.includes("(tabs)")) {
      router.navigate(route as never);
    } else {
      router.push(route as never);
    }
  }, []);

  // ── SOS handlers ──
  const startCooldown = useCallback(() => {
    setCooldownRemaining(SOS_COOLDOWN_SECONDS);
    cooldownRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleSosOpen = useCallback(async () => {
    if (cooldownRemaining > 0) {
      Alert.alert(
        "SOS Cooldown",
        `Please wait ${cooldownRemaining} second${cooldownRemaining !== 1 ? "s" : ""} before sending another SOS.`,
      );
      return;
    }
    setSosVisible(true);
    setSosLoading(true);
    try {
      const res = await fetch(`${SOS_API_URL}/api/sos/contacts`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts ?? []);
      } else {
        setContacts([{ label: "National Emergency", number: "999" }]);
      }
    } catch {
      setContacts([{ label: "National Emergency", number: "999" }]);
    } finally {
      setSosLoading(false);
    }
  }, [cooldownRemaining]);

  const handleSosSelect = useCallback(
    async (contact: SOSContact) => {
      if (sending) return;
      setSending(true);
      try {
        let lat = 0;
        let lng = 0;
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            lat = loc.coords.latitude;
            lng = loc.coords.longitude;
          }
        } catch {
          // Location unavailable
        }

        // DIAL FIRST: emergency call must never depend on network
        const phoneUrl = `tel:${contact.number}`;
        const canOpen = await Linking.canOpenURL(phoneUrl);
        if (canOpen) {
          await Linking.openURL(phoneUrl);
        } else {
          Alert.alert("SOS", `Call ${contact.label}: ${contact.number}`);
        }
        setSosVisible(false);

        // Fire alert best-effort in background
        try {
          const net = await NetInfo.fetch();
          if (net.isConnected !== true) {
            const result = await enqueueSosAlert({ lat, lng });
            if (result.queued) {
              setQueued(true);
              logger.info("[SOS] alert queued (offline)", { id: result.id, lat, lng });
            }
          } else {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (token) {
              await fetch(`${SOS_API_URL}/api/sos/alert`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ lat, lng, ride_id: rideId }),
              }).catch(() => {});
            }
          }
        } catch {
          // Non-blocking
        }
        logger.info("[SOS] alert fired", { lat, lng, contact: contact.number });
        startCooldown();
      } catch (err) {
        logger.error("[SOS] error", err);
      } finally {
        setSending(false);
      }
    },
    [sending, rideId, startCooldown],
  );

  const handleSosDismiss = useCallback(() => {
    setSosVisible(false);
    setQueued(false);
  }, []);

  const isCooldownActive = cooldownRemaining > 0;

  // Admin gets hamburger only — no SOS
  const showSos = role !== "admin";

  return (
    <>
      {/* ── Hamburger (top-left) ── */}
      <View
        style={[
          styles.hamburgerContainer,
          {
            top: insets.top + spacing.sm,
            left: spacing.lg,
          },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => setMenuOpen(true)}
          style={[styles.hamburgerFab, { backgroundColor: fabBg, borderColor: fabBorder }]}
          hitSlop={12}
        >
          <Ionicons name="menu" size={20} color={textPrimary} />
        </Pressable>
      </View>

      {/* ── SOS (bottom-right) ── */}
      {showSos && (
        <View
          style={[
            styles.sosContainer,
            {
              bottom: insets.bottom + spacing["2xl"],
              right: spacing.lg,
            },
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={handleSosOpen}
            disabled={isCooldownActive}
            activeOpacity={0.8}
            style={[
              styles.sosFab,
              {
                backgroundColor: isCooldownActive
                  ? isDark ? colors.textDisabledDark : colors.textDisabledLight
                  : colors.danger,
              },
            ]}
          >
            {cooldownRemaining > 0 ? (
              <Text style={styles.sosCountdown}>{cooldownRemaining}</Text>
            ) : (
              <Ionicons name="shield" size={28} color={colors.white} />
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Menu Drawer ── */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: overlayBg }]}
          onPress={() => setMenuOpen(false)}
        >
          <View
            style={[styles.drawer, { backgroundColor: surfaceBg }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.drawerHeader}>
              <Text style={[styles.drawerTitle, { color: textPrimary }]}>
                Navigation
              </Text>
              <Pressable onPress={() => setMenuOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.drawerScroll}
              contentContainerStyle={styles.drawerScrollContent}
            >
              {groupOrder.map((group) => {
                const groupItems = grouped[group];
                if (!groupItems?.length) return null;
                return (
                  <View key={group} style={styles.navGroup}>
                    <Text style={[styles.navGroupTitle, { color: textMuted }]}>
                      {group}
                    </Text>
                    {groupItems.map((item) => {
                      const isActive =
                        pathname === item.route ||
                        pathname === item.route.replace("/index", "");
                      return (
                        <Pressable
                          key={item.route}
                          onPress={() => navigateTo(item.route)}
                          style={[
                            styles.navItem,
                            isActive && { backgroundColor: activeBg },
                          ]}
                        >
                          <Ionicons
                            name={item.icon}
                            size={20}
                            color={isActive ? activeText : textSecondary}
                          />
                          <Text
                            style={[
                              styles.navItemLabel,
                              { color: isActive ? activeText : textSecondary },
                              isActive && styles.navItemLabelActive,
                            ]}
                          >
                            {item.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* ── SOS Contact Sheet ── */}
      <Modal
        visible={sosVisible}
        transparent
        animationType="slide"
        onRequestClose={handleSosDismiss}
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: overlayBg }]}
          onPress={handleSosDismiss}
        >
          <View
            style={[styles.sosSheet, { backgroundColor: surfaceBg, paddingBottom: insets.bottom + spacing.lg }]}
            onStartShouldSetResponder={() => true}
          >
            {/* Drag handle */}
            <View style={[styles.dragHandle, { backgroundColor: borderColor }]} />

            <View style={styles.sosSheetHeader}>
              <Ionicons name="shield" size={24} color={colors.danger} />
              <Text style={[styles.sosSheetTitle, { color: textPrimary }]}>
                Emergency Contacts
              </Text>
            </View>

            {sosLoading ? (
              <ActivityIndicator size="large" color={colors.danger} />
            ) : contacts.length === 0 ? (
              <Text
                style={[
                  styles.sosEmpty,
                  { color: textSecondary },
                ]}
              >
                No emergency contacts configured.
              </Text>
            ) : (
              <FlatList
                data={contacts}
                keyExtractor={(_, index) => index.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => handleSosSelect(item)}
                    disabled={sending}
                    activeOpacity={0.7}
                    style={styles.sosContactRow}
                  >
                    <View style={styles.sosContactIcon}>
                      <Ionicons name="call" size={20} color={colors.white} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sosContactName, { color: textPrimary }]}>
                        {item.label}
                      </Text>
                      <Text style={[styles.sosContactNumber, { color: textSecondary }]}>
                        {item.number}
                      </Text>
                    </View>
                    {sending ? (
                      <ActivityIndicator size="small" color={colors.danger} />
                    ) : (
                      <Ionicons name="chevron-forward" size={24} color={textSecondary} />
                    )}
                  </TouchableOpacity>
                )}
              />
            )}

            {queued && (
              <View style={styles.sosQueuedBanner}>
                <Ionicons name="cloud-offline-outline" size={16} color={colors.amber} style={{ marginRight: spacing.xs }} />
                <Text style={styles.sosQueuedText}>
                  Alert queued — will send when online
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleSosDismiss}
              disabled={sending}
              activeOpacity={0.7}
              style={[styles.sosCancelButton, { borderColor }]}
            >
              <Text style={[styles.sosCancelText, { color: textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Hamburger
  hamburgerContainer: {
    position: "absolute",
    zIndex: 999,
    elevation: 999,
    pointerEvents: "box-none",
  },
  hamburgerFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },

  // SOS
  sosContainer: {
    position: "absolute",
    zIndex: 999,
    elevation: 999,
    pointerEvents: "box-none",
  },
  sosFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  sosCountdown: {
    color: colors.white,
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
    fontVariant: ["tabular-nums"],
  },

  // Backdrop
  backdrop: {
    flex: 1,
  },

  // Menu drawer
  drawer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "70%",
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.2)",
  },
  drawerTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
  },
  drawerScroll: {
    flex: 1,
  },
  drawerScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: 40,
  },
  navGroup: {
    marginBottom: 16,
  },
  navGroupTitle: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  navItemLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    flex: 1,
  },
  navItemLabelActive: {
    fontFamily: "Jakarta-SemiBold",
  },

  // SOS sheet
  sosSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    maxHeight: 400,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  sosSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  sosSheetTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
    marginLeft: spacing.sm,
  },
  sosEmpty: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
  sosContactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.primaryLight,
    marginBottom: spacing.sm,
  },
  sosContactIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.danger,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  sosContactName: {
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
  },
  sosContactNumber: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
  },
  sosQueuedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.amberLight,
  },
  sosQueuedText: {
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
    color: colors.amber,
  },
  sosCancelButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: "center",
  },
  sosCancelText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
});
