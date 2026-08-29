import { Slot } from "expo-router";
import { View } from "react-native";
import GlobalActionButtons from "@/components/GlobalActionButtons";

/**
 * Root layout for all rider/driver screens.
 * Provides hamburger (bottom-right, above SOS) + SOS (bottom-right)
 * across every screen — tab screens, stack screens, modals, everything.
 * Role detected internally via usePathname.
 */
export default function MainLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Slot />
      <GlobalActionButtons />
    </View>
  );
}
