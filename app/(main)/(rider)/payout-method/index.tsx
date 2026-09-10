import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

interface PayoutMethod {
  id: string;
  method_type: "bkash" | "nagad" | "bank";
  account_number: string;
  account_number_masked: string;
  account_name: string | null;
  bank_name: string | null;
  branch_name: string | null;
  is_default: boolean;
  is_active: boolean;
}

type MethodType = "bkash" | "nagad" | "bank";

const METHOD_TYPE_OPTIONS: { label: string; value: MethodType }[] = [
  { label: "bKash", value: "bkash" },
  { label: "Nagad", value: "nagad" },
  { label: "Bank", value: "bank" },
];

const PHONE_REGEX = /^01\d{9}$/;

const METHOD_ICONS: Record<MethodType, string> = {
  bkash: "wallet-outline",
  nagad: "card-outline",
  bank: "business-outline",
};

export default function PayoutMethodScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  // List state
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add flow
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<MethodType>("bkash");
  const [addAccountNumber, setAddAccountNumber] = useState("");
  const [addAccountName, setAddAccountName] = useState("");
  const [addBankName, setAddBankName] = useState("");
  const [addBranchName, setAddBranchName] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit flow
  const [editMethod, setEditMethod] = useState<PayoutMethod | null>(null);
  const [editAccountNumber, setEditAccountNumber] = useState("");
  const [editAccountName, setEditAccountName] = useState("");
  const [editBankName, setEditBankName] = useState("");
  const [editBranchName, setEditBranchName] = useState("");
  const [editing, setEditing] = useState(false);

  // Delete flow
  const [deleting, setDeleting] = useState(false);

  const fetchMethods = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(t("driver.payout_method.not_authenticated"));
        return;
      }

      const res = await fetch(`${API_URL}/api/driver/payout-method`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError(t("driver.payout_method.failed_to_load"));
        return;
      }
      const data = await res.json();
      setMethods(data.payout_methods ?? []);
    } catch (e) {
      logger.error("[payout-method] fetch error", e);
      setError(t("driver.payout_method.network_error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchMethods();
  }, [fetchMethods]);

  // --- Add ---
  const resetAdd = () => {
    setShowAdd(false);
    setAddType("bkash");
    setAddAccountNumber("");
    setAddAccountName("");
    setAddBankName("");
    setAddBranchName("");
  };

  const handleAdd = async () => {
    const digits = addAccountNumber.replace(/\D/g, "");
    if ((addType === "bkash" || addType === "nagad") && !PHONE_REGEX.test(digits)) {
      Alert.alert(
        t("driver.payout_method.invalid_number"),
        t("driver.payout_method.invalid_phone_hint"),
      );
      return;
    }
    if (addType === "bank" && (digits.length < 8 || digits.length > 20)) {
      Alert.alert(
        t("driver.payout_method.invalid_number"),
        t("driver.payout_method.invalid_bank_hint"),
      );
      return;
    }

    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        Alert.alert("Error", t("driver.payout_method.not_authenticated"));
        return;
      }

      const body: Record<string, unknown> = {
        method_type: addType,
        account_number: digits,
      };
      if (addAccountName.trim()) body.account_name = addAccountName.trim();
      if (addType === "bank") {
        if (addBankName.trim()) body.bank_name = addBankName.trim();
        if (addBranchName.trim()) body.branch_name = addBranchName.trim();
      }

      const res = await fetch(`${API_URL}/api/driver/payout-method`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        Alert.alert("Error", data.message ?? t("driver.payout_method.save_failed"));
        return;
      }

      resetAdd();
      await fetchMethods();
    } catch (e) {
      logger.error("[payout-method] add error", e);
      Alert.alert("Error", t("driver.payout_method.network_error"));
    } finally {
      setSaving(false);
    }
  };

  // --- Edit ---
  const openEdit = (m: PayoutMethod) => {
    setEditMethod(m);
    setEditAccountNumber(""); // Never prefilled — require full re-entry
    setEditAccountName(m.account_name ?? "");
    setEditBankName(m.bank_name ?? "");
    setEditBranchName(m.branch_name ?? "");
  };

  const resetEdit = () => {
    setEditMethod(null);
    setEditAccountNumber("");
    setEditAccountName("");
    setEditBankName("");
    setEditBranchName("");
  };

  const handleEdit = async () => {
    if (!editMethod) return;
    const digits = editAccountNumber.replace(/\D/g, "");
    if (
      (editMethod.method_type === "bkash" || editMethod.method_type === "nagad") &&
      editAccountNumber.length > 0 &&
      !PHONE_REGEX.test(digits)
    ) {
      Alert.alert(
        t("driver.payout_method.invalid_number"),
        t("driver.payout_method.invalid_phone_hint"),
      );
      return;
    }

    setEditing(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        Alert.alert("Error", t("driver.payout_method.not_authenticated"));
        return;
      }

      const body: Record<string, unknown> = {};
      if (editAccountNumber.trim()) body.account_number = digits;
      if (editAccountName.trim()) body.account_name = editAccountName.trim();
      if (editMethod.method_type === "bank") {
        if (editBankName.trim()) body.bank_name = editBankName.trim();
        if (editBranchName.trim()) body.branch_name = editBranchName.trim();
      }

      if (Object.keys(body).length === 0) {
        resetEdit();
        return;
      }

      const res = await fetch(
        `${API_URL}/api/driver/payout-method?id=${editMethod.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const data = await res.json();
        Alert.alert("Error", data.message ?? t("driver.payout_method.save_failed"));
        return;
      }

      resetEdit();
      await fetchMethods();
    } catch (e) {
      logger.error("[payout-method] edit error", e);
      Alert.alert("Error", t("driver.payout_method.network_error"));
    } finally {
      setEditing(false);
    }
  };

  // --- Delete ---
  const confirmDelete = (m: PayoutMethod) => {
    Alert.alert(
      t("driver.payout_method.delete_confirm_title"),
      t("driver.payout_method.delete_confirm_body", {
        type: t(`driver.payout_method.type_${m.method_type}`),
        number: m.account_number_masked,
      }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => handleDelete(m),
        },
      ],
    );
  };

  const handleDelete = async (m: PayoutMethod) => {
    setDeleting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(
        `${API_URL}/api/driver/payout-method?id=${m.id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.ok) {
        const data = await res.json();
        Alert.alert("Error", data.message ?? t("driver.payout_method.delete_failed"));
        return;
      }

      await fetchMethods();
    } catch (e) {
      logger.error("[payout-method] delete error", e);
      Alert.alert("Error", t("driver.payout_method.network_error"));
    } finally {
      setDeleting(false);
    }
  };

  // --- Validation helpers ---
  const addDigits = addAccountNumber.replace(/\D/g, "");
  const addValid =
    addType === "bank"
      ? addDigits.length >= 8 && addDigits.length <= 20
      : PHONE_REGEX.test(addDigits);

  const editDigits = editAccountNumber.replace(/\D/g, "");
  const editValid =
    !editAccountNumber ||
    (editMethod?.method_type === "bank"
      ? editDigits.length >= 8 && editDigits.length <= 20
      : PHONE_REGEX.test(editDigits));

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: bg }}
      >
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={bg}
        />
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: bg }}
      >
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={bg}
        />
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text
          className="text-base font-JakartaBold mt-4 text-center"
          style={{ color: textPrimary }}
        >
          {error}
        </Text>
        <TouchableOpacity
          className="mt-4 px-6 py-3 rounded-xl"
          style={{ backgroundColor: colors.primary }}
          onPress={fetchMethods}
          accessibilityRole="button"
          accessibilityLabel={t("common.retry")}
        >
          <Text className="text-white font-JakartaBold text-sm">
            {t("common.retry")}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // --- List view ---
  if (!showAdd && !editMethod) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={bg}
        />
        {/* Header */}
        <View
          className="flex-row items-center px-5 py-4 border-b"
          style={{ borderColor }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-3"
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
          >
            <Ionicons name="chevron-back" size={24} color={textPrimary} />
          </TouchableOpacity>
          <Text
            className="text-[18px] font-JakartaBold flex-1"
            style={{ color: textPrimary }}
          >
            {t("driver.payout_method.title")}
          </Text>
          <TouchableOpacity
            onPress={() => setTheme(isDark ? "light" : "dark")}
            accessibilityRole="button"
            accessibilityLabel={t("settings.appearance.toggle_theme")}
          >
            <Ionicons
              name={isDark ? "sunny-outline" : "moon-outline"}
              size={20}
              color={textPrimary}
            />
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingVertical: 20 }}>
          {methods.length === 0 ? (
            <View
              className="rounded-xl p-6 items-center"
              style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
            >
              <Ionicons
                name="wallet-outline"
                size={48}
                color={textSecondary}
              />
              <Text
                className="text-base font-JakartaBold mt-3 text-center"
                style={{ color: textPrimary }}
              >
                {t("driver.payout_method.no_methods")}
              </Text>
              <Text
                className="text-sm mt-1 text-center"
                style={{ color: textSecondary }}
              >
                {t("driver.payout_method.no_methods_hint")}
              </Text>
            </View>
          ) : (
            methods.map((m) => (
              <View
                key={m.id}
                className="rounded-xl p-4 mb-3"
                style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
              >
                <View className="flex-row items-center mb-2">
                  <Ionicons
                    name={METHOD_ICONS[m.method_type] as any}
                    size={20}
                    color={colors.primary}
                  />
                  <Text
                    className="text-sm font-JakartaBold ml-2 flex-1"
                    style={{ color: textPrimary }}
                  >
                    {t(`driver.payout_method.type_${m.method_type}`)}
                  </Text>
                  {m.is_default && (
                    <View
                      className="px-2 py-0.5 rounded"
                      style={{ backgroundColor: colors.primary + "20" }}
                    >
                      <Text
                        className="text-[10px] font-JakartaBold"
                        style={{ color: colors.primary }}
                      >
                        {t("driver.payout_method.default")}
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="text-sm" style={{ color: textSecondary }}>
                  {m.account_number_masked}
                </Text>
                {m.account_name && (
                  <Text className="text-xs mt-1" style={{ color: textSecondary }}>
                    {m.account_name}
                  </Text>
                )}
                {m.method_type === "bank" && m.bank_name && (
                  <Text className="text-xs mt-1" style={{ color: textSecondary }}>
                    {m.bank_name}
                    {m.branch_name ? ` — ${m.branch_name}` : ""}
                  </Text>
                )}
                <View className="flex-row mt-3 gap-2">
                  <TouchableOpacity
                    className="px-3 py-1.5 rounded-lg"
                    style={{ backgroundColor: colors.primary + "15" }}
                    onPress={() => openEdit(m)}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.edit")}
                  >
                    <Text
                      className="text-xs font-JakartaBold"
                      style={{ color: colors.primary }}
                    >
                      {t("common.edit")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="px-3 py-1.5 rounded-lg"
                    style={{ backgroundColor: colors.danger + "15" }}
                    onPress={() => confirmDelete(m)}
                    disabled={deleting}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.delete")}
                  >
                    <Text
                      className="text-xs font-JakartaBold"
                      style={{ color: colors.danger }}
                    >
                      {t("common.delete")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {/* Add button */}
          <TouchableOpacity
            className="rounded-xl py-4 items-center mt-4"
            style={{ backgroundColor: colors.primary }}
            onPress={() => setShowAdd(true)}
            accessibilityRole="button"
            accessibilityLabel={t("driver.payout_method.add_new")}
          >
            <View className="flex-row items-center">
              <Ionicons name="add-circle-outline" size={20} color={colors.white} />
              <Text className="text-white font-JakartaBold text-[15px] ml-2">
                {t("driver.payout_method.add_new")}
              </Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- Add flow ---
  if (showAdd) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={bg}
        />
        <View
          className="flex-row items-center px-5 py-4 border-b"
          style={{ borderColor }}
        >
          <TouchableOpacity onPress={resetAdd} className="mr-3">
            <Ionicons name="chevron-back" size={24} color={textPrimary} />
          </TouchableOpacity>
          <Text
            className="text-[18px] font-JakartaBold flex-1"
            style={{ color: textPrimary }}
          >
            {t("driver.payout_method.add_new")}
          </Text>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ paddingVertical: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Type selector */}
            <Text
              className="text-xs font-JakartaSemiBold mb-2 uppercase"
              style={{ color: textSecondary }}
            >
              {t("driver.payout_method.select_type")}
            </Text>
            <View className="flex-row gap-2 mb-5">
              {METHOD_TYPE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  className="flex-1 py-3 rounded-xl items-center"
                  style={{
                    backgroundColor:
                      addType === opt.value ? colors.primary + "20" : surfaceBg,
                    borderWidth: 1,
                    borderColor:
                      addType === opt.value ? colors.primary : borderColor,
                  }}
                  onPress={() => setAddType(opt.value)}
                >
                  <Ionicons
                    name={METHOD_ICONS[opt.value] as any}
                    size={20}
                    color={addType === opt.value ? colors.primary : textSecondary}
                  />
                  <Text
                    className="text-xs font-JakartaBold mt-1"
                    style={{
                      color: addType === opt.value ? colors.primary : textSecondary,
                    }}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Account number */}
            <Text
              className="text-xs font-JakartaSemiBold mb-2 uppercase"
              style={{ color: textSecondary }}
            >
              {addType === "bank"
                ? t("driver.payout_method.bank_account_number")
                : t("driver.payout_method.phone_number")}
            </Text>
            <View
              className="flex-row items-center rounded-xl px-4 py-3 mb-2"
              style={{
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor:
                  addAccountNumber.length > 0 && !addValid
                    ? colors.danger
                    : borderColor,
              }}
            >
              {addType !== "bank" && (
                <Text
                  className="text-sm font-JakartaBold mr-3"
                  style={{ color: textSecondary }}
                >
                  +880
                </Text>
              )}
              <TextInput
                className="flex-1 text-[15px]"
                style={{ color: textPrimary }}
                placeholder={
                  addType === "bank"
                    ? t("driver.payout_method.bank_account_hint")
                    : "01XXXXXXXXX"
                }
                placeholderTextColor={colors.textDisabledDark}
                value={addAccountNumber}
                onChangeText={(v) =>
                  setAddAccountNumber(v.replace(/[^0-9]/g, "").slice(0, addType === "bank" ? 20 : 11))
                }
                keyboardType="number-pad"
                maxLength={addType === "bank" ? 20 : 11}
                accessibilityLabel={addType === "bank" ? t("driver.payout_method.bank_account_number") : t("driver.payout_method.phone_number")}
              />
            </View>

            {/* Account name */}
            <Text
              className="text-xs font-JakartaSemiBold mb-2 mt-4 uppercase"
              style={{ color: textSecondary }}
            >
              {t("driver.payout_method.account_name")}
            </Text>
            <TextInput
              className="rounded-xl px-4 py-3 text-[15px]"
              style={{
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor,
                color: textPrimary,
              }}
              placeholder={t("driver.payout_method.account_name_hint")}
              placeholderTextColor={colors.textDisabledDark}
              value={addAccountName}
              onChangeText={setAddAccountName}
              accessibilityLabel={t("driver.payout_method.account_name")}
            />

            {/* Bank-specific fields */}
            {addType === "bank" && (
              <>
                <Text
                  className="text-xs font-JakartaSemiBold mb-2 mt-4 uppercase"
                  style={{ color: textSecondary }}
                >
                  {t("driver.payout_method.bank_name")}
                </Text>
                <TextInput
                  className="rounded-xl px-4 py-3 text-[15px]"
                  style={{
                    backgroundColor: surfaceBg,
                    borderWidth: 1,
                    borderColor,
                    color: textPrimary,
                  }}
                  placeholder={t("driver.payout_method.bank_name_hint")}
                  placeholderTextColor={colors.textDisabledDark}
                  value={addBankName}
                  onChangeText={setAddBankName}
                  accessibilityLabel={t("driver.payout_method.bank_name")}
                />

                <Text
                  className="text-xs font-JakartaSemiBold mb-2 mt-4 uppercase"
                  style={{ color: textSecondary }}
                >
                  {t("driver.payout_method.branch_name")}
                </Text>
                <TextInput
                  className="rounded-xl px-4 py-3 text-[15px]"
                  style={{
                    backgroundColor: surfaceBg,
                    borderWidth: 1,
                    borderColor,
                    color: textPrimary,
                  }}
                  placeholder={t("driver.payout_method.branch_name_hint")}
                  placeholderTextColor={colors.textDisabledDark}
                  value={addBranchName}
                  onChangeText={setAddBranchName}
                  accessibilityLabel={t("driver.payout_method.branch_name")}
                />
              </>
            )}

            {/* Save button */}
            <TouchableOpacity
              className="rounded-xl py-4 items-center mt-6"
              style={{
                backgroundColor: addValid ? colors.primary : colors.textDisabledDark,
              }}
              onPress={handleAdd}
              disabled={!addValid || saving}
              accessibilityRole="button"
              accessibilityLabel={t("driver.payout_method.add_new")}
            >
              {saving ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text className="text-white font-JakartaBold text-[15px]">
                  {t("driver.payout_method.add_new")}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // --- Edit flow ---
  if (editMethod) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={bg}
        />
        <View
          className="flex-row items-center px-5 py-4 border-b"
          style={{ borderColor }}
        >
          <TouchableOpacity onPress={resetEdit} className="mr-3">
            <Ionicons name="chevron-back" size={24} color={textPrimary} />
          </TouchableOpacity>
          <Text
            className="text-[18px] font-JakartaBold flex-1"
            style={{ color: textPrimary }}
          >
            {t("driver.payout_method.edit_method")}
          </Text>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ paddingVertical: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Current method info */}
            <View
              className="rounded-xl p-4 mb-5"
              style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
            >
              <View className="flex-row items-center mb-2">
                <Ionicons
                  name={METHOD_ICONS[editMethod.method_type] as any}
                  size={18}
                  color={colors.primary}
                />
                <Text
                  className="text-sm font-JakartaBold ml-2"
                  style={{ color: textPrimary }}
                >
                  {t(`driver.payout_method.type_${editMethod.method_type}`)}
                </Text>
                {editMethod.is_default && (
                  <View
                    className="px-2 py-0.5 rounded ml-2"
                    style={{ backgroundColor: colors.primary + "20" }}
                  >
                    <Text
                      className="text-[10px] font-JakartaBold"
                      style={{ color: colors.primary }}
                    >
                      {t("driver.payout_method.default")}
                    </Text>
                  </View>
                )}
              </View>
              <Text className="text-sm" style={{ color: textSecondary }}>
                {editMethod.account_number_masked}
              </Text>
            </View>

            {/* Account number (never prefilled — require full re-entry) */}
            <Text
              className="text-xs font-JakartaSemiBold mb-2 uppercase"
              style={{ color: textSecondary }}
            >
              {editMethod.method_type === "bank"
                ? t("driver.payout_method.bank_account_number")
                : t("driver.payout_method.phone_number")}
            </Text>
            <View
              className="flex-row items-center rounded-xl px-4 py-3 mb-2"
              style={{
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor:
                  editAccountNumber.length > 0 && !editValid
                    ? colors.danger
                    : borderColor,
              }}
            >
              {editMethod.method_type !== "bank" && (
                <Text
                  className="text-sm font-JakartaBold mr-3"
                  style={{ color: textSecondary }}
                >
                  +880
                </Text>
              )}
              <TextInput
                className="flex-1 text-[15px]"
                style={{ color: textPrimary }}
                placeholder={
                  editMethod.method_type === "bank"
                    ? t("driver.payout_method.bank_account_hint")
                    : "01XXXXXXXXX"
                }
                placeholderTextColor={colors.textDisabledDark}
                value={editAccountNumber}
                onChangeText={(v) =>
                  setEditAccountNumber(v.replace(/[^0-9]/g, "").slice(0, editMethod.method_type === "bank" ? 20 : 11))
                }
                keyboardType="number-pad"
                maxLength={editMethod.method_type === "bank" ? 20 : 11}
                accessibilityLabel={editMethod.method_type === "bank" ? t("driver.payout_method.bank_account_number") : t("driver.payout_method.phone_number")}
              />
            </View>

            {/* Account name */}
            <Text
              className="text-xs font-JakartaSemiBold mb-2 mt-4 uppercase"
              style={{ color: textSecondary }}
            >
              {t("driver.payout_method.account_name")}
            </Text>
            <TextInput
              className="rounded-xl px-4 py-3 text-[15px]"
              style={{
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor,
                color: textPrimary,
              }}
              placeholder={t("driver.payout_method.account_name_hint")}
              placeholderTextColor={colors.textDisabledDark}
              value={editAccountName}
              onChangeText={setEditAccountName}
              accessibilityLabel={t("driver.payout_method.account_name")}
            />

            {/* Bank-specific fields */}
            {editMethod.method_type === "bank" && (
              <>
                <Text
                  className="text-xs font-JakartaSemiBold mb-2 mt-4 uppercase"
                  style={{ color: textSecondary }}
                >
                  {t("driver.payout_method.bank_name")}
                </Text>
                <TextInput
                  className="rounded-xl px-4 py-3 text-[15px]"
                  style={{
                    backgroundColor: surfaceBg,
                    borderWidth: 1,
                    borderColor,
                    color: textPrimary,
                  }}
                  placeholder={t("driver.payout_method.bank_name_hint")}
                  placeholderTextColor={colors.textDisabledDark}
                  value={editBankName}
                  onChangeText={setEditBankName}
                  accessibilityLabel={t("driver.payout_method.bank_name")}
                />

                <Text
                  className="text-xs font-JakartaSemiBold mb-2 mt-4 uppercase"
                  style={{ color: textSecondary }}
                >
                  {t("driver.payout_method.branch_name")}
                </Text>
                <TextInput
                  className="rounded-xl px-4 py-3 text-[15px]"
                  style={{
                    backgroundColor: surfaceBg,
                    borderWidth: 1,
                    borderColor,
                    color: textPrimary,
                  }}
                  placeholder={t("driver.payout_method.branch_name_hint")}
                  placeholderTextColor={colors.textDisabledDark}
                  value={editBranchName}
                  onChangeText={setEditBranchName}
                  accessibilityLabel={t("driver.payout_method.branch_name")}
                />
              </>
            )}

            {/* Save button */}
            <TouchableOpacity
              className="rounded-xl py-4 items-center mt-6"
              style={{
                backgroundColor: editValid ? colors.primary : colors.textDisabledDark,
              }}
              onPress={handleEdit}
              disabled={!editValid || editing}
              accessibilityRole="button"
              accessibilityLabel={t("common.save")}
            >
              {editing ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text className="text-white font-JakartaBold text-[15px]">
                  {t("common.save")}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return null;
}
