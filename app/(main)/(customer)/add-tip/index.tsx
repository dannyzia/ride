import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useRiderStore } from "@/store/useRiderStore";
import { colors, fonts, radii } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

const PRESET_TIPS_BDT = [0, 20, 50, 100]; // in BDT (not paisa)

export default function AddTip() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const { activeRide } = useRiderStore();
  const [tipAmount, setTipAmount] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const surface = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const border = isDark ? colors.borderDark : colors.borderLight;
  const bg = isDark ? colors.bgDark : colors.bgLight;

  const handleAddTip = async () => {
    const finalAmount = customTip ? parseInt(customTip, 10) : tipAmount;
    if (finalAmount === 0) {
      router.replace("/(main)/(customer)/services-hub");
      return;
    }
    if (!activeRide?.id) return;
    setSubmitting(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); setSubmitting(false); return; }
      const res = await fetch(`${API_URL}/api/ride/${activeRide.id}/tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount_bdt: finalAmount * 100 }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Tip failed");
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      router.replace("/(main)/(customer)/services-hub");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
      logger.error("Tip submission error", err);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: border }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 16, fontFamily: fonts.body, color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 18, fontFamily: fonts.heading, color: textPrimary }}>Add Tip</Text>
        <View style={{ width: 50 }} />
      </View>
      <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ alignItems: "center", marginBottom: 24, marginTop: 16 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.accentLight, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Text style={{ fontSize: 28, fontFamily: fonts.heading, letterSpacing: -0.5, color: colors.primary }}>
              {activeRide?.driver?.name?.charAt(0) ?? "D"}
            </Text>
          </View>
          <Text style={{ fontSize: 20, fontFamily: fonts.heading, letterSpacing: -0.5, color: textPrimary, marginBottom: 24 }}>
            {activeRide?.driver?.name ?? "Driver"}
          </Text>
        </View>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.heading, color: textPrimary, marginBottom: 8 }}>
            Tip Amount
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {PRESET_TIPS_BDT.map((amount) => {
              const selected = amount === tipAmount && !customTip;
              return (
                <TouchableOpacity
                  key={amount}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : border,
                    backgroundColor: selected ? colors.accentLight : surface,
                  }}
                  onPress={() => {
                    setTipAmount(amount);
                    setCustomTip("");
                  }}
                >
                  <Text style={{ fontSize: 14, fontFamily: fonts.body, color: selected ? colors.primary : textPrimary }}>
                    {amount === 0 ? "No Tip" : `৳${amount}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={{ backgroundColor: surface, borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontFamily: fonts.body, color: textPrimary }}
            placeholder="Or enter custom amount (BDT)"
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondaryLight}
            value={customTip}
            onChangeText={(text) => {
              setCustomTip(text);
              if (text) setTipAmount(0);
            }}
            keyboardType="numeric"
          />
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: 24 }}>
        {error ? <Text style={{ fontSize: 14, fontFamily: fonts.body, color: colors.danger, textAlign: "center", marginBottom: 12 }}>{error}</Text> : null}
        <TouchableOpacity
          style={{ backgroundColor: colors.primary, borderRadius: radii.pill, width: "100%", paddingVertical: 16, alignItems: "center" }}
          onPress={handleAddTip}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text style={{ fontSize: 18, fontFamily: fonts.heading, color: colors.white }}>Add Tip</Text>
          )}
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surface, borderWidth: 1, borderColor: border }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
