import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

// Offline bars are always-dark by convention (matches every major ride app) —
// the charcoal surface reads as a system-level warning in both themes.
const BAR_BG = "#111827";

/**
 * §8.2 network status bar ("All screens"). Mount once per tab layout:
 * subscribes to NetInfo and renders a slim always-dark banner below the
 * status bar while the device is offline. Informational only — never blocks
 * touches (pointerEvents="none"), auto-hides on reconnect.
 */
const OfflineIndicator = () => {
  const insets = useSafeAreaInsets();
  const [isOffline, setIsOffline] = useState(false);

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

  if (!isOffline) return null;

  return (
    <View
      style={[styles.bar, { top: insets.top }]}
      pointerEvents="none"
      accessibilityRole="alert"
    >
      <Ionicons name="cloud-offline-outline" size={15} color="#FFFFFF" />
      <Text style={styles.text}>You&apos;re offline — check your connection</Text>
    </View>
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
    color: "#FFFFFF",
  },
});

export default OfflineIndicator;
