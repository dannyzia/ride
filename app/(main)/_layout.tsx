import { Stack } from "expo-router";
import { View } from "react-native";
import GlobalActionButtons from "@/components/GlobalActionButtons";
import RideSurfaceGuard from "@/components/RideSurfaceGuard";

/**
 * Root layout for all rider/driver screens.
 * GlobalActionButtons (hamburger stacked ABOVE the SOS button, both
 * bottom-right) renders as a sibling of the Stack so every screen under
 * app/(main)/(customer)/ and app/(main)/(rider)/ inherits both buttons.
 * The flex:1 View wrapper is required for absolute-positioned siblings.
 *
 * RideSurfaceGuard (Node launch Stage 3, hide inventory #13/#14/#20-#23)
 * mounts once here — while the flag hides ride, any ride/driver route under
 * (main) redirects to the services hub (flag on ⇒ no-op).
 */
export default function MainLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      <RideSurfaceGuard />
      <GlobalActionButtons />
    </View>
  );
}
