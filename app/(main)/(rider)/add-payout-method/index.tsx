import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const METHOD_TYPES = [
  { key: "bkash", label: "bKash" },
  { key: "nagad", label: "Nagad" },
  { key: "rocket", label: "Rocket" },
  { key: "bank", label: "Bank Account" },
];

export default function AddPayoutMethod() {
  const [methodType, setMethodType] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showTypePicker, setShowTypePicker] = useState(false);

  const handleSave = async () => {
    if (!methodType) { setError("Select a method type"); return; }
    if (!accountNumber.trim()) { setError("Enter account number"); return; }
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/payout-methods`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ method_type: methodType, account_number: accountNumber.trim(), account_name: "", bank_name: "", branch_name: "" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save");
        return;
      }
      Alert.alert("Added", "Payout method saved.", [{ text: "OK", onPress: () => router.replace("/(main)/(rider)/payout-methods") }]);
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Add payout method failed", err);
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
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Add Payout Method</Text>
        <View className="w-[50px]" />
      </View>
      <View className="flex-1 px-[24px] pt-[24px]">
        <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Method Type</Text>
        <TouchableOpacity
          className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] mb-4"
          onPress={() => setShowTypePicker(!showTypePicker)}
        >
          <Text className="text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">
            {methodType ? METHOD_TYPES.find((m) => m.key === methodType)?.label ?? methodType : "Select method..."}
          </Text>
        </TouchableOpacity>
        {showTypePicker && (
          <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] mb-4 overflow-hidden">
            {METHOD_TYPES.map((m) => (
              <TouchableOpacity
                key={m.key}
                className={`px-[16px] py-[12px] border-b border-goBorderLight dark:border-goBorderDark ${methodType === m.key ? "bg-goAccentLight dark:bg-goPrimary/20" : ""}`}
                onPress={() => { setMethodType(m.key); setShowTypePicker(false); }}
              >
                <Text className={`text-[15px] font-Jakarta ${methodType === m.key ? "text-goPrimary font-JakartaBold" : "text-goTextPrimaryLight dark:text-goTextPrimaryDark"}`}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Account Number</Text>
        <TextInput
          className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-4"
          placeholder="01XXXXXXXXX"
          placeholderTextColor="#9CA3AF"
          keyboardType="numeric"
          value={accountNumber}
          onChangeText={setAccountNumber}
        />
        {error ? <Text className="text-[14px] font-Jakarta text-goDanger mb-3">{error}</Text> : null}
        <TouchableOpacity
          className={`rounded-full w-full py-[16px] items-center ${loading ? "bg-goBorderDark" : "bg-goPrimary"}`}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator size={20} color="#FFFFFF" /> : <Text className="text-[18px] font-JakartaBold text-goWhite">Save Method</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}