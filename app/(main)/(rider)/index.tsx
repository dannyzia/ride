import { Redirect } from "expo-router";

export default function DriverRootRedirect() {
  return <Redirect href="/(main)/(rider)/(tabs)" />;
}
