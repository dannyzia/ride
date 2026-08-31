/**
 * Shop detail screen — browse products, add to cart, create order/RFQ.
 */
import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { useShopStore } from "@/store/useShopStore";

import { logger } from "@/lib/logger";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

export default function ShopDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const { selectedShop, selectedProducts, setSelectedShop, setSelectedProducts, cart, addToCart, removeFromCart } =
    useShopStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, [id]);

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
        <Text style={{ color: textPrimary, fontSize: 16 }}>Shop not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
          {selectedShop.name}
        </Text>
        {selectedShop.is_verified && (
          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
        )}
      </View>

      {/* Products */}
      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
        {selectedProducts.length === 0 ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Ionicons name="bag-outline" size={48} color={textSecondary} />
            <Text style={{ fontSize: 16, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 12 }}>
              No products yet
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
                    ৳{(product.price_bdt / 100).toFixed(0)}
                  </Text>
                </View>
                {inCart ? (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <TouchableOpacity
                      onPress={() => removeFromCart(product.id)}
                      style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.danger + "18", alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="remove" size={16} color={colors.danger} />
                    </TouchableOpacity>
                    <Text style={{ marginHorizontal: 12, fontSize: 15, fontFamily: "JakartaBold", color: textPrimary }}>
                      {inCart.quantity}
                    </Text>
                    <TouchableOpacity
                      onPress={() => addToCart(product)}
                      style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="add" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => addToCart(product)}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="add" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Cart bar */}
      {cartCount > 0 && (
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
              {cartCount} item{cartCount > 1 ? "s" : ""} — ৳{(cartTotal / 100).toFixed(0)}
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
          >
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontFamily: "JakartaSemiBold" }}>
              Checkout
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
