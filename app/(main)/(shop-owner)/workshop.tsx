/**
 * Workshop surface (S3 §3) — services CRUD + requests inbox in one screen.
 *
 * OWNER/MANAGER territory server-side (workshop routes gate both to
 * OWNER|MANAGER; STAFF is orders-only). Service requests track the 2h
 * confirm SLA (overdue badges on requested rows past the window).
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { logger } from "@/lib/logger";

interface WorkshopService {
  id: string;
  name: string;
  description: string | null;
  price_bdt: number;
  duration_minutes: number;
}

interface WorkshopRequest {
  id: string;
  service_name: string;
  service_price_bdt: number;
  customer_name: string | null;
  customer_phone: string | null;
  requested_date: string;
  window_start: string;
  window_end: string;
  note: string | null;
  status: string;
  order_id: string | null;
  created_at: string;
  sla: { deadline: string; overdue: boolean };
}

type ScreenMode = "inbox" | "services";

function taka(paisa: number): string {
  return `৳${(paisa / 100).toFixed(2)}`;
}

export default function ShopWorkshopScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const C = {
    bg: isDark ? colors.bgDark : colors.bgLight,
    text: isDark ? colors.textPrimaryDark : colors.textPrimaryLight,
    sub: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
    surface: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
    border: isDark ? colors.borderDark : colors.borderLight,
  };

  const [shopId, setShopId] = useState<string | null>(null);
  const [mode, setMode] = useState<ScreenMode>("inbox");
  const [requests, setRequests] = useState<WorkshopRequest[]>([]);
  const [services, setServices] = useState<WorkshopService[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [serviceModal, setServiceModal] = useState(false);
  const [serviceForm, setServiceForm] = useState({
    id: "",
    name: "",
    description: "",
    price_taka: "",
    duration: "",
  });
  const [saving, setSaving] = useState(false);

  const authHeaders = useCallback(async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    return { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" };
  }, []);

  const load = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const mineRes = await fetch(`${API_URL}/api/shop/mine`, { headers });
      if (!mineRes.ok) {
        router.back();
        return;
      }
      const mine = (await mineRes.json()) as { shop: { id: string } };
      const shop = mine.shop.id;
      setShopId(shop);

      const [requestsRes, servicesRes] = await Promise.all([
        fetch(`${API_URL}/api/shop/${shop}/workshop/requests`, { headers }),
        fetch(`${API_URL}/api/shop/${shop}/workshop/services`, { headers }),
      ]);
      if (requestsRes.ok) {
        const data = (await requestsRes.json()) as { requests: WorkshopRequest[] };
        setRequests(data.requests ?? []);
      }
      if (servicesRes.ok) {
        const data = (await servicesRes.json()) as { services: WorkshopService[] };
        setServices(data.services ?? []);
      }
    } catch (e) {
      logger.error("[shop.workshop] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const transition = async (
    request: WorkshopRequest,
    status: "confirmed" | "in_progress" | "done",
  ) => {
    if (!shopId) return;
    setActingId(request.id);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_URL}/api/shop/${shopId}/workshop/requests`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id: request.id, status }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        Alert.alert(t("shop.dashboard.action_failed"), body.message ?? "");
        return;
      }
      await load();
    } finally {
      setActingId(null);
    }
  };

  const saveService = async () => {
    if (!shopId) return;
    const price = Number(serviceForm.price_taka);
    const duration = Number(serviceForm.duration);
    if (!serviceForm.name.trim() || !Number.isFinite(price) || price < 0 || !Number.isInteger(duration) || duration < 5) {
      Alert.alert(t("shop.dashboard.action_failed"), t("shop.workshop.invalid_service"));
      return;
    }
    setSaving(true);
    try {
      const headers = await authHeaders();
      const body = JSON.stringify({
        ...(serviceForm.id ? { id: serviceForm.id } : {}),
        name: serviceForm.name.trim(),
        description: serviceForm.description || undefined,
        price_bdt: Math.round(price * 100),
        duration_minutes: duration,
      });
      const res = await fetch(`${API_URL}/api/shop/${shopId}/workshop/services`, {
        method: serviceForm.id ? "PATCH" : "POST",
        headers,
        body,
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        Alert.alert(t("shop.dashboard.action_failed"), err.message ?? "");
        return;
      }
      setServiceModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const deleteService = async (service: WorkshopService) => {
    if (!shopId) return;
    const headers = await authHeaders();
    const res = await fetch(
      `${API_URL}/api/shop/${shopId}/workshop/services?id=${service.id}`,
      { method: "DELETE", headers },
    );
    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      Alert.alert(t("shop.dashboard.action_failed"), err.message ?? "");
      return;
    }
    await load();
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: C.bg }}>
      <View className="flex-row items-center px-5 py-3">
        <TouchableOpacity onPress={() => router.back()} testID="shop-owner.workshop.el-1">
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text className="text-[17px] font-JakartaBold ml-3" style={{ color: C.text }}>
          {t("shop.workshop.title")}
        </Text>
      </View>

      <View className="flex-row px-5 mb-3 gap-2">
        {(["inbox", "services"] as const).map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => setMode(m)}
            className="flex-1 rounded-xl py-2"
            style={{
              backgroundColor: mode === m ? colors.primary : C.surface,
              borderWidth: 1,
              borderColor: mode === m ? colors.primary : C.border,
            }}
           
           testID="shop-owner.workshop.set-mode">
            <Text
              className="text-[12px] text-center font-JakartaBold"
              style={{ color: mode === m ? colors.white : C.sub }}
            >
              {t(`shop.workshop.tab_${m}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator className="mt-10" color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {mode === "inbox" ? (
            requests.length === 0 ? (
              <Text className="text-[13px] text-center py-10" style={{ color: C.sub }}>
                {t("shop.workshop.no_requests")}
              </Text>
            ) : (
              requests.map((r) => (
                <View
                  key={r.id}
                  className="rounded-2xl p-4 mb-3"
                  style={{
                    backgroundColor: C.surface,
                    borderWidth: 1,
                    borderColor: r.sla.overdue ? colors.danger : C.border,
                  }}
                >
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="text-[14px] font-JakartaBold" style={{ color: C.text }}>
                      {r.service_name}
                    </Text>
                    <Text
                      className="text-[12px] font-JakartaBold"
                      style={{ color: r.sla.overdue ? colors.danger : C.sub }}
                    >
                      {t(`shop.workshop.status_${r.status}`)}
                    </Text>
                  </View>
                  {r.sla.overdue ? (
                    <Text className="text-[11px] mb-1" style={{ color: colors.danger }}>
                      {t("shop.workshop.sla_overdue")}
                    </Text>
                  ) : null}
                  <Text className="text-[12px] mb-1" style={{ color: C.text }}>
                    {r.customer_name ?? "—"} · {r.customer_phone ?? "—"}
                  </Text>
                  <Text className="text-[11px] mb-2" style={{ color: C.sub }}>
                    {t("shop.workshop.window", {
                      date: r.requested_date,
                      start: r.window_start,
                      end: r.window_end,
                    })}
                  </Text>
                  {r.note ? (
                    <Text className="text-[11px] mb-2" style={{ color: C.sub }}>
                      “{r.note}”
                    </Text>
                  ) : null}
                  <Text className="text-[12px] font-JakartaBold mb-3" style={{ color: colors.primary }}>
                    {taka(r.service_price_bdt)}
                  </Text>

                  {r.status === "requested" ? (
                    <TouchableOpacity
                      className="rounded-xl py-2 items-center"
                      style={{ backgroundColor: colors.primary }}
                      disabled={actingId === r.id}
                      onPress={() => void transition(r, "confirmed")}
                     
                     testID="shop-owner.workshop.transition">
                      <Text className="text-[12px]" style={{ color: colors.white }}>
                        {t("shop.workshop.confirm")}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {r.status === "confirmed" ? (
                    <TouchableOpacity
                      className="rounded-xl py-2 items-center"
                      style={{ backgroundColor: colors.primary }}
                      disabled={actingId === r.id}
                      onPress={() => void transition(r, "in_progress")}
                     
                     testID="shop-owner.workshop.transition-2">
                      <Text className="text-[12px]" style={{ color: colors.white }}>
                        {t("shop.workshop.start")}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {r.status === "in_progress" ? (
                    <TouchableOpacity
                      className="rounded-xl py-2 items-center"
                      style={{ backgroundColor: colors.primary }}
                      disabled={actingId === r.id}
                      onPress={() => void transition(r, "done")}
                     
                     testID="shop-owner.workshop.transition-3">
                      <Text className="text-[12px]" style={{ color: colors.white }}>
                        {t("shop.workshop.done")}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))
            )
          ) : (
            <>
              {services.length === 0 ? (
                <Text className="text-[13px] text-center py-10" style={{ color: C.sub }}>
                  {t("shop.workshop.no_services")}
                </Text>
              ) : (
                services.map((s) => (
                  <View
                    key={s.id}
                    className="rounded-2xl p-4 mb-3"
                    style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
                  >
                    <View className="flex-row justify-between items-start">
                      <View className="flex-1 pr-3">
                        <Text className="text-[14px] font-JakartaBold" style={{ color: C.text }}>
                          {s.name}
                        </Text>
                        {s.description ? (
                          <Text className="text-[11px] mt-1" style={{ color: C.sub }}>
                            {s.description}
                          </Text>
                        ) : null}
                        <Text className="text-[12px] font-JakartaBold mt-2" style={{ color: colors.primary }}>
                          {taka(s.price_bdt)}
                        </Text>
                        <Text className="text-[11px]" style={{ color: C.sub }}>
                          {t("shop.workshop.duration", { n: s.duration_minutes })}
                        </Text>
                      </View>
                      <View className="gap-2">
                        <TouchableOpacity
                          onPress={() => {
                            setServiceForm({
                              id: s.id,
                              name: s.name,
                              description: s.description ?? "",
                              price_taka: (s.price_bdt / 100).toFixed(2),
                              duration: String(s.duration_minutes),
                            });
                            setServiceModal(true);
                          }}
                          className="rounded-lg px-3 py-2"
                          style={{ borderWidth: 1, borderColor: C.border }}
                         
                         testID="shop-owner.workshop.set-service-form">
                          <Text className="text-[12px]" style={{ color: C.text }}>
                            {t("shop.catalog.edit")}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => void deleteService(s)}
                          className="rounded-lg px-3 py-2"
                          style={{ borderWidth: 1, borderColor: colors.danger }}
                         
                         testID="shop-owner.workshop.delete-service">
                          <Text className="text-[12px]" style={{ color: colors.danger }}>
                            {t("shop.workshop.delete")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))
              )}
              <TouchableOpacity
                className="rounded-xl py-3 items-center mt-2"
                style={{ backgroundColor: colors.primary }}
                onPress={() => {
                  setServiceForm({ id: "", name: "", description: "", price_taka: "", duration: "" });
                  setServiceModal(true);
                }}
               
               testID="shop-owner.workshop.set-service-form-2">
                <Text className="text-[13px]" style={{ color: colors.white }}>
                  {t("shop.workshop.add_service")}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={serviceModal} transparent animationType="fade" onRequestClose={() => setServiceModal(false)}>
        <View className="flex-1 justify-center px-6" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View className="rounded-2xl p-5" style={{ backgroundColor: C.surface }}>
            <Text className="text-[15px] font-JakartaBold mb-4" style={{ color: C.text }}>
              {serviceForm.id ? t("shop.workshop.edit_service") : t("shop.workshop.add_service")}
            </Text>
            <TextInput
              value={serviceForm.name}
              onChangeText={(v) => setServiceForm({ ...serviceForm, name: v })}
              placeholder={t("shop.workshop.service_name")}
              placeholderTextColor={C.sub}
              className="rounded-xl border px-3 py-2 mb-3 text-[13px]"
              style={{ color: C.text, borderColor: C.border, backgroundColor: C.bg }}
             
             testID="shop-owner.workshop.set-service-form-3"/>
            <TextInput
              value={serviceForm.description}
              onChangeText={(v) => setServiceForm({ ...serviceForm, description: v })}
              placeholder={t("shop.catalog.description")}
              placeholderTextColor={C.sub}
              multiline
              className="rounded-xl border px-3 py-2 mb-3 text-[13px]"
              style={{ color: C.text, borderColor: C.border, backgroundColor: C.bg, minHeight: 60 }}
             
             testID="shop-owner.workshop.set-service-form-4"/>
            <View className="flex-row gap-3 mb-4">
              <TextInput
                value={serviceForm.price_taka}
                onChangeText={(v) => setServiceForm({ ...serviceForm, price_taka: v })}
                placeholder={t("shop.catalog.price_taka")}
                placeholderTextColor={C.sub}
                keyboardType="decimal-pad"
                className="flex-1 rounded-xl border px-3 py-2 text-[13px]"
                style={{ color: C.text, borderColor: C.border, backgroundColor: C.bg }}
               
               testID="shop-owner.workshop.set-service-form-5"/>
              <TextInput
                value={serviceForm.duration}
                onChangeText={(v) => setServiceForm({ ...serviceForm, duration: v })}
                placeholder={t("shop.workshop.duration_label")}
                placeholderTextColor={C.sub}
                keyboardType="number-pad"
                className="w-24 rounded-xl border px-3 py-2 text-[13px]"
                style={{ color: C.text, borderColor: C.border, backgroundColor: C.bg }}
               
               testID="shop-owner.workshop.set-service-form-6"/>
            </View>
            <View className="flex-row gap-2">
              <TouchableOpacity
                className="flex-1 rounded-xl py-2 items-center"
                style={{ borderWidth: 1, borderColor: C.border }}
                onPress={() => setServiceModal(false)}
               
               testID="shop-owner.workshop.set-service-modal">
                <Text style={{ color: C.text }}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-xl py-2 items-center"
                style={{ backgroundColor: colors.primary }}
                disabled={saving}
                onPress={() => void saveService()}
               
               testID="shop-owner.workshop.save-service">
                {saving ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={{ color: colors.white }}>{t("common.save")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
