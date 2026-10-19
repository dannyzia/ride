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
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadImageToR2 } from "@/lib/imageToURL";
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
  image_urls: string[] | null;
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
  image_urls: string[];
  is_active: boolean;
  is_rfq: boolean;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  description: "",
  price_taka: "",
  stock: "0",
  category: "",
  image_urls: [],
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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Named form handlers — the codemod derives each testID from these names
  // (slug(nameInput) → name-input), so strip→regen round-trips exactly.
  const nameInput = (v: string) => setForm((f) => ({ ...f, name: v }));
  const descriptionInput = (v: string) => setForm((f) => ({ ...f, description: v }));
  const priceInput = (v: string) => setForm((f) => ({ ...f, price_taka: v }));
  const stockInput = (v: string) => setForm((f) => ({ ...f, stock: v }));
  const categoryInput = (v: string) => setForm((f) => ({ ...f, category: v }));
  const activeToggle = (v: boolean) => setForm((f) => ({ ...f, is_active: v }));
  const rfqToggle = (v: boolean) => setForm((f) => ({ ...f, is_rfq: v }));
  const removeImage = (u: string) =>
    setForm((f) => ({ ...f, image_urls: f.image_urls.filter((x) => x !== u) }));

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
      image_urls: p.image_urls ?? [],
      is_active: p.is_active,
      is_rfq: p.is_rfq,
    });
    setModalVisible(true);
  };

  // D5-1: product photos ride the existing pipeline
  // (compress → presign → PUT) under the catalog folder; the URL the
  // pipeline returns is what the products route accepts (D5-1 validation).
  const pickProductPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      setUploadingPhoto(true);
      const uploaded = await uploadImageToR2({
        localUri: file.uri,
        folder: "catalog",
        fileName: file.fileName ?? `product_${Date.now()}.jpg`,
        mimeType: file.mimeType,
      });
      setForm((f) => ({ ...f, image_urls: [...f.image_urls, uploaded.publicUrl] }));
    } catch (e) {
      logger.error("[shop.catalog] photo upload failed", e);
      Alert.alert(t("shop.dashboard.action_failed"), t("shop.catalog.photo_failed"));
    } finally {
      setUploadingPhoto(false);
    }
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
        image_urls: form.image_urls.length > 0 ? form.image_urls : undefined,
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
                onChangeText={nameInput}
                placeholder={t("shop.catalog.name")}
                placeholderTextColor={C.sub}
                className="rounded-xl border px-3 py-2 mb-3 text-[13px]"
                style={{ color: C.text, borderColor: C.border, backgroundColor: C.bg }}
               
               testID="shop-owner.catalog.name-input"/>
              <TextInput
                value={form.description}
                onChangeText={descriptionInput}
                placeholder={t("shop.catalog.description")}
                placeholderTextColor={C.sub}
                multiline
                className="rounded-xl border px-3 py-2 mb-3 text-[13px]"
                style={{ color: C.text, borderColor: C.border, backgroundColor: C.bg, minHeight: 60 }}
               
               testID="shop-owner.catalog.description-input"/>
              <View className="flex-row gap-3 mb-3">
                <TextInput
                  value={form.price_taka}
                  onChangeText={priceInput}
                  placeholder={t("shop.catalog.price_taka")}
                  placeholderTextColor={C.sub}
                  keyboardType="decimal-pad"
                  className="flex-1 rounded-xl border px-3 py-2 text-[13px]"
                  style={{ color: C.text, borderColor: C.border, backgroundColor: C.bg }}
                 
                 testID="shop-owner.catalog.price-input"/>
                <TextInput
                  value={form.stock}
                  onChangeText={stockInput}
                  placeholder={t("shop.catalog.stock_label")}
                  placeholderTextColor={C.sub}
                  keyboardType="number-pad"
                  className="w-24 rounded-xl border px-3 py-2 text-[13px]"
                  style={{ color: C.text, borderColor: C.border, backgroundColor: C.bg }}
                 
                 testID="shop-owner.catalog.stock-input"/>
              </View>
              <TextInput
                value={form.category}
                onChangeText={categoryInput}
                placeholder={t("shop.catalog.category")}
                placeholderTextColor={C.sub}
                className="rounded-xl border px-3 py-2 mb-3 text-[13px]"
                style={{ color: C.text, borderColor: C.border, backgroundColor: C.bg }}
               
               testID="shop-owner.catalog.category-input"/>
              <View className="mb-3">
                <View className="flex-row flex-wrap gap-2 mb-2">
                  {form.image_urls.map((url) => (
                    <View key={url} className="relative">
                      <Image
                        source={{ uri: url }}
                        style={{ width: 64, height: 64, borderRadius: 8 }}
                        resizeMode="cover"
                      />
                      <TouchableOpacity
                        className="absolute -top-2 -right-2 rounded-full w-6 h-6 items-center justify-center"
                        style={{ backgroundColor: C.text }}
                        onPress={() => removeImage(url)}
                       testID="shop-owner.catalog.remove-image">
                        <Text style={{ color: C.bg, fontSize: 12 }}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  className="rounded-xl border px-3 py-2 items-center"
                  style={{ borderColor: C.border }}
                  disabled={uploadingPhoto}
                  onPress={() => void pickProductPhoto()}
                 testID="shop-owner.catalog.pick-product-photo">
                  {uploadingPhoto ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text className="text-[13px]" style={{ color: C.text }}>
                      {t("shop.catalog.photo_add")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-[13px]" style={{ color: C.text }}>
                  {t("shop.catalog.active")}
                </Text>
                <Switch
                  value={form.is_active}
                  onValueChange={activeToggle}
                 
                 testID="shop-owner.catalog.active-toggle"/>
              </View>
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-[13px]" style={{ color: C.text }}>
                  {t("shop.catalog.rfq")}
                </Text>
                <Switch
                  value={form.is_rfq}
                  onValueChange={rfqToggle}
                 
                 testID="shop-owner.catalog.rfq-toggle"/>
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
                  disabled={saving || uploadingPhoto}
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
