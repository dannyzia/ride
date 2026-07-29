import { Stack } from "expo-router";
import DriverStatusGuard from "@/components/auth/DriverStatusGuard";

export default function DriverRootLayout() {
  return (
    <DriverStatusGuard>
      <Stack screenOptions={{ headerShown: false }} />
    </DriverStatusGuard>
  );
}
