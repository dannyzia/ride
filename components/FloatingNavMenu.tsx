import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  Platform,
  Dimensions,
} from "react-native";
import { AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import { colors } from "@/theme/goRide";
import { router, usePathname } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface NavItem {
  route: string;
  label: string;
  icon: IconName;
  group: string;
}

const CUSTOMER_ITEMS: NavItem[] = [
  { route: "/(main)/(customer)/(tabs)/home/index", label: "Home", icon: "home", group: "Ride" },
  { route: "/(main)/(customer)/find-ride", label: "Book Ride", icon: "car", group: "Ride" },
  { route: "/(main)/(customer)/schedule-ride", label: "Schedule Ride", icon: "calendar-clock", group: "Ride" },
  { route: "/(main)/(customer)/(tabs)/rides/index", label: "Activity / Rides", icon: "history", group: "Activity" },
  { route: "/(main)/(customer)/(tabs)/wallet/index", label: "Wallet", icon: "wallet", group: "Activity" },
  { route: "/(main)/(customer)/(tabs)/chat/index", label: "Chat", icon: "message-text", group: "Activity" },
  { route: "/(main)/(customer)/(tabs)/profile/index", label: "Account / Profile", icon: "account", group: "Account" },
  { route: "/(main)/(customer)/(tabs)/settings/index", label: "Settings", icon: "cog", group: "Account" },
  { route: "/(main)/(customer)/apply-promos", label: "Apply Promos", icon: "ticket-percent", group: "Account" },
  { route: "/(main)/(customer)/add-tip", label: "Add Tip", icon: "hand-coin", group: "Account" },
  { route: "/(main)/(customer)/emergency-sos", label: "Emergency SOS", icon: "alert-circle", group: "Safety" },
];

const DRIVER_ITEMS: NavItem[] = [
  { route: "/(main)/(rider)/(tabs)/index", label: "Home (Go Online/Offline)", icon: "home", group: "Main" },
  { route: "/(main)/(rider)/(tabs)/earning/index", label: "Earning", icon: "cash", group: "Main" },
  { route: "/(main)/(rider)/(tabs)/activity/index", label: "Activity", icon: "history", group: "Main" },
  { route: "/(main)/(rider)/(tabs)/wallet/index", label: "Wallet", icon: "wallet", group: "Main" },
  { route: "/(main)/(rider)/(tabs)/profile/index", label: "Profile", icon: "account", group: "Account" },
  { route: "/(main)/(rider)/(tabs)/settings/index", label: "Settings", icon: "cog", group: "Account" },
  { route: "/(main)/(rider)/packages", label: "Packages", icon: "package-variant-closed", group: "Programs" },
  { route: "/(main)/(rider)/incentives", label: "Incentives", icon: "trophy", group: "Programs" },
  { route: "/(main)/(rider)/call-ledger", label: "Call Ledger", icon: "clipboard-text", group: "Programs" },
  { route: "/(main)/(rider)/documents", label: "Documents", icon: "file-document", group: "Compliance" },
  { route: "/(main)/(rider)/verification", label: "Verification", icon: "check-decagram", group: "Compliance" },
];

const GROUP_ORDER_CUSTOMER = ["Ride", "Activity", "Account", "Safety"];
const GROUP_ORDER_DRIVER = ["Main", "Account", "Programs", "Compliance"];

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const FAB_SIZE = 48;
const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8 };

interface FloatingNavMenuProps {
  variant: "customer" | "driver";
}

export function FloatingNavMenu({ variant }: FloatingNavMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const isDark = useIsDark();

  // Draggable position — starts bottom-right
  const translateX = useSharedValue(SCREEN_W - FAB_SIZE - 20);
  const translateY = useSharedValue(SCREEN_H - FAB_SIZE - (Platform.OS === "ios" ? 120 : 100));
  const contextX = useSharedValue(0);
  const contextY = useSharedValue(0);

  const items = variant === "customer" ? CUSTOMER_ITEMS : DRIVER_ITEMS;
  const groupOrder = variant === "customer" ? GROUP_ORDER_CUSTOMER : GROUP_ORDER_DRIVER;

  const grouped = groupOrder.reduce<Record<string, NavItem[]>>((acc, group) => {
    acc[group] = items.filter((i) => i.group === group);
    return acc;
  }, {});

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textMuted = isDark ? colors.textDisabledDark : colors.textDisabledLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const overlayBg = isDark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.4)";
  const activeBg = isDark ? "rgba(12,194,95,0.10)" : colors.primaryLight;
  const activeText = colors.primary;
  const fabBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const fabBorder = isDark ? colors.borderDark : colors.borderLight;

  // Pan gesture for dragging
  const panGesture = Gesture.Pan()
    .onStart(() => {
      contextX.value = translateX.value;
      contextY.value = translateY.value;
    })
    .onUpdate((event) => {
      let newX = contextX.value + event.translationX;
      let newY = contextY.value + event.translationY;

      // Constrain to screen bounds
      newX = Math.max(0, Math.min(newX, SCREEN_W - FAB_SIZE));
      newY = Math.max(40, Math.min(newY, SCREEN_H - FAB_SIZE - 20));

      translateX.value = newX;
      translateY.value = newY;
    })
    .onEnd(() => {
      // Snap to nearest edge (left or right) for clean UX
      const centerX = translateX.value + FAB_SIZE / 2;
      const snapToLeft = centerX < SCREEN_W / 2;
      const targetX = snapToLeft ? 8 : SCREEN_W - FAB_SIZE - 8;

      translateX.value = withSpring(targetX, SPRING_CONFIG);
      translateY.value = withSpring(
        Math.max(60, Math.min(translateY.value, SCREEN_H - FAB_SIZE - 80)),
        SPRING_CONFIG
      );
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const navigateTo = useCallback((route: string) => {
    setIsOpen(false);
    if (route.includes("(tabs)")) {
      router.navigate(route as any);
    } else {
      router.push(route as any);
    }
  }, []);

  return (
    <>
      {/* Draggable FAB */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.fabContainer, animatedStyle]}>
          <Pressable
            onPress={() => setIsOpen(true)}
            style={[styles.fab, { backgroundColor: fabBg, borderColor: fabBorder }]}
            hitSlop={12}
          >
            <AntDesign name="bars" size={20} color={textPrimary} />
          </Pressable>
        </Animated.View>
      </GestureDetector>

      {/* Menu Modal */}
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: overlayBg }]}
          onPress={() => setIsOpen(false)}
        >
          <View
            style={[styles.drawer, { backgroundColor: surfaceBg }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.drawerHeader}>
              <Text style={[styles.drawerTitle, { color: textPrimary }]}>
                Navigation
              </Text>
              <Pressable onPress={() => setIsOpen(false)} hitSlop={8}>
                <AntDesign name="close" size={20} color={textSecondary} />
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
                      const isActive = pathname === item.route ||
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
                          <MaterialCommunityIcons
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
    </>
  );
}

const styles = StyleSheet.create({
  fabContainer: {
    position: "absolute",
    zIndex: 999,
    elevation: 999,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  backdrop: {
    flex: 1,
  },
  drawer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "70%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    borderRadius: 10,
  },
  navItemLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    flex: 1,
  },
  navItemLabelActive: {
    fontFamily: "Jakarta-SemiBold",
  },
});
