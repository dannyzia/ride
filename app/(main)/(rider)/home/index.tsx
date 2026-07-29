import { useEffect } from "react";
import { router } from "expo-router";

export default function LegacyHomeRedirect() {
  useEffect(() => { router.replace("/(main)/(rider)"); }, []);
  return null;
}
