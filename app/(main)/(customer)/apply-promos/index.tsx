import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useRiderStore } from "@/store/useRiderStore";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

interface Promo {
  promo_id: string;
  code: string;
  title: string;
  category: string;
  discount_type: string;
  discount_value: number;
  max_discount_bdt: number;
  min_spend_bdt: number;
  is_eligible: boolean;
  ineligible_reason: string | null;
}

export default function ApplyPromos() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const [promoCode, setPromoCode] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(false);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [promosLoading, setPromosLoading] = useState(true);
  const { applyPromo } = useRiderStore();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const disabledBg = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setPromosLoading(false); return; }
        const res = await fetch(`${API_URL}/api/promo/list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) return;
        if (!cancelled) setPromos(data.promos ?? []);
      } catch (err) {
        logger.error("Fetch promos list failed", err);
      } finally {
        if (!cancelled) setPromosLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleApply = async () => {
    if (!promoCode.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setMessage("Not authenticated"); setMessageType("error"); setLoading(false); return; }
      const res = await fetch(`${API_URL}/api/promo/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Invalid promo code");
        setMessageType("error");
        return;
      }
      setMessage("Promo applied successfully!");
      setMessageType("success");
      if (applyPromo) await applyPromo(data.promo);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to apply promo");
      setMessageType("error");
      logger.error("Apply promo failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Apply Promo</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        <View className="mb-6">
          <Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>
            Enter Promo Code
          </Text>
          <TextInput
            className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta"
            style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
            placeholder="Enter promo code"
            placeholderTextColor={textSecondary}
            value={promoCode}
            onChangeText={setPromoCode}
          />
        </View>
        {message ? (
          <View
            className="mb-4 p-[12px] rounded-[8px] border"
            style={{
              backgroundColor: surfaceBg,
              borderColor: messageType === "success" ? colors.primary : colors.danger,
            }}
          >
            <Text className="text-[14px] font-Jakarta" style={{ color: messageType === "success" ? colors.primary : colors.danger }}>
              {message}
            </Text>
          </View>
        ) : null}
        <TouchableOpacity
          className="rounded-full py-[14px] items-center mb-6"
          style={{ backgroundColor: loading || !promoCode.trim() ? disabledBg : colors.primary }}
          onPress={handleApply}
          disabled={loading || !promoCode.trim()}
        >
          {loading ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text className="text-[16px] font-JakartaBold text-goWhite">Apply</Text>
          )}
        </TouchableOpacity>
        <View>
          <Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>
            Available Promos
          </Text>
          {promosLoading ? (
            <ActivityIndicator size="small" color={colors.primary} className="py-4" />
          ) : promos.length === 0 ? (
            <Text className="text-[14px] font-Jakarta py-4" style={{ color: textSecondary }}>
              No promos available right now.
            </Text>
          ) : (
            promos.map((promo) => (
              <TouchableOpacity
                key={promo.promo_id}
                className="flex-row items-center p-[12px] border rounded-[8px] mb-2"
                style={{ backgroundColor: surfaceBg, borderColor }}
                onPress={() => { setPromoCode(promo.code); }}
              >
                <View
                  className="w-5 h-5 rounded-full mr-3"
                  style={{ backgroundColor: promo.is_eligible ? colors.primary : disabledBg }}
                />
                <View className="flex-1">
                  <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>{promo.code}</Text>
                  <Text className="text-[12px] font-Jakarta" style={{ color: textSecondary }}>{promo.title}</Text>
                  {!promo.is_eligible && promo.ineligible_reason ? (
                    <Text className="text-[11px] font-Jakarta" style={{ color: colors.danger }}>{promo.ineligible_reason}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
