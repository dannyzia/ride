import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const LABELS = ["Home", "Work", "Gym", "Friend", "Other"];

export default function AddAddress() {
  const [label, setLabel] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const effectiveLabel = label === "Other" ? customLabel : label;

  const handleSave = async () => {
    if (!effectiveLabel.trim()) { setError("Please select or enter a label"); return; }
    if (!addressLine.trim()) { setError("Please enter an address"); return; }
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/rider/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: effectiveLabel.trim(), address: addressLine.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to save"); return; }
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Add address failed", err);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
        <View className="w-20 h-20 rounded-full bg-goAccentLight items-center justify-center mb-4">
          <Text className="text-[36px]">✅</Text>
        </View>
        <Text className="text-[22px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
          Address Added
        </Text>
        <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-2">
          {effectiveLabel} — {addressLine}
        </Text>
        <TouchableOpacity
          className="bg-goPrimary rounded-full w-full py-[16px] items-center mb-3"
          onPress={() => router.replace("/(main)/(customer)/(tabs)/settings/saved-addresses")}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">Done</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Add Address</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-3">
          Select Label
        </Text>
        <ScrollView horizontal className="mb-6">
          {LABELS.map((l) => (
            <TouchableOpacity
              key={l}
              className={`px-[20px] py-[10px] rounded-full border mr-3 ${
                label === l
                  ? "bg-goPrimary border-goPrimary"
                  : "bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border-goBorderLight dark:border-goBorderDark"
              }`}
              onPress={() => { setLabel(l); setCustomLabel(""); }}
            >
              <Text
                className={`text-[14px] font-JakartaBold ${
                  label === l ? "text-goWhite" : "text-goTextPrimaryLight dark:text-goTextPrimaryDark"
                }`}
              >
                {l}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {label === "Other" && (
          <View className="mb-6">
            <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
              Custom Label
            </Text>
            <TextInput
              className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark"
              placeholder="Enter label"
              placeholderTextColor="#9CA3AF"
              value={customLabel}
              onChangeText={setCustomLabel}
            />
          </View>
        )}
        <View className="mb-6">
          <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
            Address
          </Text>
          <TextInput
            className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark"
            placeholder="Enter full address"
            placeholderTextColor="#9CA3AF"
            value={addressLine}
            onChangeText={setAddressLine}
          />
        </View>
        {error ? <Text className="text-[14px] font-Jakarta text-goDanger mb-3">{error}</Text> : null}
        <TouchableOpacity
          className={`rounded-full w-full py-[16px] items-center mt-4 ${loading ? "bg-goBorderDark" : "bg-goPrimary"}`}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator size={20} color="#FFFFFF" /> : <Text className="text-[18px] font-JakartaBold text-goWhite">Save Address</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}