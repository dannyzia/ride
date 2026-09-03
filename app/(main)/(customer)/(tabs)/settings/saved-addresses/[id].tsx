import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

interface AddressItem {
  id: string;
  label: string;
  address: string;
  details?: string;
  lat: number | null;
  lng: number | null;
}

export default function AddressDetail() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const { id } = useLocalSearchParams<{ id: string }>();
  const [address, setAddress] = useState<AddressItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError("");
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError(t('wallet.not_authenticated')); setLoading(false); return; }
        const res = await fetch(`${API_URL}/api/rider/addresses?id=${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || t('saved_addresses.load_failed_short')); return; }
        if (!cancelled) setAddress(data.addresses?.[0] ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error && err.message ? err.message : t('wallet.network_error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleDelete = async () => {
    Alert.alert(
      t('saved_addresses.delete_title'),
      t('saved_addresses.delete_confirm'),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('common.delete'),
          style: "destructive",
          onPress: async () => {
            setDeleting(true); setError("");
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const token = session?.access_token;
              if (!token) { setError(t('wallet.not_authenticated')); setDeleting(false); return; }
               const res = await fetch(`${API_URL}/api/rider/addresses?id=${id}`, {
                 method: "DELETE",
                 headers: { Authorization: `Bearer ${token}` },
               });
              if (!res.ok) { setError(t('saved_addresses.delete_failed_short')); setDeleting(false); return; }
              router.replace("/(main)/(customer)/(tabs)/settings/saved-addresses");
            } catch (err) {
              setError(err instanceof Error && err.message ? err.message : t('wallet.network_error'));
              logger.error("Delete address failed", err);
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('saved_addresses.details_title')}</Text>
        <TouchableOpacity onPress={() => setShowMore(!showMore)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>
      {showMore && (
        <View className="border-b px-[24px] py-3" style={{ backgroundColor: surfaceBg, borderColor }}>
          <TouchableOpacity className="py-2" onPress={() => { setShowMore(false); }}>
            <Text className="text-[15px] font-Jakarta" style={{ color: textPrimary }}>{t('saved_addresses.set_pickup')}</Text>
          </TouchableOpacity>
          <TouchableOpacity className="py-2" onPress={() => { setShowMore(false); }}>
            <Text className="text-[15px] font-Jakarta" style={{ color: textPrimary }}>{t('saved_addresses.set_destination')}</Text>
          </TouchableOpacity>
          <TouchableOpacity className="py-2" onPress={() => { setShowMore(false); }}>
            <Text className="text-[15px] font-Jakarta" style={{ color: textPrimary }}>{t('saved_addresses.edit')}</Text>
          </TouchableOpacity>
          <TouchableOpacity className="py-2" onPress={handleDelete}>
            <Text className="text-[15px] font-Jakarta" style={{ color: colors.danger }}>{t('saved_addresses.delete_address')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-center" style={{ color: colors.danger }}>{error}</Text>
        </View>
      ) : address ? (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          <View className="p-[16px] border rounded-[12px]" style={{ backgroundColor: surfaceBg, borderColor }}>
            <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>{address.label}</Text>
            <Text className="text-[14px] font-Jakarta mt-2" style={{ color: textSecondary }}>{address.address}</Text>
            {deleting ? (
              <ActivityIndicator size="small" color={colors.primary} className="mt-4" />
            ) : (
              <TouchableOpacity
                className="mt-4 py-[12px] border rounded-full items-center"
                style={{ borderColor: colors.danger }}
                onPress={handleDelete}
              >
                <Text className="text-[16px] font-JakartaBold" style={{ color: colors.danger }}>{t('saved_addresses.delete_title')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta" style={{ color: textSecondary }}>{t('saved_addresses.not_found')}</Text>
        </View>
      )}
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-16 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
