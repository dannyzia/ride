import { Slot, usePathname } from "expo-router";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { GlobalActionButtons } from "@/components/GlobalActionButtons";

/**
 * Root layout for all rider/driver screens.
 * Provides the floating hamburger (top-left) + SOS button (bottom-right)
 * across every screen — tab screens, stack screens, modals, everything.
 *
 * Role is derived from the current route path: /(main)/(customer) → customer,
 * /(main)/(rider) → driver. No auth store dependency — works instantly.
 */
export default function MainLayout() {
  const pathname = usePathname();

  // Derive role from route path
  const role = pathname.startsWith("/(main)/(rider)") ? "driver" : "customer";

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Slot />
        <GlobalActionButtons role={role} />
      </View>
    </GestureHandlerRootView>
  );
}
