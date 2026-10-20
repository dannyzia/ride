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
import { getRegistrationHandoff, clearRegistrationHandoff } from "@/lib/registrationHandoff";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsDark } from "@/lib/useAppearance";
import CustomButton from "@/components/CustomButton";
import DocumentUploadCard from "@/components/DocumentUploadCard";

export default function RegisterDeliveryManScreen() {
  // M-6 (§16): phone stays a param (not a secret); name/password arrive via
  // the in-memory registrationHandoff and never in the URL.
  const params = useLocalSearchParams<{
    phone?: string;
    role?: string;
    mode?: string;
    resubmit?: string;
  }>();
  const mode =
    params.mode === "addRole" ? "addRole" : params.mode === "resubmit" ? "resubmit" : "register";
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
     
  }, [params.resubmit]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  // M-6 re-prompt fallback: in register mode the wizard is only reachable with
  // the handoff register.tsx left behind — a deep-link/killed app bounces back
  // to re-collect name + password (never silent failure).
  useEffect(() => {
    if (mode !== "register" || getRegistrationHandoff()) return;
    router.replace(
      `/(auth)/register?phone=${encodeURIComponent(params.phone ?? "")}&role=${encodeURIComponent(params.role ?? "delivery_man")}`,
    );
     
  }, [mode]);

  const canSubmit = !!nidUrl && !!licenseUrl;

  // addRole/resubmit modes call authenticated endpoints (existing session).
  async function bearer(): Promise<string | null> {
    const { data: session } = await supabase.auth.getSession();
    return session.session?.access_token ?? null;
  }

  const submit = async () => {
    if (!canSubmit) return;
    const creds = mode === "register" ? getRegistrationHandoff() : null;
    if (!creds) {
      setError(t("auth.delivery_man.submit_failed"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const delivery = {
        nid_url: nidUrl,
        license_url: licenseUrl,
        ...(vehicleNote.trim() ? { vehicle_note: vehicleNote.trim() } : {}),
      };
      // M-5 (§16): mode=resubmit pushes the EDITED record into
      // POST /api/user/roles/resubmit — fields re-applied server-side and the
      // re-queue is one action with the fix, never a bare re-queue.
      const url =
        mode === "addRole"
          ? `${API_URL}/api/user/roles`
          : mode === "resubmit"
            ? `${API_URL}/api/user/roles/resubmit`
            : `${API_URL}/api/register`;
      const authHeader = mode !== "register" ? await bearer() : null;
      const body =
        mode === "addRole"
          ? { role: "delivery_man", delivery }
          : mode === "resubmit"
            ? { kind: "delivery_man", delivery }
            : {
                phone: creds.phone,
                name: creds.name,
                password: creds.password,
                role: "delivery_man",
                // S8 §4.1: explicit gender forward (no spread — silent drops
                // would fall back to the DB default with no error).
                gender: creds.gender,
                delivery,
                // C1-1: consent carried via the handoff from the phone-entry gate.
                terms_accepted: creds.terms_accepted,
              };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: `Bearer ${authHeader}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || t("auth.delivery_man.submit_failed"));
        return;
      }
      if (mode === "register") clearRegistrationHandoff();
      if (mode === "addRole") {
        Alert.alert(t("auth.delivery_man.added_title"), t("auth.delivery_man.added_body"));
        router.back();
      } else if (mode === "resubmit") {
        Alert.alert(t("auth.delivery_man.resubmitted_title"), t("auth.delivery_man.resubmitted_body"));
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
