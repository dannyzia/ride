/**
 * Catalog CRUD (S3 §3). OWNER/MANAGER territory server-side; a STAFF viewer
 * sees the list without edit affordances because the server would reject
 * them per route (§3 — UI hiding is not security, but neither is showing
 * buttons that 403).
 *
 * Money: price input is TAKA at the UI layer, stored as integer paisa —
 * /100 only ever happens right here at display.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Switch,
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

interface Product {
  id: string;
  name: string;
  description: string | null;
  price_bdt: number;
  stock: number;
  category: string | null;
  is_active: boolean;
  is_rfq: boolean;
}

interface ProductForm {
  id?: string;
  name: string;
  description: string;
  price_taka: string;
  stock: string;
  category: string;
  is_active: boolean;
  is_rfq: boolean;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  description: "",
  price_taka: "",
  stock: "0",
  category: "",
  is_active: true,
  is_rfq: false,
};

function taka(paisa: number): string {
  return `৳${(paisa / 100).toFixed(2)}`;
}

export default function ShopCatalogScreen() {
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
  const [role, setRole] = useState<"OWNER" | "MANAGER" | "STAFF">("STAFF");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
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
      const mine = (await mineRes.json()) as {
        shop: { id: string };
        role: "OWNER" | "MANAGER" | "STAFF";
      };
      setShopId(mine.shop.id);
      setRole(mine.role);

      // Full live rows (including is_active=false) — OWNER/MANAGER GET on
      // the products management route (the PUBLIC /api/shop/[id] detail
      // route stays active-only for shoppers).
      const productsRes = await fetch(`${API_URL}/api/shop/${mine.shop.id}/products`, {
        headers,
      });
      if (productsRes.ok) {
        const data = (await productsRes.json()) as { products: Product[] };
        setProducts(data.products ?? []);
      }
    } catch (e) {
      logger.error("[shop.catalog] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEdit = (p: Product) => {
    setForm({
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      price_taka: (p.price_bdt / 100).toFixed(2),
      stock: String(p.stock),
      category: p.category ?? "",
      is_active: p.is_active,
      is_rfq: p.is_rfq,
    });
    setModalVisible(true);
  };

  const save = async () => {
    if (!shopId) return;
    const priceTaka = Number(form.price_taka);
    if (!form.name.trim() || !Number.isFinite(priceTaka) || priceTaka <= 0) {
      Alert.alert(t("shop.dashboard.action_failed"), t("shop.catalog.invalid_product"));
      return;
    }
    setSaving(true);
    try {
      const headers = await authHeaders();
      const body = JSON.stringify({
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        description: form.description || undefined,
        price_bdt: Math.round(priceTaka * 100),
        stock: Number(form.stock) || 0,
        category: form.category || undefined,
        is_active: form.is_active,
        is_rfq: form.is_rfq,
      });
      // POST creates; PATCH updates (body carries id).
      const res = await fetch(`${API_URL}/api/shop/${shopId}/products`, {
        method: form.id ? "PATCH" : "POST",
        headers,
        body,
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        Alert.alert(t("shop.dashboard.action_failed"), err.message ?? "");
        return;
      }
      setModalVisible(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Product, is_active: boolean) => {
    if (!shopId) return;
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/api/shop/${shopId}/products`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ id: p.id, is_active }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      Alert.alert(t("shop.dashboard.action_failed"), err.message ?? "");
      return;
    }
    await load();
  };

  const canEdit = role === "OWNER" || role === "MANAGER";

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: C.bg }}>
      <View className="flex-row items-center px-5 py-3">
        <TouchableOpacity onPress={() => router.back()} testID="shop-owner.catalog.el-1">
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text className="text-[17px] font-JakartaBold ml-3" style={{ color: C.text }}>
          {t("shop.catalog.title")}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator className="mt-10" color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {products.length === 0 ? (
            <Text className="text-[13px] text-center py-10" style={{ color: C.sub }}>
              {t("shop.catalog.empty")}
            </Text>
          ) : (
            products.map((p) => (
              <View
                key={p.id}
                className="rounded-2xl p-4 mb-3"
                style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
              >
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 pr-3">
                    <Text className="text-[14px] font-JakartaBold" style={{ color: C.text }}>
                      {p.name}
                    </Text>
                    {p.description ? (
                      <Text className="text-[11px] mt-1" style={{ color: C.sub }}>
                        {p.description}
                      </Text>
                    ) : null}
                    <Text className="text-[12px] font-JakartaBold mt-2" style={{ color: colors.primary }}>
                      {taka(p.price_bdt)}
                      {p.is_rfq ? ` · ${t("shop.catalog.rfq_tag")}` : ""}
                    </Text>
                    <Text className="text-[11px] mt-1" style={{ color: C.sub }}>
                      {t("shop.catalog.stock", { n: p.stock })}
                    </Text>
                  </View>
                  {canEdit ? (
                    <Switch
                      value={p.is_active}
                      onValueChange={(v) => void toggleActive(p, v)}
                     
                     testID="shop-owner.catalog.toggle-active"/>
                  ) : null}
                </View>
                {canEdit ? (
                  <TouchableOpacity
                    className="mt-3 self-end rounded-lg px-3 py-2"
                    style={{ borderWidth: 1, borderColor: C.border }}
                    onPress={() => openEdit(p)}
                   
                   testID="shop-owner.catalog.open-edit">
                    <Text className="text-[12px]" style={{ color: C.text }}>
                      {t("shop.catalog.edit")}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {canEdit ? (
        <TouchableOpacity
          className="absolute bottom-6 right-6 rounded-full w-14 h-14 items-center justify-center"
          style={{ backgroundColor: colors.primary }}
          onPress={openCreate}
         
         testID="shop-owner.catalog.open-create">
          <Ionicons name="add" size={28} color={colors.white} />
        </TouchableOpacity>
      ) : null}

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View className="flex-1 justify-center px-6" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            <View className="rounded-2xl p-5" style={{ backgroundColor: C.surface }}>
              <Text className="text-[15px] font-JakartaBold mb-4" style={{ color: C.text }}>
                {form.id ? t("shop.catalog.edit") : t("shop.catalog.add")}
              </Text>
              <TextInput
                value={form.name}
                onChangeText={(v) => setForm({ ...form, name: v })}
                placeholder={t("shop.catalog.name")}
                placeholderTextColor={C.sub}
                className="rounded-xl border px-3 py-2 mb-3 text-[13px]"
                style={{ color: C.text, borderColor: C.border, backgroundColor: C.bg }}
               
               testID="shop-owner.catalog.set-form"/>
              <TextInput
                value={form.description}
                onChangeText={(v) => setForm({ ...form, description: v })}
                placeholder={t("shop.catalog.description")}
                placeholderTextColor={C.sub}
                multiline
                className="rounded-xl border px-3 py-2 mb-3 text-[13px]"
                style={{ color: C.text, borderColor: C.border, backgroundColor: C.bg, minHeight: 60 }}
               
               testID="shop-owner.catalog.set-form-2"/>
              <View className="flex-row gap-3 mb-3">
                <TextInput
                  value={form.price_taka}
                  onChangeText={(v) => setForm({ ...form, price_taka: v })}
                  placeholder={t("shop.catalog.price_taka")}
                  placeholderTextColor={C.sub}
                  keyboardType="decimal-pad"
                  className="flex-1 rounded-xl border px-3 py-2 text-[13px]"
                  style={{ color: C.text, borderColor: C.border, backgroundColor: C.bg }}
                 
                 testID="shop-owner.catalog.set-form-3"/>
                <TextInput
                  value={form.stock}
                  onChangeText={(v) => setForm({ ...form, stock: v })}
                  placeholder={t("shop.catalog.stock_label")}
                  placeholderTextColor={C.sub}
                  keyboardType="number-pad"
                  className="w-24 rounded-xl border px-3 py-2 text-[13px]"
                  style={{ color: C.text, borderColor: C.border, backgroundColor: C.bg }}
                 
                 testID="shop-owner.catalog.set-form-4"/>
              </View>
              <TextInput
                value={form.category}
                onChangeText={(v) => setForm({ ...form, category: v })}
                placeholder={t("shop.catalog.category")}
                placeholderTextColor={C.sub}
                className="rounded-xl border px-3 py-2 mb-3 text-[13px]"
                style={{ color: C.text, borderColor: C.border, backgroundColor: C.bg }}
               
               testID="shop-owner.catalog.set-form-5"/>
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-[13px]" style={{ color: C.text }}>
                  {t("shop.catalog.active")}
                </Text>
                <Switch
                  value={form.is_active}
                  onValueChange={(v) => setForm({ ...form, is_active: v })}
                 
                 testID="shop-owner.catalog.set-form-6"/>
              </View>
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-[13px]" style={{ color: C.text }}>
                  {t("shop.catalog.rfq")}
                </Text>
                <Switch
                  value={form.is_rfq}
                  onValueChange={(v) => setForm({ ...form, is_rfq: v })}
                 
                 testID="shop-owner.catalog.set-form-7"/>
              </View>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="flex-1 rounded-xl py-2 items-center"
                  style={{ borderWidth: 1, borderColor: C.border }}
                  onPress={() => setModalVisible(false)}
                 
                 testID="shop-owner.catalog.set-modal-visible">
                  <Text style={{ color: C.text }}>{t("common.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 rounded-xl py-2 items-center"
                  style={{ backgroundColor: colors.primary }}
                  disabled={saving}
                  onPress={() => void save()}
                 
                 testID="shop-owner.catalog.save">
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={{ color: colors.white }}>{t("common.save")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
