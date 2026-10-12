/**
 * Fleet Owner onboarding wizard (§2d) — register screen d.
 *
 * Business profile + trade-license document → the account is created with the
 * fleet PENDING; the admin queue's approval mints the OWNER membership and
 * activates the fleet (§7 + lib/roleVerification). Also reachable from
 * Settings → Add a role (mode=addRole) for an EXISTING account (R9).
 */
import { useState, useEffect } from "react";
import { Text, TextInput, ScrollView, ActivityIndicator, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsDark } from "@/lib/useAppearance";
import CustomButton from "@/components/CustomButton";
import DocumentUploadCard from "@/components/DocumentUploadCard";

export default function RegisterFleetOwnerScreen() {
  const params = useLocalSearchParams<{
    phone?: string;
    name?: string;
    password?: string;
    mode?: string;
    resubmit?: string;
  }>();
  const mode = params.mode === "addRole" ? "addRole" : "register";
  const { t } = useTranslation();
  const isDark = useIsDark();

  const [fleetName, setFleetName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");

  // F-03 prefilled resubmit: seed the applicant's prior answers (best-effort).
  useEffect(() => {
    if (params.resubmit !== "1") return;
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
        const res = await fetch(`${API_URL}/api/user/roles`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        const data = await res.json();
        const mine = (data.roles ?? []).find((r: { role: string }) => r.role === "fleet_owner");
        const p = mine?.prefill;
        if (!p) return;
        if (p.fleet_name) setFleetName(p.fleet_name);
        if (p.business_name) setBusinessName(p.business_name);
        if (p.trade_license_number) setLicenseNumber(p.trade_license_number);
      } catch {
        /* prefill is best-effort */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.resubmit]);
  const [licenseUrl, setLicenseUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const canSubmit = fleetName.trim().length >= 2 && !!licenseUrl;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      const fleet = {
        fleet_name: fleetName.trim(),
        ...(businessName.trim() ? { business_name: businessName.trim() } : {}),
        ...(licenseNumber.trim() ? { trade_license_number: licenseNumber.trim() } : {}),
        trade_license_url: licenseUrl,
      };
      const url = mode === "addRole" ? `${API_URL}/api/user/roles` : `${API_URL}/api/register`;
      const body =
        mode === "addRole"
          ? { role: "fleet_owner", fleet }
          : { phone: params.phone, name: params.name, password: params.password, role: "fleet_owner", fleet };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || t("auth.fleet_owner.submit_failed"));
        return;
      }
      if (mode === "addRole") {
        Alert.alert(t("auth.fleet_owner.added_title"), t("auth.fleet_owner.added_body"));
        router.back();
      } else {
        router.replace("/(main)/(customer)/home");
      }
    } catch (e) {
      logger.error("[register-fleet-owner] submit failed", e);
      setError(t("auth.fleet_owner.submit_failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text className="text-[24px] font-JakartaBold mb-1" style={{ color: textPrimary }}>
          {t("auth.fleet_owner.title")}
        </Text>
        <Text className="text-[13px] font-JakartaBold mb-5" style={{ color: textSecondary }}>
          {t("auth.fleet_owner.subtitle")}
        </Text>

        <TextInput
          value={fleetName}
          onChangeText={setFleetName}
          placeholder={t("auth.fleet_owner.fleet_name")}
          placeholderTextColor={textSecondary}
          className="rounded-xl border px-4 py-3 mb-3 text-[15px]"
          style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
         
         testID="register-fleet-owner.set-fleet-name"/>
        <TextInput
          value={businessName}
          onChangeText={setBusinessName}
          placeholder={t("auth.fleet_owner.business_name")}
          placeholderTextColor={textSecondary}
          className="rounded-xl border px-4 py-3 mb-3 text-[15px]"
          style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
         
         testID="register-fleet-owner.set-business-name"/>
        <TextInput
          value={licenseNumber}
          onChangeText={setLicenseNumber}
          placeholder={t("auth.fleet_owner.license_number")}
          placeholderTextColor={textSecondary}
          className="rounded-xl border px-4 py-3 mb-3 text-[15px]"
          style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
         
         testID="register-fleet-owner.set-license-number"/>

        <DocumentUploadCard
          docType="trade_license"
          label={t("auth.fleet_owner.trade_license")}
          folder="documents"
          onUploadComplete={(url) => setLicenseUrl(url)}
          testID="register-fleet-owner.upload-trade-license"
        />

        {error ? (
          <Text className="text-[13px] mb-2" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <CustomButton
            title={t("auth.fleet_owner.submit")}
            onPress={submit}
            disabled={!canSubmit}
           
           testID="register-fleet-owner.submit"/>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
