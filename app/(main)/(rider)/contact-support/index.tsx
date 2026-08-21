import { useState, useCallback } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

const CATEGORIES = [
  { key: "ride_issue", label: "Ride Issue", icon: "car-outline" as const },
  { key: "payment", label: "Payment", icon: "card-outline" as const },
  { key: "safety", label: "Safety", icon: "shield-outline" as const },
  { key: "account", label: "Account", icon: "person-outline" as const },
  { key: "vehicle", label: "Vehicle", icon: "construct-outline" as const },
  { key: "app_bug", label: "App Bug", icon: "bug-outline" as const },
  { key: "general", label: "Other", icon: "help-circle-outline" as const },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

export default function ContactSupport() {
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [subject, setSubject] = useState("");
  const [msg, setMsg] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const pickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setAttachment(result.assets[0].uri);
      }
    } catch (e) {
      logger.warn("[contact-support] image pick failed", e);
    }
  }, []);

  const handleSend = async () => {
    if (!category) {
      setError("Please select a category");
      return;
    }
    if (!subject.trim()) {
      setError("Please enter a subject");
      return;
    }
    if (!msg.trim()) {
      setError("Please describe your issue");
      return;
    }
    if (msg.trim().length < 10) {
      setError("Please provide more detail (at least 10 characters)");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not authenticated");
        return;
      }
      const res = await fetch(`${API_URL}/api/support/ticket`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category,
          subject: subject.trim().slice(0, 200),
          description: msg.trim(),
          // Note: attachment upload requires server-side support.
          // The image URI is stored locally; a future API extension
          // should accept multipart/form-data with the attachment.
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Failed to send");
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("Contact support failed", err);
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = CATEGORIES.find((c) => c.key === category);

  const inputStyle = {
    borderWidth: 1,
    borderColor,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: "Jakarta-Regular" as const,
    fontSize: 15,
    color: textPrimary,
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      {/* Header */}
      <View
        className="flex-row items-center px-[24px] py-[16px] border-b"
        style={{ borderBottomColor: borderColor }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-[12px] p-[4px]"
        >
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          className="flex-1 text-center text-[18px] font-JakartaBold"
          style={{ color: textPrimary }}
        >
          Contact Support
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        className="flex-1 px-[24px]"
        contentContainerStyle={{ paddingVertical: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {sent ? (
          <View className="items-center py-[60px]">
            <View
              className="w-20 h-20 rounded-full items-center justify-center mb-4"
              style={{
                backgroundColor: isDark
                  ? colors.primaryLightDark
                  : colors.primaryLight,
              }}
            >
              <Ionicons
                name="checkmark-circle"
                size={40}
                color={colors.primary}
              />
            </View>
            <Text
              className="text-[18px] font-JakartaBold mb-1"
              style={{ color: textPrimary }}
            >
              Ticket Submitted
            </Text>
            <Text
              className="text-[14px] font-Jakarta text-center mb-6"
              style={{ color: textSecondary }}
            >
              Our support team will review your request and get back to you
              within 24 hours.
            </Text>
            <TouchableOpacity
              className="rounded-full px-[24px] py-[12px]"
              style={{ backgroundColor: colors.primary }}
              onPress={() => router.back()}
            >
              <Text className="text-[15px] font-JakartaBold text-white">
                Done
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Category */}
            <Text
              className="text-[14px] font-JakartaSemiBold mb-2"
              style={{ color: textPrimary }}
            >
              Category
            </Text>
            <TouchableOpacity
              className="rounded-[12px] p-[14px] mb-4 flex-row items-center justify-between"
              style={{
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor: category ? colors.primary : borderColor,
              }}
              onPress={() => setShowCategoryPicker(!showCategoryPicker)}
            >
              <View className="flex-row items-center gap-2">
                {selectedCategory ? (
                  <>
                    <Ionicons
                      name={selectedCategory.icon}
                      size={18}
                      color={colors.primary}
                    />
                    <Text
                      className="text-[15px] font-JakartaSemiBold"
                      style={{ color: textPrimary }}
                    >
                      {selectedCategory.label}
                    </Text>
                  </>
                ) : (
                  <Text
                    className="text-[15px] font-Jakarta"
                    style={{ color: textSecondary }}
                  >
                    Select a category
                  </Text>
                )}
              </View>
              <Ionicons
                name={
                  showCategoryPicker
                    ? "chevron-up"
                    : "chevron-down"
                }
                size={18}
                color={textSecondary}
              />
            </TouchableOpacity>

            {/* Category grid */}
            {showCategoryPicker && (
              <View
                className="flex-row flex-wrap gap-2 mb-4 p-[12px] rounded-[12px]"
                style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
              >
                {CATEGORIES.map((cat) => {
                  const selected = category === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      className="flex-row items-center gap-1.5 px-[12px] py-[8px] rounded-full"
                      style={{
                        backgroundColor: selected
                          ? colors.primary
                          : isDark
                            ? colors.darkSecondary
                            : colors.gray100,
                        borderWidth: 1,
                        borderColor: selected ? colors.primary : borderColor,
                      }}
                      onPress={() => {
                        setCategory(cat.key);
                        setShowCategoryPicker(false);
                      }}
                    >
                      <Ionicons
                        name={cat.icon}
                        size={14}
                        color={selected ? colors.white : textSecondary}
                      />
                      <Text
                        className="text-[13px] font-JakartaSemiBold"
                        style={{
                          color: selected ? colors.white : textPrimary,
                        }}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Subject */}
            <Text
              className="text-[14px] font-JakartaSemiBold mb-2"
              style={{ color: textPrimary }}
            >
              Subject
            </Text>
            <TextInput
              style={inputStyle}
              placeholder="Brief summary of your issue"
              placeholderTextColor={textSecondary}
              value={subject}
              onChangeText={setSubject}
              maxLength={200}
              className="mb-4"
            />

            {/* Message */}
            <Text
              className="text-[14px] font-JakartaSemiBold mb-2"
              style={{ color: textPrimary }}
            >
              Description
            </Text>
            <TextInput
              style={{
                ...inputStyle,
                minHeight: 120,
                textAlignVertical: "top",
                paddingTop: spacing.md,
              }}
              placeholder="Describe your issue in detail..."
              placeholderTextColor={textSecondary}
              value={msg}
              onChangeText={setMsg}
              multiline
              numberOfLines={5}
            />
            <Text
              className="text-[11px] font-Jakarta mt-1 mb-4"
              style={{ color: textSecondary }}
            >
              {msg.length} / 2000 characters
            </Text>

            {/* Attachment */}
            <Text
              className="text-[14px] font-JakartaSemiBold mb-2"
              style={{ color: textPrimary }}
            >
              Attachment (optional)
            </Text>
            {attachment ? (
              <View className="mb-4">
                <View className="flex-row items-center gap-3 p-[12px] rounded-[12px]"
                  style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
                >
                  <Image
                    source={{ uri: attachment }}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: radii.md,
                    }}
                  />
                  <View className="flex-1">
                    <Text
                      className="text-[13px] font-JakartaSemiBold"
                      style={{ color: textPrimary }}
                    >
                      Screenshot attached
                    </Text>
                    <Text
                      className="text-[11px] font-Jakarta"
                      style={{ color: textSecondary }}
                    >
                      Tap to change
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setAttachment(null)}>
                    <Ionicons
                      name="close-circle"
                      size={22}
                      color={colors.danger}
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  className="mt-2"
                  onPress={pickImage}
                >
                  <Text
                    className="text-[13px] font-Jakarta"
                    style={{ color: colors.primary }}
                  >
                    Replace image
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                className="rounded-[12px] p-[16px] items-center mb-4"
                style={{
                  backgroundColor: surfaceBg,
                  borderWidth: 1,
                  borderColor,
                  borderStyle: "dashed",
                }}
                onPress={pickImage}
              >
                <Ionicons
                  name="image-outline"
                  size={28}
                  color={textSecondary}
                />
                <Text
                  className="text-[13px] font-Jakarta mt-2"
                  style={{ color: textSecondary }}
                >
                  Tap to add a screenshot
                </Text>
                <Text
                  className="text-[11px] font-Jakarta mt-0.5"
                  style={{ color: textSecondary }}
                >
                  JPG or PNG, max 5MB
                </Text>
              </TouchableOpacity>
            )}

            {/* Error */}
            {error ? (
              <View
                className="rounded-[12px] p-[12px] mb-4 flex-row items-center gap-2"
                style={{ backgroundColor: `${colors.danger}14` }}
              >
                <Ionicons
                  name="alert-circle"
                  size={16}
                  color={colors.danger}
                />
                <Text
                  className="text-[13px] font-Jakarta flex-1"
                  style={{ color: colors.danger }}
                >
                  {error}
                </Text>
              </View>
            ) : null}

            {/* Submit */}
            <TouchableOpacity
              className="rounded-full w-full py-[16px] items-center"
              style={{
                backgroundColor:
                  loading || !category ? colors.borderDark : colors.primary,
              }}
              onPress={handleSend}
              disabled={loading || !category}
            >
              {loading ? (
                <ActivityIndicator size={20} color="#FFFFFF" />
              ) : (
                <Text
                  className="text-[18px] font-JakartaBold"
                  style={{ color: colors.white }}
                >
                  Submit Ticket
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
