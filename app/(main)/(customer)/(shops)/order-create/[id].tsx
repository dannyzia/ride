/**
 * Shop order checkout — select fulfillment, review cart, place order.
 */
import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { useShopStore } from "@/store/useShopStore";
import { useCustomer } from "@/store";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useTranslation } from "react-i18next";
import { formatBDT } from "@/lib/format";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

export default function OrderCreateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

const {
  cart,
  cartFulfillment,
  setCartFulfillment,
  deliveryAddress,
  setDeliveryAddress,
  clearCart,
} = useShopStore();

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // §8: one Idempotency-Key per checkout attempt — a retry of the SAME cart
  // replays the stored outcome instead of double-ordering (uuid v4 shape;
  // this is a barrier token, not a secret).
  const [idemKey] = useState(() =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }),
  );
  // §12: the dropoff coordinates drive the distance-tiered delivery fee —
  // the rider's current location is the default dropoff.
  const { userLatitude, userLongitude } = useCustomer();

  const subtotal = cart.reduce((sum, i) => sum + i.price_bdt * i.quantity, 0);

  const handleSubmit = async () => {
    if (cartFulfillment === "delivery" && !deliveryAddress) {
      Alert.alert(t("shops_order.address_title"), t("shops_order.address_body"));
      return;
    }
    if (
      cartFulfillment === "delivery" &&
      (userLatitude == null || userLongitude == null)
    ) {
      Alert.alert(t("shops_order.coords_title"), t("shops_order.coords_body"));
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${SERVER_URL}/api/shop/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": idemKey,
        },
        body: JSON.stringify({
          shop_id: id,
          items: cart.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
          fulfillment: cartFulfillment,
          delivery_address: cartFulfillment === "delivery" ? deliveryAddress : undefined,
          delivery_lat: cartFulfillment === "delivery" ? (userLatitude ?? undefined) : undefined,
          delivery_lng: cartFulfillment === "delivery" ? (userLongitude ?? undefined) : undefined,
          rider_notes: notes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        Alert.alert(t("shops_order.err_title"), data.message || t("shops_order.err_body"));
        return;
      }

      clearCart();
      // §12/§5: the server-quoted COD total (subtotal + distance fee) is the
      // authority — shown in the confirmation.
      const placedBody =
        data.total_bdt != null
          ? t("shops_order.placed_body_total", {
              total: formatBDT(data.total_bdt),
              fee:
                data.delivery_fee_bdt != null
                  ? formatBDT(data.delivery_fee_bdt)
                  : formatBDT(0),
            })
          : t("shops_order.placed_body");
      Alert.alert(t("shops_order.placed_title"), placedBody, [
        // F-11: land the customer ON the tracking view — the canonical
        // sequence starts there (timeline + courier panel + cancel).
        {
          text: t("common.ok"),
          onPress: () =>
            data.order_id
              ? router.replace(`/(main)/(customer)/(shops)/orders/${data.order_id}`)
              : router.replace(`/(main)/(customer)/(shops)/shop-detail/${id}`),
        },
      ]);
    } catch (err) {
      logger.error("[order-create] error", err);
      Alert.alert(t("common.error"), t("shops_order.err_body"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} testID="customer.shops.order-create.id.el-1">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
          {t("shops_order.title")}
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
        {/* Fulfillment toggle */}
        <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
          {t("shops_order.fulfillment")}
        </Text>
        <View style={{ flexDirection: "row", marginBottom: 16 }}>
          {(["delivery", "pickup"] as const).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setCartFulfillment(f)}
              style={{
                flex: 1,
                paddingVertical: 12,
                alignItems: "center",
                backgroundColor: cartFulfillment === f ? colors.primary : surfaceBg,
                borderWidth: 1,
                borderColor: cartFulfillment === f ? colors.primary : borderColor,
                borderRadius: 12,
                marginRight: f === "delivery" ? 8 : 0,
              }}
             testID="customer.shops.order-create.id.set-cart-fulfillment">
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: "JakartaSemiBold",
                  color: cartFulfillment === f ? "#FFFFFF" : textPrimary,
                }}
              >
                {f === "delivery" ? t("shops_order.delivery") : t("shops_order.pickup")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Delivery address */}
        {cartFulfillment === "delivery" && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
              {t("shops_order.delivery_address")}
            </Text>
            <TextInput
              style={{
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor,
                borderRadius: 12,
                padding: 12,
                color: textPrimary,
                fontSize: 15,
                minHeight: 60,
              }}
              placeholder={t("shops_order.delivery_address_placeholder")}
              placeholderTextColor={textSecondary}
              value={deliveryAddress ?? ""}
              onChangeText={(t) => setDeliveryAddress(t || null)}
              multiline
             testID="customer.shops.order-create.id.set-delivery-address"/>
            <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 6 }}>
              {t("shops_order.fee_hint")}
            </Text>
          </View>
        )}

        {/* Cart items */}
        <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
          {t("shops_order.order_items")}
        </Text>
        {cart.map((item) => (
          <View
            key={item.product_id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 12,
              padding: 12,
              marginBottom: 8,
            }}
          >
            <Text style={{ flex: 1, fontSize: 14, fontFamily: "JakartaMedium", color: textPrimary }}>
              {item.name} × {item.quantity}
            </Text>
            <Text style={{ fontSize: 14, fontFamily: "JakartaBold", color: colors.primary }}>
              {formatBDT(item.price_bdt * item.quantity)}
            </Text>
          </View>
        ))}

        {/* Notes */}
        <TextInput
          style={{
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 12,
            padding: 12,
            color: textPrimary,
            fontSize: 15,
            marginTop: 8,
          }}
          placeholder={t("shops_order.notes_placeholder")}
          placeholderTextColor={textSecondary}
          value={notes}
          onChangeText={setNotes}
         testID="customer.shops.order-create.id.set-notes"/>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom bar */}
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
          gap: 8,
        }}
      >
        {/* §F.3 cash disclosure — mandatory copy above the confirm CTA */}
        <Text
          style={{
            fontSize: 12,
            fontFamily: "JakartaMedium",
            color: textSecondary,
            textAlign: "center",
          }}
        >
          {t("shops_order.payment_disclosure")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: "JakartaMedium", color: textSecondary }}>{t("shops_order.total")}</Text>
            <Text style={{ fontSize: 20, fontFamily: "JakartaBold", color: colors.primary }}>
              {formatBDT(subtotal)}
            </Text>
            {cartFulfillment === "delivery" && (
              <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: textSecondary }}>
                + {t("shops_order.delivery")} {formatBDT(0)}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting || cart.length === 0}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 12,
              paddingHorizontal: 32,
              paddingVertical: 14,
              opacity: submitting || cart.length === 0 ? 0.5 : 1,
            }}
           testID="customer.shops.order-create.id.handle-submit">
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontFamily: "JakartaSemiBold" }}>
                {t("shops_order.place_order")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
