import { useState, useEffect, useCallback, useMemo } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string | null;
}

export default function DriverFAQ() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const fetchFaqs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/faqs?role=driver`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed");
        setLoading(false);
        return;
      }
      setFaqs(data.faqs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("DriverFAQ fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs]);

  const toggle = (index: number) =>
    setExpanded(expanded === index ? null : index);

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    faqs.forEach((f) => {
      if (f.category) cats.add(f.category);
    });
    return Array.from(cats).sort();
  }, [faqs]);

  // Filter FAQs by search and category
  const filteredFaqs = useMemo(() => {
    let result = faqs;
    if (selectedCategory) {
      result = result.filter((f) => f.category === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.question.toLowerCase().includes(q) ||
          f.answer.toLowerCase().includes(q),
      );
    }
    return result;
  }, [faqs, search, selectedCategory]);

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
          FAQ
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ marginTop: 40 }}
        />
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Ionicons
            name="alert-circle-outline"
            size={40}
            color={colors.danger}
          />
          <Text
            className="text-[14px] font-Jakarta mt-3 text-center"
            style={{ color: colors.danger }}
          >
            {error}
          </Text>
          <TouchableOpacity onPress={fetchFaqs} className="mt-3">
            <Text
              className="text-[14px] font-JakartaBold"
              style={{ color: colors.primary }}
            >
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Search bar */}
          <View className="px-[24px] py-[12px]">
            <View
              className="flex-row items-center rounded-[12px] px-[14px] py-[10px]"
              style={{
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor,
              }}
            >
              <Ionicons name="search" size={18} color={textSecondary} />
              <TextInput
                className="flex-1 ml-2 text-[14px] font-Jakarta"
                style={{ color: textPrimary }}
                placeholder="Search FAQs..."
                placeholderTextColor={textSecondary}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Category chips */}
          {categories.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="px-[24px] mb-3"
              contentContainerStyle={{ gap: 8 }}
            >
              <TouchableOpacity
                onPress={() => setSelectedCategory(null)}
                className="px-[12px] py-[6px] rounded-full"
                style={{
                  backgroundColor: !selectedCategory
                    ? colors.primary
                    : surfaceBg,
                  borderWidth: 1,
                  borderColor: !selectedCategory ? colors.primary : borderColor,
                }}
              >
                <Text
                  className="text-[12px] font-JakartaSemiBold"
                  style={{
                    color: !selectedCategory ? colors.white : textPrimary,
                  }}
                >
                  All
                </Text>
              </TouchableOpacity>
              {categories.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setSelectedCategory(active ? null : cat)}
                    className="px-[12px] py-[6px] rounded-full"
                    style={{
                      backgroundColor: active ? colors.primary : surfaceBg,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : borderColor,
                    }}
                  >
                    <Text
                      className="text-[12px] font-JakartaSemiBold"
                      style={{ color: active ? colors.white : textPrimary }}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* FAQ list */}
          <ScrollView
            className="flex-1 px-[24px]"
            contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }}
          >
            {filteredFaqs.length === 0 ? (
              <View className="items-center py-[40px]">
                <Ionicons
                  name="search-outline"
                  size={40}
                  color={textSecondary}
                />
                <Text
                  className="text-[14px] font-Jakarta mt-3 text-center"
                  style={{ color: textSecondary }}
                >
                  No matching FAQs found
                </Text>
              </View>
            ) : (
              filteredFaqs.map((f, i) => (
                <TouchableOpacity
                  key={f.id}
                  className="p-[14px] mb-3 rounded-[12px] border"
                  style={
                    expanded === i
                      ? {
                          backgroundColor: isDark
                            ? colors.primaryLightDark
                            : colors.primaryLight,
                          borderColor: colors.primary,
                        }
                      : { backgroundColor: surfaceBg, borderColor }
                  }
                  onPress={() => toggle(i)}
                >
                  <View className="flex-row justify-between items-center">
                    <Text
                      className="text-[14px] font-JakartaBold flex-1 mr-2"
                      style={{ color: textPrimary }}
                    >
                      {f.question}
                    </Text>
                    <Ionicons
                      name={expanded === i ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={textSecondary}
                    />
                  </View>
                  {expanded === i && (
                    <Text
                      className="text-[13px] font-Jakarta mt-2 leading-5"
                      style={{ color: textSecondary }}
                    >
                      {f.answer}
                    </Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}
