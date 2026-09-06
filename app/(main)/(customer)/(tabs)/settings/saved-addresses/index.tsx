import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { colors } from "@/theme/goRide";
import { useAppearance, useIsDark } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useTranslation } from "react-i18next";
import EmptyState from "@/components/EmptyState";

interface AddressItem {
  id: string;
  label: string;
  address: string;
  details: string | null;
  is_favorite: boolean;
}

function addressIcon(label: string): keyof typeof Ionicons.glyphMap {
  const normalized = label.toLowerCase();
  if (normalized.includes("home")) return "home";
  if (normalized.includes("work") || normalized.includes("office")) return "business-outline";
  return "location-outline";
}

export default function SavedAddresses() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const skeletonBg = isDark ? colors.darkSecondary : colors.gray100;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchAddresses = useCallback(async () => {
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(t('saved_addresses.not_authenticated'));
        return;
      }
      const res = await fetch(`${API_URL}/api/rider/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || data.error || t('saved_addresses.load_failed'));
        return;
      }
      const data = await res.json();
      setAddresses(data.addresses ?? []);
    } catch (err) {
      setError(t('saved_addresses.network_error'));
      logger.error("[saved-addresses] fetch failed", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAddresses();
  };

  const deleteAddress = (address: AddressItem) => {
    Alert.alert(
      t('saved_addresses.delete_title'),
      t('saved_addresses.delete_message', { label: address.label }),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('common.delete'),
          style: "destructive",
          onPress: async () => {
            try {
              const {
                data: { session },
              } = await supabase.auth.getSession();
              const token = session?.access_token;
              if (!token) {
                Alert.alert(t('common.error'), t('saved_addresses.not_authenticated'));
                return;
              }
              const res = await fetch(`${API_URL}/api/rider/addresses?id=${address.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                Alert.alert(t('common.error'), data.message || data.error || t('saved_addresses.delete_failed'));
                return;
              }
              setAddresses((prev) => prev.filter((a) => a.id !== address.id));
            } catch (err) {
              Alert.alert(t('common.error'), t('saved_addresses.network_error'));
              logger.error("[saved-addresses] delete failed", err);
            }
          },
        },
      ],
    );
  };

  const renderSkeleton = () => (
    <View style={styles.listContent}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={[styles.card, { backgroundColor: surfaceBg, borderColor }]}
        >
          <View style={[styles.iconBox, { backgroundColor: skeletonBg }]} />
          <View style={styles.skeletonTextCol}>
            <View style={[styles.skeletonLine, { backgroundColor: skeletonBg, width: "40%" }]} />
            <View style={[styles.skeletonLine, { backgroundColor: skeletonBg, width: "80%" }]} />
          </View>
        </View>
      ))}
    </View>
  );

  const renderItem = ({ item }: { item: AddressItem }) => (
    <View style={[styles.card, { backgroundColor: surfaceBg, borderColor }]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t('saved_addresses.a11y_address', { label: item.label })}
        style={styles.cardBody}
        onPress={() =>
          router.push(`/(main)/(customer)/(tabs)/settings/saved-addresses/${item.id}`)
        }
        activeOpacity={0.8}
      >
        <View style={[styles.iconBox, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name={addressIcon(item.label)} size={24} color={colors.primary} />
        </View>
        <View style={styles.addressCol}>
          <View style={styles.labelRow}>
            <Text style={[styles.labelText, { color: textPrimary }]} numberOfLines={1}>
              {item.label}
            </Text>
            {item.is_favorite ? (
              <Ionicons name="star" size={14} color={colors.amber} />
            ) : null}
          </View>
          <Text style={[styles.addressText, { color: textSecondary }]} numberOfLines={2}>
            {item.address}
          </Text>
          {item.details ? (
            <Text style={[styles.detailsText, { color: textSecondary }]} numberOfLines={1}>
              {item.details}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t('saved_addresses.a11y_delete', { label: item.label })}
        onPress={() => deleteAddress(item)}
        style={styles.deleteButton}
        hitSlop={4}
      >
        <Ionicons name="trash-outline" size={20} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('saved_addresses.a11y_go_back')}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: textPrimary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {t('saved_addresses.title')}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('saved_addresses.a11y_toggle_theme')}
          onPress={() => setTheme(isDark ? "light" : "dark")}
          hitSlop={8}
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={24} color={textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        renderSkeleton()
      ) : error ? (
        <View style={styles.errorWrap}>
          <View style={[styles.errorBanner, { backgroundColor: `${colors.danger}1A` }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('saved_addresses.a11y_retry')}
              style={[styles.retryButton, { borderColor: colors.danger }]}
              onPress={() => {
                setLoading(true);
                fetchAddresses();
              }}
            >
              <Text style={[styles.retryText, { color: colors.danger }]}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="location-outline"
              title={t('saved_addresses.empty_title')}
              subtitle={t('saved_addresses.empty_subtitle')}
              actionLabel={t('saved_addresses.add')}
              onAction={() =>
                router.push("/(main)/(customer)/(tabs)/settings/saved-addresses/add-address")
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
    textAlign: "center",
  },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
  },
  cardBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    minHeight: 80,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addressCol: {
    flex: 1,
    gap: 2,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  labelText: {
    flex: 1,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  addressText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  detailsText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 2,
  },
  deleteButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  skeletonTextCol: {
    flex: 1,
    gap: 8,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
  },
  errorWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  errorBanner: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  errorText: {
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
  },
  retryButton: {
    alignSelf: "flex-start",
    minHeight: 48,
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 20,
  },
  retryText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
});
