import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Platform,
  FlatList,
  Linking,
  Alert,
  ActivityIndicator,
  PanResponder,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname, useSegments } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { API_URL } from "@/lib/config";
import { colors } from "@/theme/goRide";
import * as Location from "expo-location";
import { logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";
import { enqueueSosAlert } from "@/lib/sosQueue";
import NetInfo from "@react-native-community/netinfo";

// ─── Role Detection ───────────────────────────────────────────────

type UserRole = "customer" | "driver" | "admin" | "none";

function useUserRole(): UserRole {
  // Widen the typed tuple the same way app/admin/_layout.tsx does — this
  // component is rendered from multiple layout depths.
  const segments = useSegments() as readonly string[];
  // Segments carry route-group literals ("(main)", "(customer)", ...) on
  // every platform — the same mechanism the root auth gate uses. usePathname
  // group formatting varies, so it is only used for drawer active-state.
  if (segments[0] === "admin") return "admin";
  if (segments[0] === "(main)") {
    if (segments[1] === "(rider)") return "driver";
    return "customer"; // (customer) is the default (main) child
  }
  return "none";
}

// ─── Nav Items ────────────────────────────────────────────────────

interface NavItem {
  route: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  group: string;
}

const CUSTOMER_ITEMS: NavItem[] = [
  { route: "/(main)/(customer)/services-hub", label: "Services Hub", icon: "grid", group: "Ride" },
  { route: "/(main)/(customer)/(tabs)/home/index", label: "Home", icon: "home", group: "Ride" },
  { route: "/(main)/(customer)/find-ride", label: "Book Ride", icon: "car", group: "Ride" },
  { route: "/(main)/(customer)/schedule-ride", label: "Schedule Ride", icon: "calendar", group: "Ride" },
  { route: "/(main)/(customer)/(tabs)/rides/index", label: "My Rides", icon: "time", group: "Activity" },
  { route: "/(main)/(customer)/(tabs)/inbox/index", label: "Inbox", icon: "mail", group: "Activity" },
  { route: "/(main)/(customer)/(tabs)/referral/index", label: "Referrals", icon: "people", group: "Activity" },
  { route: "/(main)/(customer)/(tabs)/profile/index", label: "Profile", icon: "person", group: "Account" },
  { route: "/(main)/(customer)/(tabs)/wallet/index", label: "Wallet", icon: "wallet", group: "Account" },
  { route: "/(main)/(customer)/(tabs)/settings/index", label: "Settings", icon: "settings", group: "Account" },
  { route: "/(main)/(customer)/apply-promos", label: "Promos", icon: "ticket", group: "Account" },
];

const DRIVER_ITEMS: NavItem[] = [
  { route: "/(main)/(rider)/(tabs)/index", label: "Home", icon: "home", group: "Main" },
  { route: "/(main)/(rider)/(tabs)/earning/index", label: "Earnings", icon: "cash", group: "Main" },
  { route: "/(main)/(rider)/(tabs)/activity/index", label: "Activity", icon: "time", group: "Main" },
  { route: "/(main)/(rider)/(tabs)/wallet/index", label: "Wallet", icon: "wallet", group: "Main" },
  { route: "/(main)/(rider)/(tabs)/profile/index", label: "Profile", icon: "person", group: "Account" },
  { route: "/(main)/(rider)/settings", label: "Settings", icon: "settings", group: "Account" },
  { route: "/(main)/(rider)/packages", label: "Packages", icon: "cube", group: "Programs" },
  { route: "/(main)/(rider)/incentives", label: "Incentives", icon: "trophy", group: "Programs" },
  { route: "/(main)/(rider)/call-ledger", label: "Call Ledger", icon: "clipboard", group: "Programs" },
  { route: "/(main)/(rider)/hotspot-map", label: "Hotspot Map", icon: "map", group: "Programs" },
  { route: "/(main)/(rider)/(tabs)/hotspot", label: "Hotspot", icon: "flame", group: "Programs" },
  { route: "/(main)/(rider)/documents", label: "Documents", icon: "document-text", group: "Compliance" },
  { route: "/(main)/(rider)/verification", label: "Verification", icon: "checkmark-circle", group: "Compliance" },
  { route: "/(main)/(rider)/vehicle-management", label: "Vehicles", icon: "car", group: "Compliance" },
];

const ADMIN_ITEMS: NavItem[] = [
  { route: "/admin", label: "Dashboard", icon: "speedometer", group: "Admin" },
  { route: "/admin/queue", label: "Driver Queue", icon: "people", group: "Admin" },
  { route: "/admin/monitoring", label: "Monitoring", icon: "pulse", group: "Admin" },
  { route: "/admin/platform-config", label: "Platform Config", icon: "cog", group: "Admin" },
  { route: "/admin/fare-config", label: "Fare Config", icon: "cash", group: "Admin" },
];

const GROUP_ORDER_CUSTOMER = ["Ride", "Activity", "Account"];
const GROUP_ORDER_DRIVER = ["Main", "Account", "Programs", "Compliance"];
const GROUP_ORDER_ADMIN = ["Admin"];

// ─── SOS ──────────────────────────────────────────────────────────

interface SOSContact {
  label: string;
  number: string;
}

// API base follows the app-wide resolver in lib/config.ts (dev LAN IP,
// emulator loopback, or EXPO_PUBLIC_SERVER_URL in production).
const SOS_API_URL = API_URL;
const SOS_COOLDOWN_SECONDS = 5;

// ─── Floating button stack geometry / drag ─────────────────────────
// Both buttons are the same size and sit in one draggable stack:
// hamburger ABOVE SOS with a fixed gap. The stack position is the
// top-left of the hamburger; dragging either button moves the pair.
const BTN_SIZE = 48;
const BTN_GAP = 12;
const EDGE_RIGHT = 16; // default distance from the right screen edge
const EDGE_BOTTOM = 24; // default distance from the bottom safe area
const DRAG_THRESHOLD = 10; // movement (px) before a touch becomes a drag
const DRAG_CLAMP = 8; // minimum distance from screen edges while dragging

// Survives remounts (customer ↔ driver ↔ admin layouts) within a session.
// Stored as an offset from the bottom-right corner, NOT an absolute
// top-left: an absolute position cached under different window metrics
// (nav-bar inset changes, rotation, taskbar appearance) can land off-screen
// and clip the SOS button behind system UI — the offset re-anchors itself.
let cachedStackOffset: { fromRight: number; fromBottom: number } | null = null;

// ─── Component ────────────────────────────────────────────────────

export default function GlobalActionButtons() {
  const role = useUserRole();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isDark = useIsDark();

  // ── Theme tokens (Pattern A) ──
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textMuted = isDark ? colors.textDisabledDark : colors.textDisabledLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const overlayBg = isDark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.4)";
  const activeBg = isDark ? "rgba(12,194,95,0.15)" : colors.primaryLight;
  const activeText = colors.primary;
  const fabBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const fabBorder = isDark ? colors.borderDark : colors.borderLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  // ── Hamburger state ──
  const [menuOpen, setMenuOpen] = useState(false);

  // ── SOS state ──
  const [sosOpen, setSosOpen] = useState(false);
  const [sosContacts, setSosContacts] = useState<SOSContact[]>([]);
  const [sosLoading, setSosLoading] = useState(false);
  const [sosSending, setSosSending] = useState(false);
  const [sosQueued, setSosQueued] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // ── All hooks MUST be before any early return (rules-of-hooks) ──

  // ── Draggable stack position (hamburger top-left anchor) ──
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const hasSos = role !== "admin";
  const stackHeight = hasSos ? BTN_SIZE * 2 + BTN_GAP : BTN_SIZE;

  // The buttons must clear the system nav bar (Android 3-button / gesture).
  // SafeAreaProvider is wired at app root, but insets.bottom is unreliable
  // on Android (edge-to-edge gating, gesture vs 3-button, pre-15). 64dp
  // covers a Pixel-6a-style 3-button nav bar with 8dp+ breathing room.
  const bottomInset = Math.max(insets.bottom, Platform.OS === "android" ? 64 : 0);

  const clampPos = useCallback(
    (x: number, y: number) => {
      const maxX = Math.max(windowWidth - BTN_SIZE - DRAG_CLAMP, DRAG_CLAMP);
      const maxY = Math.max(
        windowHeight - bottomInset - stackHeight - DRAG_CLAMP,
        insets.top + DRAG_CLAMP,
      );
      return {
        x: Math.min(Math.max(x, DRAG_CLAMP), maxX),
        y: Math.min(Math.max(y, insets.top + DRAG_CLAMP), maxY),
      };
    },
    [windowWidth, windowHeight, insets.top, bottomInset, stackHeight],
  );

  const [stackPos, setStackPos] = useState(() => {
    if (cachedStackOffset) {
      return {
        x: windowWidth - cachedStackOffset.fromRight - BTN_SIZE,
        y: windowHeight - cachedStackOffset.fromBottom - stackHeight,
      };
    }
    return {
      x: windowWidth - EDGE_RIGHT - BTN_SIZE,
      y: windowHeight - bottomInset - EDGE_BOTTOM - stackHeight,
    };
  });

  // Keep a ref mirror + module cache current for the PanResponder closures
  // and for the next mount of this component.
  const stackPosRef = useRef(stackPos);
  const clampPosRef = useRef(clampPos);
  useEffect(() => {
    stackPosRef.current = stackPos;
    cachedStackOffset = {
      fromRight: windowWidth - stackPos.x - BTN_SIZE,
      fromBottom: windowHeight - stackPos.y - stackHeight,
    };
  }, [stackPos, windowWidth, windowHeight, stackHeight]);
  useEffect(() => {
    clampPosRef.current = clampPos;
  }, [clampPos]);

  // Re-clamp when the window/insets change (rotation, mount with a cached
  // position from a differently-sized stack). Layout effect so an
  // out-of-bounds cached position is corrected before the first paint —
  // otherwise the stack flashes in (and can stay) behind the nav bar.
  useLayoutEffect(() => {
    setStackPos((p) => clampPos(p.x, p.y));
  }, [clampPos]);

  // Drag: claim the gesture (capture phase) only after real movement, so
  // plain taps still reach the child Pressable/TouchableOpacity press.
  const dragStart = useRef({ x: 0, y: 0 });
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        Math.abs(g.dx) > DRAG_THRESHOLD || Math.abs(g.dy) > DRAG_THRESHOLD,
      onPanResponderGrant: () => {
        dragStart.current = { ...stackPosRef.current };
      },
      onPanResponderMove: (_e, g) => {
        const next = clampPosRef.current(
          dragStart.current.x + g.dx,
          dragStart.current.y + g.dy,
        );
        setStackPos(next);
      },
    }),
  ).current;

  // ── Nav items by role ──
  const navItems = useMemo(() => {
    if (role === "customer") return CUSTOMER_ITEMS;
    if (role === "driver") return DRIVER_ITEMS;
    if (role === "admin") return ADMIN_ITEMS;
    return [];
  }, [role]);

  const groupOrder = useMemo(() => {
    if (role === "customer") return GROUP_ORDER_CUSTOMER;
    if (role === "driver") return GROUP_ORDER_DRIVER;
    if (role === "admin") return GROUP_ORDER_ADMIN;
    return [];
  }, [role]);

  const grouped = useMemo(() => {
    return groupOrder.reduce<Record<string, NavItem[]>>((acc, group) => {
      acc[group] = navItems.filter((i) => i.group === group);
      return acc;
    }, {});
  }, [groupOrder, navItems]);

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
    setSosOpen(true);
    setSosLoading(true);
    try {
      const res = await fetch(`${SOS_API_URL}/api/sos/contacts`);
      if (res.ok) {
        const data = await res.json();
        setSosContacts(data.contacts ?? []);
      } else {
        setSosContacts([{ label: "National Emergency", number: "999" }]);
      }
    } catch {
      setSosContacts([{ label: "National Emergency", number: "999" }]);
    } finally {
      setSosLoading(false);
    }
  }, [cooldownRemaining]);

  const handleSosSelect = useCallback(
    async (contact: SOSContact) => {
      if (sosSending) return;
      setSosSending(true);
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
        setSosOpen(false);

        // Fire alert best-effort in background
        try {
          const net = await NetInfo.fetch();
          if (net.isConnected !== true) {
            const result = await enqueueSosAlert({ lat, lng });
            if (result.queued) {
              setSosQueued(true);
              logger.info("[SOS] alert queued (offline)", { id: result.id, lat, lng });
            }
          } else {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (token) {
              // T-1: /api/sos/alert is the canonical endpoint and serves BOTH
              // riders and drivers (a separate /api/driver/sos-alert route
              // does not exist).
              const endpoint = `${SOS_API_URL}/api/sos/alert`;
              await fetch(endpoint, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ lat, lng }),
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
        setSosSending(false);
      }
    },
    [sosSending, startCooldown],
  );

  const handleSosDismiss = useCallback(() => {
    setSosOpen(false);
    setSosQueued(false);
  }, []);

  // ── If no role, render nothing ──
  if (role === "none") return null;

  const isCooldownActive = cooldownRemaining > 0;
  const showSos = hasSos;

  // ── Menu title by role ──
  const menuTitle = role === "customer" ? "Menu" : role === "driver" ? "Driver Menu" : "Admin Menu";

  return (
    <>
      {/* ═══ HAMBURGER BUTTON (top of the draggable stack) ═══ */}
      <View
        {...panResponder.panHandlers}
        style={[styles.dragWrapper, { left: stackPos.x, top: stackPos.y }]}
      >
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          style={[
            styles.hamburgerBtn,
            {
              backgroundColor: fabBg,
              borderColor: fabBorder,
            },
          ]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="menu" size={24} color={textPrimary} />
        </Pressable>
      </View>

      {/* ═══ SOS BUTTON (bottom of the draggable stack, same 48dp size) ═══ */}
      {showSos && (
        <View
          {...panResponder.panHandlers}
          style={[
            styles.dragWrapper,
            { left: stackPos.x, top: stackPos.y + BTN_SIZE + BTN_GAP },
          ]}
        >
          <TouchableOpacity
            onPress={handleSosOpen}
            disabled={isCooldownActive}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Emergency SOS"
            style={[
              styles.sosBtn,
              {
                backgroundColor: isCooldownActive
                  ? isDark ? colors.textDisabledDark : colors.textDisabledLight
                  : colors.danger,
              },
            ]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            {cooldownRemaining > 0 ? (
              <Text style={styles.sosCountdown}>{cooldownRemaining}</Text>
            ) : (
              <Ionicons name="shield" size={24} color={colors.white} />
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ═══ HAMBURGER MENU MODAL ═══ */}
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
            <View style={[styles.drawerHeader, { borderBottomColor: borderColor }]}>
              <Text style={[styles.drawerTitle, { color: textPrimary }]}>
                {menuTitle}
              </Text>
              <Pressable onPress={() => setMenuOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={textSecondary} />
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
                            size={22}
                            color={isActive ? activeText : textSecondary}
                          />
                          <Text
                            style={[
                              styles.navItemLabel,
                              { color: isActive ? activeText : textSecondary },
                              isActive && { fontFamily: "Jakarta-SemiBold" },
                            ]}
                          >
                            {item.label}
                          </Text>
                          {isActive && (
                            <Ionicons name="chevron-forward" size={18} color={activeText} />
                          )}
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

      {/* ═══ SOS BOTTOM SHEET ═══ */}
      <Modal
        visible={sosOpen}
        transparent
        animationType="slide"
        onRequestClose={handleSosDismiss}
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: overlayBg }]}
          onPress={handleSosDismiss}
        >
          <View
            style={[
              styles.sosSheet,
              {
                backgroundColor: surfaceBg,
                paddingBottom: insets.bottom + 24,
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={[styles.dragHandle, { backgroundColor: borderColor }]} />

            <View style={styles.sosTitleRow}>
              <View style={styles.sosIconCircle}>
                <Ionicons name="shield" size={24} color={colors.white} />
              </View>
              <Text style={[styles.sosTitle, { color: textPrimary }]}>
                Emergency Contacts
              </Text>
            </View>

            {sosLoading ? (
              <ActivityIndicator size="large" color={colors.danger} style={{ marginVertical: 32 }} />
            ) : sosContacts.length === 0 ? (
              <Text style={[styles.sosEmpty, { color: textSecondary }]}>
                No emergency contacts configured.
              </Text>
            ) : (
              <FlatList
                data={sosContacts}
                keyExtractor={(_, index) => index.toString()}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => handleSosSelect(item)}
                    disabled={sosSending}
                    activeOpacity={0.7}
                    style={[
                      styles.sosContactRow,
                      { backgroundColor: isDark ? "rgba(227,29,28,0.10)" : colors.primaryLight },
                    ]}
                  >
                    <View style={styles.sosContactIcon}>
                      <Ionicons name="call" size={18} color={colors.white} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sosContactLabel, { color: textPrimary }]}>
                        {item.label}
                      </Text>
                      <Text style={[styles.sosContactNumber, { color: textSecondary }]}>
                        {item.number}
                      </Text>
                    </View>
                    {sosSending ? (
                      <ActivityIndicator size="small" color={colors.danger} />
                    ) : (
                      <Ionicons name="chevron-forward" size={20} color={textSecondary} />
                    )}
                  </TouchableOpacity>
                )}
              />
            )}

            {sosQueued && (
              <View style={styles.sosQueuedBanner}>
                <Ionicons name="cloud-offline-outline" size={16} color={colors.amber} style={{ marginRight: 4 }} />
                <Text style={styles.sosQueuedText}>
                  Alert queued — will send when online
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleSosDismiss}
              disabled={sosSending}
              activeOpacity={0.7}
              style={[styles.sosCancelBtn, { borderColor }]}
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
  // ── Draggable wrapper (one per button, absolute-positioned) ──
  // Both buttons are 48x48 (owner-ruling: equal size). Hardcoded so the
  // spec value is visible at the style level and cannot drift via BTN_SIZE.
  dragWrapper: {
    position: "absolute",
    width: 48,
    height: 48,
    zIndex: 999,
  },

  // ── Hamburger Button (48x48) ──
  hamburgerBtn: {
    width: "100%",
    height: "100%",
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 999,
  },

  // ── SOS Button (48x48, same as hamburger) ──
  sosBtn: {
    width: "100%",
    height: "100%",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  sosCountdown: {
    color: colors.white,
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
    fontVariant: ["tabular-nums"],
  },

  // ── Backdrop ──
  backdrop: {
    flex: 1,
  },

  // ── Drawer ──
  drawer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "75%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 20,
  },
  drawerScroll: {
    flex: 1,
  },
  drawerScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  navGroup: {
    marginBottom: 20,
  },
  navGroupTitle: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 2,
  },
  navItemLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 15,
    flex: 1,
  },

  // ── SOS Sheet ──
  sosSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "60%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  sosTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  sosIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.danger,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  sosTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 20,
  },
  sosEmpty: {
    fontFamily: "Jakarta-Regular",
    fontSize: 15,
    textAlign: "center",
    paddingVertical: 32,
  },
  sosContactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginBottom: 10,
  },
  sosContactIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.danger,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  sosContactLabel: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 16,
  },
  sosContactNumber: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    marginTop: 2,
  },
  sosQueuedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.amberLight,
  },
  sosQueuedText: {
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
    color: colors.amber,
  },
  sosCancelBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  sosCancelText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
});
