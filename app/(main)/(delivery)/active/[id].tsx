/**
 * Delivery Man surface — active delivery (S6, plan 27 §6.1 steps 6–7).
 *
 * Step machine against the leg's server state (Amendment 2 — one active job):
 *   accepted  → "attempted" logging (F-15: call → wait → return/second
 *               attempt) + pickup-code entry (F-11 handover, code from the
 *               shop) → picked_up
 *   picked_up → delivery proof (receiver OTP OR photo — F-15) + amount
 *               collected in cash (F-38; short-pay lands on the remittance
 *               due) → delivered (§12 settlement runs server-side)
 *   either    → fail with a reason → the shop's F-12 fallback
 *
 * State is read from GET /api/delivery/offers (the `active` leg) — the
 * inbox and this screen share one contract.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useTaka } from "@/lib/useTaka";
import { uploadImageToR2 } from "@/lib/imageToURL";
import { DEFAULT_STORAGE_FOLDER } from "@/lib/storageFolders";

interface ActiveLeg {
  id: string;
  status: string;
  pickup_address: string | null;
  dropoff_address: string | null;
  delivery_fee_bdt: number | null;
  order_total_bdt: number | null;
  order_subtotal_bdt: number | null;
  order_id: string | null;
  shop_name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
}

interface OffersResponse {
  dispatch_held: boolean;
  offer: unknown;
  active: (ActiveLeg & { offer_expires_at?: string | null }) | null;
}

/** Taka input → integer paisa. Returns null when the input is not money. */
function takaToPaisa(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(parseFloat(trimmed) * 100);
}

export default function ActiveDeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const isDark = useIsDark();
  const taka = useTaka();
  const C = {
    bg: isDark ? colors.bgDark : colors.bgLight,
    text: isDark ? colors.textPrimaryDark : colors.textPrimaryLight,
    sub: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
    surface: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
    border: isDark ? colors.borderDark : colors.borderLight,
  };

  const [leg, setLeg] = useState<ActiveLeg | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [pickupCode, setPickupCode] = useState("");
  const [otp, setOtp] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [showFail, setShowFail] = useState(false);

  const load = useCallback(async () => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        router.replace("/(auth)/login");
        return;
      }
      const res = await fetch(`${API_URL}/api/delivery/offers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`offers GET ${res.status}`);
      const body = (await res.json()) as OffersResponse;
      const found = body.active && body.active.id === id ? body.active : null;
      if (!found) {
        // Terminal (delivered/failed) or reassigned — the inbox is home.
        router.replace("/(main)/(delivery)" as never);
        return;
      }
      setLeg(found);
    } catch (e) {
      logger.warn("[delivery active] load failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (payload: Record<string, unknown>): Promise<boolean> => {
      if (!leg) return false;
      setBusy(true);
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) return false;
        const res = await fetch(`${API_URL}/api/delivery/active/${leg.id}/action`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
            message?: string;
          } | null;
          Alert.alert(
            t("delivery.active.error_title"),
            body?.message ?? t("delivery.active.error_generic"),
          );
          return false;
        }
        return true;
      } finally {
        setBusy(false);
      }
    },
    [leg, t],
  );

  const pickProofPhoto = useCallback(async () => {
    if (!leg) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      setUploading(true);
      const uploaded = await uploadImageToR2({
        localUri: file.uri,
        folder: DEFAULT_STORAGE_FOLDER,
        fileName: file.fileName ?? `delivery_proof_${Date.now()}.jpg`,
        mimeType: file.mimeType,
      });
      setProofUrl(uploaded.publicUrl);
    } catch (e) {
      logger.warn("[delivery active] proof upload failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      Alert.alert(t("delivery.active.error_title"), t("delivery.active.proof_upload_failed"));
    } finally {
      setUploading(false);
    }
  }, [leg, t]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: C.bg }}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!leg) return null;

  // Expected COD total (subtotal + fee) for the short-pay hint (F-38).
  const expectedPaisa =
    leg.order_subtotal_bdt !== null && leg.delivery_fee_bdt !== null
      ? leg.order_subtotal_bdt + leg.delivery_fee_bdt
      : null;
  const enteredPaisa = takaToPaisa(amountInput);

  const onAttempt = async () => {
    const ok = await act({ action: "attempt" });
    if (ok) await load();
  };

  const onPickup = async () => {
    const ok = await act({ action: "pickup", code: pickupCode.trim() });
    if (ok) {
      setPickupCode("");
      await load();
    }
  };

  const onDeliver = async () => {
    const payload: Record<string, unknown> = { action: "deliver" };
    if (otp.trim()) payload.otp = otp.trim();
    if (proofUrl) payload.proof_photo_url = proofUrl;
    if (leg.order_id) {
      // COD shop order — amount collected is mandatory (server-enforced).
      if (enteredPaisa === null) {
        Alert.alert(t("delivery.active.error_title"), t("delivery.active.amount_invalid"));
        return;
      }
      payload.amount_collected_bdt = enteredPaisa;
    }
    const ok = await act(payload);
    if (ok) {
      Alert.alert(t("delivery.active.delivered_title"), t("delivery.active.delivered_body"), [
        { text: "OK", onPress: () => router.replace("/(main)/(delivery)" as never) },
      ]);
    }
  };

  const onFail = async () => {
    const ok = await act({ action: "fail", failure_reason: failReason.trim() });
    if (ok) {
      setFailReason("");
      setShowFail(false);
      router.replace("/(main)/(delivery)" as never);
    }
  };

  const callCustomer = () => {
    if (leg.customer_phone) {
      void Linking.openURL(`tel:${leg.customer_phone}`);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: C.bg }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View
        className="flex-row items-center px-[16px] py-[14px] border-b"
        style={{ borderColor: C.border }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-[12px] p-[4px]"
          accessibilityLabel={t("delivery.active.back")}
         
         testID="delivery.active.id.el-1">
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text className="text-[20px] font-JakartaBold tracking-tight" style={{ color: C.text }}>
          {t("delivery.active.title")}
        </Text>
        <View className="ml-auto">
          <Text
            className="text-[11px] font-JakartaSemiBold uppercase px-2 py-1 rounded-full"
            style={{ color: colors.primary, backgroundColor: colors.primary + "1A" }}
            testID="delivery.active.status-pill"
          >
            {t(`delivery.status.${leg.status}`)}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Job details */}
          <View
            className="rounded-[14px] p-4 border"
            style={{ borderColor: C.border, backgroundColor: C.surface }}
            testID="delivery.active.details-card"
          >
            {leg.shop_name ? (
              <Text className="text-[15px] font-JakartaBold" style={{ color: C.text }}>
                {leg.shop_name}
              </Text>
            ) : null}
            <View className="mt-2 gap-2">
              <View className="flex-row gap-2">
                <Ionicons name="storefront-outline" size={15} color={C.sub} />
                <Text className="text-[13px] font-Jakarta flex-1" style={{ color: C.text }}>
                  {leg.pickup_address ?? "—"}
                </Text>
              </View>
              <View className="flex-row gap-2">
                <Ionicons name="location-outline" size={15} color={C.sub} />
                <Text className="text-[13px] font-Jakarta flex-1" style={{ color: C.text }}>
                  {leg.dropoff_address ?? "—"}
                </Text>
              </View>
            </View>
            <View className="flex-row justify-between mt-3 pt-3 border-t" style={{ borderColor: C.border }}>
              <View>
                <Text className="text-[11px] font-Jakarta" style={{ color: C.sub }}>
                  {t("delivery.inbox.order_value")}
                </Text>
                <Text className="text-[14px] font-JakartaSemiBold" style={{ color: C.text }}>
                  {taka(leg.order_total_bdt)}
                </Text>
              </View>
              <View>
                <Text className="text-[11px] font-Jakarta" style={{ color: C.sub }}>
                  {t("delivery.inbox.fee")}
                </Text>
                <Text className="text-[14px] font-JakartaSemiBold" style={{ color: colors.primary }}>
                  {taka(leg.delivery_fee_bdt)}
                </Text>
              </View>
            </View>
            {leg.customer_phone ? (
              <TouchableOpacity
                className="flex-row items-center gap-2 mt-3 pt-3 border-t"
                style={{ borderColor: C.border }}
                onPress={callCustomer}
               
               testID="delivery.active.id.call-customer">
                <Ionicons name="call-outline" size={16} color={colors.primary} />
                <Text className="text-[13px] font-JakartaSemiBold" style={{ color: colors.primary }}>
                  {leg.customer_name ?? t("delivery.active.call_customer")}
                  {` · ${leg.customer_phone}`}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* accepted → attempt + pickup code */}
          {leg.status === "accepted" ? (
            <View className="mt-4 gap-3" testID="delivery.active.pickup-panel">
              <TouchableOpacity
                className="rounded-[12px] py-3 items-center border"
                style={{ borderColor: C.border, opacity: busy ? 0.6 : 1 }}
                disabled={busy}
                onPress={() => void onAttempt()}
               
               testID="delivery.active.id.on-attempt">
                <Text className="text-[14px] font-JakartaSemiBold" style={{ color: C.text }}>
                  {t("delivery.active.attempt")}
                </Text>
              </TouchableOpacity>

              <Text className="text-[13px] font-Jakarta" style={{ color: C.sub }}>
                {t("delivery.active.pickup_code_hint")}
              </Text>
              <TextInput
                className="rounded-[12px] px-4 py-3 text-[16px] font-JakartaSemiBold"
                style={{ backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, color: C.text }}
                placeholder={t("delivery.active.pickup_code_placeholder")}
                placeholderTextColor={C.sub}
                value={pickupCode}
                onChangeText={setPickupCode}
                autoCapitalize="characters"
                maxLength={8}
               
               testID="delivery.active.id.set-pickup-code"/>
              <TouchableOpacity
                className="rounded-[12px] py-3 items-center"
                style={{ backgroundColor: colors.primary, opacity: busy || !pickupCode.trim() ? 0.6 : 1 }}
                disabled={busy || !pickupCode.trim()}
                onPress={() => void onPickup()}
               
               testID="delivery.active.id.on-pickup">
                <Text className="text-[14px] font-JakartaSemiBold text-white">
                  {t("delivery.active.pickup_submit")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* picked_up → proof + amount collected → deliver */}
          {leg.status === "picked_up" ? (
            <View className="mt-4 gap-3" testID="delivery.active.deliver-panel">
              <Text className="text-[13px] font-JakartaSemiBold" style={{ color: C.text }}>
                {t("delivery.active.proof_title")}
              </Text>
              <Text className="text-[12px] font-Jakarta" style={{ color: C.sub }}>
                {t("delivery.active.proof_hint")}
              </Text>
              <TextInput
                className="rounded-[12px] px-4 py-3 text-[16px] font-JakartaSemiBold"
                style={{ backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, color: C.text }}
                placeholder={t("delivery.active.otp_placeholder")}
                placeholderTextColor={C.sub}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={8}
               
               testID="delivery.active.id.set-otp"/>
              <TouchableOpacity
                className="flex-row items-center justify-center gap-2 rounded-[12px] py-3 border"
                style={{ borderColor: C.border }}
                disabled={uploading}
                onPress={() => void pickProofPhoto()}
               
               testID="delivery.active.id.pick-proof-photo">
                <Ionicons
                  name={proofUrl ? "checkmark-circle" : "camera-outline"}
                  size={18}
                  color={proofUrl ? colors.success : colors.primary}
                />
                <Text className="text-[14px] font-JakartaSemiBold" style={{ color: C.text }}>
                  {uploading
                    ? t("delivery.active.proof_uploading")
                    : proofUrl
                      ? t("delivery.active.proof_attached")
                      : t("delivery.active.proof_photo")}
                </Text>
              </TouchableOpacity>

              {leg.order_id ? (
                <>
                  <Text className="text-[13px] font-JakartaSemiBold mt-1" style={{ color: C.text }}>
                    {t("delivery.active.amount_title")}
                  </Text>
                  <Text className="text-[12px] font-Jakarta" style={{ color: C.sub }}>
                    {expectedPaisa !== null
                      ? t("delivery.active.amount_hint_expected", { amount: (expectedPaisa / 100).toFixed(2) })
                      : t("delivery.active.amount_hint")}
                  </Text>
                  <TextInput
                    className="rounded-[12px] px-4 py-3 text-[16px] font-JakartaSemiBold"
                    style={{ backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, color: C.text }}
                    placeholder={t("delivery.active.amount_placeholder")}
                    placeholderTextColor={C.sub}
                    value={amountInput}
                    onChangeText={setAmountInput}
                    keyboardType="decimal-pad"
                   
                   testID="delivery.active.id.set-amount-input"/>
                  {enteredPaisa !== null && expectedPaisa !== null && enteredPaisa < expectedPaisa ? (
                    <Text className="text-[12px] font-JakartaSemiBold" style={{ color: colors.danger }}>
                      {t("delivery.active.shortpay_note")}
                    </Text>
                  ) : null}
                </>
              ) : null}

              <TouchableOpacity
                className="rounded-[12px] py-3 items-center"
                style={{ backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }}
                disabled={busy}
                onPress={() => void onDeliver()}
               
               testID="delivery.active.id.on-deliver">
                <Text className="text-[14px] font-JakartaSemiBold text-white">
                  {t("delivery.active.deliver_submit")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Fail path (F-12 fallback trigger) */}
          {leg.status === "accepted" || leg.status === "picked_up" ? (
            <View className="mt-6">
              {!showFail ? (
                <TouchableOpacity
                  className="items-center py-2"
                  onPress={() => setShowFail(true)}
                 
                 testID="delivery.active.id.set-show-fail">
                  <Text className="text-[13px] font-JakartaSemiBold" style={{ color: colors.danger }}>
                    {t("delivery.active.fail_toggle")}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View className="gap-3" testID="delivery.active.fail-panel">
                  <TextInput
                    className="rounded-[12px] px-4 py-3 text-[14px] font-Jakarta"
                    style={{ backgroundColor: C.surface, borderColor: colors.danger, borderWidth: 1, color: C.text }}
                    placeholder={t("delivery.active.fail_reason_placeholder")}
                    placeholderTextColor={C.sub}
                    value={failReason}
                    onChangeText={setFailReason}
                    multiline
                    maxLength={500}
                   
                   testID="delivery.active.id.set-fail-reason"/>
                  <TouchableOpacity
                    className="rounded-[12px] py-3 items-center"
                    style={{ backgroundColor: colors.danger, opacity: busy || !failReason.trim() ? 0.6 : 1 }}
                    disabled={busy || !failReason.trim()}
                    onPress={() => void onFail()}
                   
                   testID="delivery.active.id.on-fail">
                    <Text className="text-[14px] font-JakartaSemiBold text-white">
                      {t("delivery.active.fail_submit")}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
