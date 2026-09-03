import { useEffect } from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

export default function LegacyHomeRedirect() {
  const { t } = useTranslation();  useEffect(() => { router.replace("/(main)/(rider)"); }, []);
  return null;
}
