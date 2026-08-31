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
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { useShopStore } from "@/store/useShopStore";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

export default function ShopListScreen() {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const { shops, shopsLoading, shopsPage, setShops, setShopsLoading, setShopsPage } =
    useShopStore();
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchShops = useCallback(
    async (page: number, searchQuery?: string) => {
      setShopsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const params = new URLSearchParams({ page: String(page), limit: "20" });
        if (searchQuery) params.set("search", searchQuery);
        const res = await fetch(`${SERVER_URL}/api/shop/list?${params}`);
        if (!res.ok) throw new Error("Failed to fetch shops");
        const data = await res.json();
        if (page === 1) {
          setShops(data.shops);
        } else {
          setShops([...shops, ...data.shops]);
        }
        setHasMore(data.shops.length >= 20);
      } catch (err) {
        logger.error("[shop-list] fetch error", err);
      } finally {
        setShopsLoading(false);
      }
    },
    [shops],
  );

  useEffect(() => {
    fetchShops(1, search);
  }, []);

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
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}
        >
          Shops
        </Text>
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
            placeholder="Search shops..."
            placeholderTextColor={textSecondary}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
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
          >
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
                <Text style={{ fontSize: 16, fontFamily: "JakartaSemiBold", color: textPrimary }}>
                  {shop.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 13, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}
                >
                  {shop.description || "No description"}
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
              No shops found
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
