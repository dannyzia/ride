/**
 * Shop listing screen — browse available shops.
 * Fetches from GET /api/shop/list with pagination.
 */
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { useLocalSearchParams } from "expo-router";
import { useShopStore } from "@/store/useShopStore";

import { logger } from "@/lib/logger";
import { useTranslation } from "react-i18next";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

export default function ShopListScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { language } = useAppearance();
  // §5: the good-morning category tile passes its slug; the list filters to
  // that category and the header shows the locale label.
  const { type } = useLocalSearchParams<{ type?: string }>();
  const typeSlug = typeof type === "string" && type.length > 0 ? type : undefined;
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const { shops, shopsLoading, shopsPage, setShops, appendShops, setShopsLoading, setShopsPage } =
    useShopStore();
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchShops = useCallback(
    async (page: number, searchQuery?: string) => {
      setShopsLoading(true);
      try {
        
        const params = new URLSearchParams({ page: String(page), limit: "20" });
        if (searchQuery) params.set("search", searchQuery);
        if (typeSlug) params.set("type", typeSlug);
        const res = await fetch(`${SERVER_URL}/api/shop/list?${params}`);
        if (!res.ok) throw new Error("Failed to fetch shops");
        const data = await res.json();
        if (page === 1) {
          setShops(data.shops);
        } else {
          // C5-8: append via the functional store update, never the
          // captured `shops` closure (a second page resolving late would
          // otherwise clobber the first one's rows).
          appendShops(data.shops);
        }
        setHasMore(data.shops.length >= 20);
      } catch (err) {
        logger.error("[shop-list] fetch error", err);
      } finally {
        setShopsLoading(false);
      }
    },
    [setShops, appendShops, setShopsLoading, typeSlug],
  );

useEffect(() => {
     fetchShops(1, search);
   }, [fetchShops, search]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchShops(1, search);
    setShopsPage(1);
    setRefreshing(false);
  };

  const handleSearch = () => {
    setShopsPage(1);
    fetchShops(1, search);
  };

  const handleLoadMore = () => {
    if (!shopsLoading && hasMore) {
      const nextPage = shopsPage + 1;
      setShopsPage(nextPage);
      fetchShops(nextPage, search);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} testID="customer.shops.el-1">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}
        >
          {typeSlug
            ? // Locale label comes from the joined type fields on the rows;
              // fall back to the generic title while loading/empty.
              (shops.find((s) => s.shop_type_slug === typeSlug)
                ? language === "bn"
                  ? (shops.find((s) => s.shop_type_slug === typeSlug)?.shop_type_label_bn ?? t("shops.title"))
                  : (shops.find((s) => s.shop_type_slug === typeSlug)?.shop_type_label_en ?? t("shops.title"))
                : t("shops.title"))
            : t("shops.title")}
        </Text>
        {/* F-11 tracking entry — the caller's own orders across shops. */}
        <TouchableOpacity
          onPress={() => router.push("/(main)/(customer)/(shops)/orders")}
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center", marginLeft: 8 }}
         testID="customer.shops.push-orders">
          <Ionicons name="receipt-outline" size={20} color={colors.primary} />
          <Text style={{ fontSize: 13, fontFamily: "JakartaSemiBold", color: colors.primary, marginLeft: 4 }}>
            {t("shops_track.my_orders")}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 12,
            paddingHorizontal: 12,
            height: 44,
          }}
        >
          <Ionicons name="search" size={18} color={textSecondary} />
          <TextInput
            style={{ flex: 1, marginLeft: 8, color: textPrimary, fontSize: 15 }}
            placeholder={t("shops.search_placeholder")}
            placeholderTextColor={textSecondary}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
           testID="customer.shops.set-search"/>
        </View>
      </View>

      {/* Shop list */}
      <ScrollView
        style={{ flex: 1, paddingHorizontal: 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        onMomentumScrollEnd={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 100) {
            handleLoadMore();
          }
        }}
      >
        {shops.map((shop) => (
          <TouchableOpacity
            key={shop.id}
            onPress={() => router.push(`/(main)/(customer)/(shops)/shop-detail/${shop.id}`)}
            style={{
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 16,
              padding: 16,
              marginBottom: 12,
            }}
           testID="customer.shops.push-shop-detail">
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: colors.primary + "18",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="storefront" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ fontSize: 16, fontFamily: "JakartaSemiBold", color: textPrimary }}>
                    {shop.name}
                  </Text>
                  {!shop.is_open && (
                    <View
                      style={{
                        marginLeft: 6,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 6,
                        backgroundColor: colors.danger + "18",
                      }}
                    >
                      <Text style={{ fontSize: 10, fontFamily: "JakartaSemiBold", color: colors.danger }}>
                        {t("shops.closed")}
                      </Text>
                    </View>
                  )}
                  {shop.shop_type_is_restaurant && (
                    <View
                      style={{
                        marginLeft: 6,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 6,
                        backgroundColor: colors.amber + "18",
                      }}
                    >
                      <Text style={{ fontSize: 10, fontFamily: "JakartaSemiBold", color: colors.amber }}>
                        {t("shops.food_badge")}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 13, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}
                >
                  {shop.description || t("shops.no_description")}
                </Text>
              </View>
              {shop.is_verified && (
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              )}
            </View>
          </TouchableOpacity>
        ))}

        {shopsLoading && (
          <View style={{ padding: 20, alignItems: "center" }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}

        {!shopsLoading && shops.length === 0 && (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Ionicons name="storefront-outline" size={48} color={textSecondary} />
            <Text style={{ fontSize: 16, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 12 }}>
              {typeSlug ? t("shops.empty_category") : t("shops.empty")}
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
