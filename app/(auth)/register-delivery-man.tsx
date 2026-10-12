/**
 * Delivery Man onboarding wizard (§2e) — register screen e.
 *
 * NID + driving license (+ optional vehicle note) → the account is created
 * with the courier capability PENDING until the admin queue approves it (§7).
 * The Delivery Man is a full role (§0 #5): they deliver every vertical, and
 * eligibility/ranking for the dispatch chain lands with S6.
 * Also reachable from Settings → Add a role (mode=addRole) (R9).
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

export default function RegisterDeliveryManScreen() {
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

  const [nidUrl, setNidUrl] = useState<string | null>(null);
  const [licenseUrl, setLicenseUrl] = useState<string | null>(null);
  const [vehicleNote, setVehicleNote] = useState("");

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
        const mine = (data.roles ?? []).find((r: { role: string }) => r.role === "delivery_man");
        const p = mine?.prefill;
        if (!p) return;
        if (p.vehicle_note) setVehicleNote(p.vehicle_note);
      } catch {
        /* prefill is best-effort */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.resubmit]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const canSubmit = !!nidUrl && !!licenseUrl;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      const delivery = {
        nid_url: nidUrl,
        license_url: licenseUrl,
        ...(vehicleNote.trim() ? { vehicle_note: vehicleNote.trim() } : {}),
      };
      const url = mode === "addRole" ? `${API_URL}/api/user/roles` : `${API_URL}/api/register`;
      const body =
        mode === "addRole"
          ? { role: "delivery_man", delivery }
          : {
              phone: params.phone,
              name: params.name,
              password: params.password,
              role: "delivery_man",
              delivery,
            };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || t("auth.delivery_man.submit_failed"));
        return;
      }
      if (mode === "addRole") {
        Alert.alert(t("auth.delivery_man.added_title"), t("auth.delivery_man.added_body"));
        router.back();
      } else {
        router.replace("/(main)/(customer)/home");
      }
    } catch (e) {
      logger.error("[register-delivery-man] submit failed", e);
      setError(t("auth.delivery_man.submit_failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text className="text-[24px] font-JakartaBold mb-1" style={{ color: textPrimary }}>
          {t("auth.delivery_man.title")}
        </Text>
        <Text className="text-[13px] font-JakartaBold mb-5" style={{ color: textSecondary }}>
          {t("auth.delivery_man.subtitle")}
        </Text>

        <DocumentUploadCard
          docType="nid"
          label={t("auth.delivery_man.nid")}
          folder="documents"
          onUploadComplete={(url) => setNidUrl(url)}
          testID="register-delivery-man.upload-nid"
        />
        <DocumentUploadCard
          docType="driving_license"
          label={t("auth.delivery_man.driving_license")}
          folder="documents"
          onUploadComplete={(url) => setLicenseUrl(url)}
          testID="register-delivery-man.upload-license"
        />

        <TextInput
          value={vehicleNote}
          onChangeText={setVehicleNote}
          placeholder={t("auth.delivery_man.vehicle_note")}
          placeholderTextColor={textSecondary}
          className="rounded-xl border px-4 py-3 mb-3 text-[15px]"
          style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
         
         testID="register-delivery-man.set-vehicle-note"/>

        {error ? (
          <Text className="text-[13px] mb-2" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <CustomButton
            title={t("auth.delivery_man.submit")}
            onPress={submit}
            disabled={!canSubmit}
           
           testID="register-delivery-man.submit"/>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
