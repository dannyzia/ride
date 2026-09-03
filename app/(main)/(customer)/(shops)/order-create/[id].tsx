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
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { useShopStore } from "@/store/useShopStore";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

export default function OrderCreateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
    selectedShop,
    clearCart,
  } = useShopStore();

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const subtotal = cart.reduce((sum, i) => sum + i.price_bdt * i.quantity, 0);

  const handleSubmit = async () => {
    if (cartFulfillment === "delivery" && !deliveryAddress) {
      Alert.alert("Delivery Address", "Please enter a delivery address");
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
        },
        body: JSON.stringify({
          shop_id: id,
          items: cart.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
          fulfillment: cartFulfillment,
          delivery_address: cartFulfillment === "delivery" ? deliveryAddress : undefined,
          rider_notes: notes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Order Failed", data.message || "Could not place order");
        return;
      }

      clearCart();
      Alert.alert("Order Placed", "Your order has been placed successfully", [
        { text: "OK", onPress: () => router.replace(`/(main)/(customer)/(shops)/shop-detail/${id}`) },
      ]);
    } catch (err) {
      logger.error("[order-create] error", err);
      Alert.alert("Error", "Could not place order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
          Checkout
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
        {/* Fulfillment toggle */}
        <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
          Fulfillment
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
            >
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: "JakartaSemiBold",
                  color: cartFulfillment === f ? "#FFFFFF" : textPrimary,
                }}
              >
                {f === "delivery" ? "Delivery" : "Pickup"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Delivery address */}
        {cartFulfillment === "delivery" && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
              Delivery Address
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
              placeholder="Enter delivery address..."
              placeholderTextColor={textSecondary}
              value={deliveryAddress ?? ""}
              onChangeText={(t) => setDeliveryAddress(t || null)}
              multiline
            />
          </View>
        )}

        {/* Cart items */}
        <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
          Order Items
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
              ৳{((item.price_bdt * item.quantity) / 100).toFixed(0)}
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
          placeholder="Any notes for the shop?"
          placeholderTextColor={textSecondary}
          value={notes}
          onChangeText={setNotes}
        />

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
          Payment is made directly to the driver/shop — not through the app.
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: "JakartaMedium", color: textSecondary }}>Total</Text>
            <Text style={{ fontSize: 20, fontFamily: "JakartaBold", color: colors.primary }}>
              ৳{(subtotal / 100).toFixed(0)}
            </Text>
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
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontFamily: "JakartaSemiBold" }}>
                Place Order
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
