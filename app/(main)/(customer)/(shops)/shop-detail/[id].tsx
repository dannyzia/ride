/**
 * Shop detail screen — F-13 SPLIT LANES: browse products (cart → checkout)
 * and/or request a workshop service (vehicle details + window) in the same
 * shop screen. The Services tab appears only when the shop has live services
 * (data-driven — a workshop without services shows the products lane alone).
 */
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { useShopStore } from "@/store/useShopStore";
import { supabase } from "@/lib/supabase";

import { logger } from "@/lib/logger";
import { useTranslation } from "react-i18next";
import { formatBDT } from "@/lib/format";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

interface WorkshopService {
  id: string;
  name: string;
  description: string | null;
  price_bdt: number;
  duration_minutes: number;
}

interface MyRequest {
  id: string;
  service_name: string;
  requested_date: string;
  window_start: string;
  window_end: string;
  status: "requested" | "confirmed" | "in_progress" | "done" | "declined";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export default function ShopDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const { selectedShop, selectedProducts, setSelectedShop, setSelectedProducts, cart, addToCart, removeFromCart } =
    useShopStore();
  const [loading, setLoading] = useState(true);

  // ── F-13 services lane ─────────────────────────────────────────────
  const [tab, setTab] = useState<"products" | "services">("products");
  const [services, setServices] = useState<WorkshopService[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [activeService, setActiveService] = useState<WorkshopService | null>(null);
  const [vehicleDetails, setVehicleDetails] = useState("");
  const [reqDate, setReqDate] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [reqNote, setReqNote] = useState("");
  const [sending, setSending] = useState(false);

  const loadShop = useCallback(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/shop/${id}`);
        if (!res.ok) throw new Error("Failed to fetch shop");
        const data = await res.json();
        setSelectedShop(data.shop);
        setSelectedProducts(data.products);
      } catch (err) {
        logger.error("[shop-detail] fetch error", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, setSelectedShop, setSelectedProducts]);

  useEffect(() => {
    loadShop();
  }, [loadShop]);

  // Services are a PUBLIC price list (F-13 customer lane).
  useEffect(() => {
    if (!id) return;
    fetch(`${SERVER_URL}/api/shop/${id}/workshop/services`)
      .then((res) => (res.ok ? res.json() : { services: [] }))
      .then((data) => setServices(Array.isArray(data.services) ? data.services : []))
      .catch((err: unknown) => logger.error("[shop-detail] services fetch", err));
  }, [id]);

  // The caller's own requests for THIS shop (auth'd; SLA enforced server-side).
  const loadMyRequests = useCallback(async () => {
    if (!id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${SERVER_URL}/api/workshop/requests?shop_id=${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const payload = await res.json();
      setMyRequests(Array.isArray(payload.requests) ? payload.requests : []);
    } catch (err) {
      logger.error("[shop-detail] my requests fetch", err);
    }
  }, [id]);

  useEffect(() => {
    loadMyRequests();
  }, [loadMyRequests]);

  const sendRequest = async () => {
    if (!activeService) return;
    if (
      !vehicleDetails.trim() ||
      !DATE_RE.test(reqDate) ||
      !TIME_RE.test(windowStart) ||
      !TIME_RE.test(windowEnd) ||
      windowEnd <= windowStart
    ) {
      Alert.alert(t("common.error"), t("shops_detail.invalid_fields"));
      return;
    }
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${SERVER_URL}/api/shop/${id}/workshop/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          service_id: activeService.id,
          requested_date: reqDate,
          window_start: windowStart,
          window_end: windowEnd,
          vehicle_details: vehicleDetails.trim(),
          note: reqNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert(t("common.error"), data.message || t("shops_detail.request_error"));
        return;
      }
      setActiveService(null);
      setVehicleDetails("");
      setReqDate("");
      setWindowStart("");
      setWindowEnd("");
      setReqNote("");
      Alert.alert(t("shops_detail.sent_title"), t("shops_detail.sent_body"));
      loadMyRequests();
    } catch (err) {
      logger.error("[shop-detail] request send error", err);
      Alert.alert(t("common.error"), t("shops_detail.request_error"));
    } finally {
      setSending(false);
    }
  };

  const cartTotal = cart.reduce((sum, i) => sum + i.price_bdt * i.quantity, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!selectedShop) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: textPrimary, fontSize: 16 }}>{t("shops_detail.not_found")}</Text>
      </SafeAreaView>
    );
  }

  const statusColor = (s: MyRequest["status"]) =>
    s === "declined"
      ? colors.danger        : s === "done"
          ? colors.success
        : s === "confirmed"
          ? colors.blue
          : s === "in_progress"
            ? colors.indigo
            : colors.amber;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} testID="customer.shops.shop-detail.id.el-1">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
          {selectedShop.name}
        </Text>
        {selectedShop.is_verified && (
          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
        )}
      </View>

      {/* F-13 split-lane tabs — only when the shop actually has services */}
      {services.length > 0 && (
        <View style={{ flexDirection: "row", paddingHorizontal: 20, marginBottom: 12, gap: 8 }}>
          {(["products", "services"] as const).map((lane) => (
            <TouchableOpacity
              key={lane}
              onPress={() => setTab(lane)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                alignItems: "center",
                backgroundColor: tab === lane ? colors.primary : surfaceBg,
                borderWidth: 1,
                borderColor: tab === lane ? colors.primary : borderColor,
              }}
             testID="customer.shops.shop-detail.id.set-tab">
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: "JakartaSemiBold",
                  color: tab === lane ? "#FFFFFF" : textPrimary,
                }}
              >
                {lane === "products" ? t("shops_detail.tab_products") : t("shops_detail.tab_services")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {tab === "products" ? (
        <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
          {selectedProducts.length === 0 ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <Ionicons name="bag-outline" size={48} color={textSecondary} />
              <Text style={{ fontSize: 16, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 12 }}>
                {t("shops_detail.no_products")}
              </Text>
            </View>
          ) : (
            selectedProducts.map((product) => {
              const inCart = cart.find((i) => i.product_id === product.id);
              return (
                <View
                  key={product.id}
                  style={{
                    backgroundColor: surfaceBg,
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary }}>
                      {product.name}
                    </Text>
                    {product.description ? (
                      <Text numberOfLines={2} style={{ fontSize: 13, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}>
                        {product.description}
                      </Text>
                    ) : null}
                    <Text style={{ fontSize: 15, fontFamily: "JakartaBold", color: colors.primary, marginTop: 4 }}>
                      {formatBDT(product.price_bdt)}
                    </Text>
                  </View>
                  {inCart ? (
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <TouchableOpacity
                        onPress={() => removeFromCart(product.id)}
                        style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.danger + "18", alignItems: "center", justifyContent: "center" }}
                       testID="customer.shops.shop-detail.id.remove-from-cart">
                        <Ionicons name="remove" size={16} color={colors.danger} />
                      </TouchableOpacity>
                      <Text style={{ marginHorizontal: 12, fontSize: 15, fontFamily: "JakartaBold", color: textPrimary }}>
                        {inCart.quantity}
                      </Text>
                      <TouchableOpacity
                        onPress={() => addToCart(product)}
                        style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" }}
                       testID="customer.shops.shop-detail.id.add-to-cart">
                        <Ionicons name="add" size={16} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => addToCart(product)}
                      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}
                     testID="customer.shops.shop-detail.id.add-to-cart-2">
                      <Ionicons name="add" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      ) : (
        <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
          {/* Services list */}
          {services.map((service) => (
            <View
              key={service.id}
              style={{
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor,
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary }}>
                  {service.name}
                </Text>
                {service.description ? (
                  <Text numberOfLines={2} style={{ fontSize: 13, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}>
                    {service.description}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 4 }}>
                  {t("shops_detail.duration_minutes", { minutes: service.duration_minutes })} ·{" "}
                  <Text style={{ fontFamily: "JakartaBold", color: colors.primary }}>{formatBDT(service.price_bdt)}</Text>
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setActiveService(activeService?.id === service.id ? null : service)}
                style={{
                  backgroundColor: activeService?.id === service.id ? colors.danger : colors.primary,
                  borderRadius: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                }}
               testID="customer.shops.shop-detail.id.set-active-service">
                <Text style={{ color: "#FFFFFF", fontSize: 14, fontFamily: "JakartaSemiBold" }}>
                  {activeService?.id === service.id ? t("common.cancel") : t("shops_detail.request")}
                </Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Request form — F-13: service + vehicle details + window */}
          {activeService && (
            <View
              style={{
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor: colors.primary,
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 15, fontFamily: "JakartaBold", color: textPrimary, marginBottom: 12 }}>
                {t("shops_detail.request_form_title")}
              </Text>

              <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 4 }}>
                {t("shops_detail.vehicle_details")}
              </Text>
              <TextInput
                style={{ backgroundColor: bg, borderWidth: 1, borderColor, borderRadius: 10, padding: 10, color: textPrimary, fontSize: 14, marginBottom: 10 }}
                placeholder={t("shops_detail.vehicle_placeholder")}
                placeholderTextColor={textSecondary}
                value={vehicleDetails}
                onChangeText={setVehicleDetails}
               testID="customer.shops.shop-detail.id.set-vehicle-details"/>

              <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 4 }}>
                {t("shops_detail.date")}
              </Text>
              <TextInput
                style={{ backgroundColor: bg, borderWidth: 1, borderColor, borderRadius: 10, padding: 10, color: textPrimary, fontSize: 14, marginBottom: 10 }}
                placeholder={t("shops_detail.date_placeholder")}
                placeholderTextColor={textSecondary}
                value={reqDate}
                onChangeText={setReqDate}
                autoCapitalize="none"
               testID="customer.shops.shop-detail.id.set-req-date"/>

              <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 4 }}>
                    {t("shops_detail.window_start")}
                  </Text>
                  <TextInput
                    style={{ backgroundColor: bg, borderWidth: 1, borderColor, borderRadius: 10, padding: 10, color: textPrimary, fontSize: 14 }}
                    placeholder={t("shops_detail.window_placeholder")}
                    placeholderTextColor={textSecondary}
                    value={windowStart}
                    onChangeText={setWindowStart}
                    autoCapitalize="none"
                   testID="customer.shops.shop-detail.id.set-window-start"/>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 4 }}>
                    {t("shops_detail.window_end")}
                  </Text>
                  <TextInput
                    style={{ backgroundColor: bg, borderWidth: 1, borderColor, borderRadius: 10, padding: 10, color: textPrimary, fontSize: 14 }}
                    placeholder={t("shops_detail.window_placeholder")}
                    placeholderTextColor={textSecondary}
                    value={windowEnd}
                    onChangeText={setWindowEnd}
                    autoCapitalize="none"
                   testID="customer.shops.shop-detail.id.set-window-end"/>
                </View>
              </View>

              <TextInput
                style={{ backgroundColor: bg, borderWidth: 1, borderColor, borderRadius: 10, padding: 10, color: textPrimary, fontSize: 14, marginBottom: 10, minHeight: 60 }}
                placeholder={t("shops_detail.note_placeholder")}
                placeholderTextColor={textSecondary}
                value={reqNote}
                onChangeText={setReqNote}
                multiline
               testID="customer.shops.shop-detail.id.set-req-note"/>

              <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 10 }}>
                {t("shops_detail.sla_hint")}
              </Text>

              <TouchableOpacity
                onPress={sendRequest}
                disabled={sending}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: "center",
                  opacity: sending ? 0.5 : 1,
                }}
               testID="customer.shops.shop-detail.id.send-request">
                {sending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontSize: 15, fontFamily: "JakartaSemiBold" }}>
                    {t("shops_detail.send_request")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Caller's own requests — F-13 auto-declined rows show the outcome */}
          {myRequests.length > 0 && (
            <View style={{ marginTop: 4, marginBottom: 16 }}>
              <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
                {t("shops_detail.my_requests")}
              </Text>
              {myRequests.map((req) => (
                <View
                  key={req.id}
                  style={{
                    backgroundColor: surfaceBg,
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ flex: 1, fontSize: 14, fontFamily: "JakartaSemiBold", color: textPrimary }}>
                      {req.service_name}
                    </Text>
                    <View style={{ backgroundColor: statusColor(req.status) + "18", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 12, fontFamily: "JakartaBold", color: statusColor(req.status) }}>
                        {t(`shops_detail.status_${req.status}`)}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, fontFamily: "Jakarta", color: textSecondary, marginTop: 4 }}>
                    {req.requested_date} · {req.window_start}–{req.window_end}
                  </Text>
                  {req.status === "declined" && (
                    <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: colors.danger, marginTop: 4 }}>
                      {t("shops_detail.declined_hint")}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Cart bar (products lane only) */}
      {tab === "products" && cartCount > 0 && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: surfaceBg,
            borderTopWidth: 1,
            borderTopColor: borderColor,
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: "JakartaMedium", color: textPrimary }}>
              {t("shops_detail.cart_count", { count: cartCount, amount: formatBDT(cartTotal) })}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push(`/(main)/(customer)/(shops)/order-create/${id}`)}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 12,
              paddingHorizontal: 24,
              paddingVertical: 12,
            }}
           testID="customer.shops.shop-detail.id.push-order-create">
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontFamily: "JakartaSemiBold" }}>
              {t("shops_detail.checkout")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
