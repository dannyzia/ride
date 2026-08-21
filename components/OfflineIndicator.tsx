import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";

// Offline bars are always-dark by convention (matches every major ride app) —
// the charcoal surface reads as a system-level warning in both themes.
const BAR_BG = colors.bgDark;

/**
 * §8.2 network status bar ("All screens"). Mount once per tab layout:
 * subscribes to NetInfo and renders a slim always-dark banner below the
 * status bar while the device is offline. Slide-in animation on appear,
 * slide-out on reconnect. Informational only — never blocks touches
 * (pointerEvents="none").
 */
const OfflineIndicator = () => {
  const insets = useSafeAreaInsets();
  const [isOffline, setIsOffline] = useState(false);
  const slideAnim = useRef(new Animated.Value(-50)).current;
  const prevOffline = useRef(false);

  useEffect(() => {
    let active = true;
    NetInfo.fetch().then((state) => {
      if (active) setIsOffline(state.isConnected === false);
    });
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isOffline && !prevOffline.current) {
      // Slide in
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    } else if (!isOffline && prevOffline.current) {
      // Slide out
      Animated.timing(slideAnim, {
        toValue: -50,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
    prevOffline.current = isOffline;
  }, [isOffline, slideAnim]);

  if (!isOffline) return null;

  return (
    <Animated.View
      style={[styles.bar, { top: insets.top, transform: [{ translateY: slideAnim }] }]}
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="cloud-offline-outline" size={15} color={colors.white} />
      <Text style={styles.text}>You&apos;re offline — check your connection</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 16,
    backgroundColor: BAR_BG,
    zIndex: 1000,
    elevation: 6,
  },
  text: {
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
    color: colors.white,
  },
});

export default OfflineIndicator;
