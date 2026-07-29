import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useRiderStore } from "@/store/useRiderStore";

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
  const [promoCode, setPromoCode] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(false);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [promosLoading, setPromosLoading] = useState(true);
  const { applyPromo } = useRiderStore();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setPromosLoading(false); return; }
        const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/promo/list`, {
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
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/promo/redeem`, {
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
    } catch (err: any) {
      setMessage(err?.message || "Failed to apply promo");
      setMessageType("error");
      logger.error("Apply promo failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Apply Promo</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        <View className="mb-6">
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
            Enter Promo Code
          </Text>
          <TextInput
            className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark"
            placeholder="Enter promo code"
            placeholderTextColor="#9CA3AF"
            value={promoCode}
            onChangeText={setPromoCode}
          />
        </View>
        {message ? (
          <View className={`mb-4 p-[12px] rounded-[8px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border ${messageType === "success" ? "border-goPrimary" : "border-goDanger"}`}>
            <Text className={`text-[14px] font-Jakarta ${messageType === "success" ? "text-goPrimary" : "text-goDanger"}`}>
              {message}
            </Text>
          </View>
        ) : null}
        <TouchableOpacity
          className={`rounded-full py-[14px] items-center mb-6 ${loading || !promoCode.trim() ? "bg-goBorderDark" : "bg-goPrimary"}`}
          onPress={handleApply}
          disabled={loading || !promoCode.trim()}
        >
          {loading ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[16px] font-JakartaBold text-goWhite">Apply</Text>
          )}
        </TouchableOpacity>
        <View>
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
            Available Promos
          </Text>
          {promosLoading ? (
            <ActivityIndicator size="small" color="#0CC25F" className="py-4" />
          ) : promos.length === 0 ? (
            <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark py-4">
              No promos available right now.
            </Text>
          ) : (
            promos.map((promo) => (
              <TouchableOpacity
                key={promo.promo_id}
                className="flex-row items-center p-[12px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] mb-2"
                onPress={() => { setPromoCode(promo.code); }}
              >
                <View className={`w-5 h-5 rounded-full mr-3 ${promo.is_eligible ? "bg-goPrimary" : "bg-goBorderDark"}`} />
                <View className="flex-1">
                  <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{promo.code}</Text>
                  <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{promo.title}</Text>
                  {!promo.is_eligible && promo.ineligible_reason ? (
                    <Text className="text-[11px] font-Jakarta text-goDanger">{promo.ineligible_reason}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
