import { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
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
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useAppearance, useIsDark } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

interface FaqsResponse {
  faqs?: {
    id: string | number;
    question: string;
    answer: string;
    category?: string | null;
    sort_order?: number;
  }[];
  error?: string;
}

const FAQ_FALLBACKS: { id: string; questionKey: string; answerKey: string }[] = [
  {
    id: "fallback-1",
    questionKey: "faq.fallback_1_question",
    answerKey: "faq.fallback_1_answer",
  },
  {
    id: "fallback-2",
    questionKey: "faq.fallback_2_question",
    answerKey: "faq.fallback_2_answer",
  },
  {
    id: "fallback-3",
    questionKey: "faq.fallback_3_question",
    answerKey: "faq.fallback_3_answer",
  },
  {
    id: "fallback-4",
    questionKey: "faq.fallback_4_question",
    answerKey: "faq.fallback_4_answer",
  },
  {
    id: "fallback-5",
    questionKey: "faq.fallback_5_question",
    answerKey: "faq.fallback_5_answer",
  },
  {
    id: "fallback-6",
    questionKey: "faq.fallback_6_question",
    answerKey: "faq.fallback_6_answer",
  },
];

export default function SettingsFAQ() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const { t } = useTranslation();

  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surface = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;
  const textDisabled = isDark
    ? colors.textDisabledDark
    : colors.textDisabledLight;
  const skeletonBlock = isDark ? colors.darkSecondary : colors.gray100;

  const toFaqItems = (fallbacks: typeof FAQ_FALLBACKS) =>
    fallbacks.map((f) => ({
      id: f.id,
      question: t(f.questionKey),
      answer: t(f.answerKey),
    }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/faqs?role=rider`);
      const data = (await res.json()) as FaqsResponse;
      const rows = Array.isArray(data.faqs) ? data.faqs : [];
      if (!res.ok) {
        logger.error(`[settings/faq] API error status ${res.status}`);
      }
      if (!res.ok || rows.length === 0) {
        setFaqs(toFaqItems(FAQ_FALLBACKS));
        setUsingFallback(true);
        return;
      }
      setFaqs(
        rows.map((row) => ({
          id: String(row.id),
          question: row.question,
          answer: row.answer,
        }))
      );
      setUsingFallback(false);
    } catch (err) {
      logger.error("[settings/faq] fetch failed", err);
      setFaqs(toFaqItems(FAQ_FALLBACKS));
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? "light-content" : "dark-content"}
      />
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>{t('settings.faq')}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('faq.toggle_theme')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => setTheme(isDark ? "light" : "dark")}
        >
          <Ionicons
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={24}
            color={textPrimary}
          />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          [0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[styles.faqCard, { backgroundColor: surface }]}
            >
              <View style={[styles.skeletonQuestion, { backgroundColor: skeletonBlock }]} />
              <View style={[styles.skeletonAnswer, { backgroundColor: skeletonBlock }]} />
            </View>
          ))
        ) : (
          <>
            {usingFallback ? (
              <View style={styles.fallbackRow}>
                <Text style={[styles.fallbackText, { color: textSecondary }]}>
                  {t('faq.showing_common')}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('faq.retry_loading_a11y')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={load}
                >
                  <Text style={styles.fallbackRetry}>{t('common.retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {faqs.map((faq) => {
              const isOpen = openId === faq.id;
              return (
                <TouchableOpacity
                  key={faq.id}
                  accessibilityRole="button"
                  accessibilityLabel={faq.question}
                  accessibilityState={{ expanded: isOpen }}
                  activeOpacity={0.8}
                  onPress={() => setOpenId(isOpen ? null : faq.id)}
                  style={[styles.faqCard, { backgroundColor: surface }]}
                >
                  <View style={styles.faqHeaderRow}>
                    <Text style={[styles.faqQuestion, { color: textPrimary }]}>
                      {faq.question}
                    </Text>
                    <Ionicons
                      name={isOpen ? "remove" : "add"}
                      size={20}
                      color={textDisabled}
                    />
                  </View>
                  {isOpen ? (
                    <Text style={[styles.faqAnswer, { color: textSecondary }]}>
                      {faq.answer}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
  },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  fallbackRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  fallbackText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
  },
  fallbackRetry: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
    color: colors.primary,
  },
  faqCard: {
    borderRadius: 16,
    padding: 16,
  },
  faqHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  faqAnswer: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    paddingTop: 12,
  },
  skeletonQuestion: {
    height: 16,
    width: "70%",
    borderRadius: 8,
  },
  skeletonAnswer: {
    height: 12,
    width: "45%",
    borderRadius: 8,
    marginTop: 12,
  },
});
