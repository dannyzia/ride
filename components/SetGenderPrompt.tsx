/**
 * SetGenderPrompt.tsx — S8 §4.2 in-app prompt for legacy `unspecified` users.
 *
 * Rendered on rider home and driver home. Shows only when the authenticated
 * user's gender is 'unspecified' AND the client-side 7-day snooze has expired.
 * Options are Male / Female / Other (no "Prefer not to say" — declaring is an
 * active choice). A choice PATCHes /api/user/me (write-once); "Later"
 * snoozes for 7 days via AsyncStorage.
 */
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { API_URL } from "@/lib/config";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import type { Gender } from "@/src/db/schema";

const SEVEN_DAYS_MS = 7 * 86400 * 1000;

type PromptGender = Exclude<Gender, "unspecified">;

const OPTIONS: { value: PromptGender; labelKey: string }[] = [
  { value: "male", labelKey: "gender_male" },
  { value: "female", labelKey: "gender_female" },
  { value: "other", labelKey: "gender_other" },
];

export default function SetGenderPrompt() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const snoozedUntil = await AsyncStorage.getItem(
          STORAGE_KEYS.GENDER_PROMPT_SNOOZED_UNTIL,
        );
        if (snoozedUntil && Number(snoozedUntil) > Date.now()) return;
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token || !active) return;
        const res = await fetch(`${API_URL}/api/user/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || !active) return;
        const data: { user?: { gender?: string } } = await res.json();
        if (data?.user?.gender === "unspecified" && active) setVisible(true);
      } catch (e) {
        logger.error("[SetGenderPrompt] eligibility check failed", e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const choose = async (gender: PromptGender) => {
    if (saving) return;
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/user/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ gender }),
      });
      if (res.ok) {
        setVisible(false);
      } else {
        const data = await res.json().catch(() => null);
        logger.error("[SetGenderPrompt] PATCH failed", data);
      }
    } catch (e) {
      logger.error("[SetGenderPrompt] PATCH error", e);
    } finally {
      setSaving(false);
    }
  };

  const snooze = async () => {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.GENDER_PROMPT_SNOOZED_UNTIL,
        String(Date.now() + SEVEN_DAYS_MS),
      );
    } catch (e) {
      logger.error("[SetGenderPrompt] snooze write failed", e);
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={snooze}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <View
          testID="set-gender-prompt.card"
          style={{
            backgroundColor: colors.surfaceLight,
            borderRadius: 20,
            padding: 24,
            width: "100%",
          }}
        >
          <Text
            style={{
              fontFamily: "Jakarta-Bold",
              fontSize: 20,
              color: colors.textPrimaryLight,
              marginBottom: 8,
            }}
          >
            {t("prompt_set_gender_title")}
          </Text>
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 14,
              color: colors.textSecondaryLight,
              marginBottom: 20,
            }}
          >
            {t("prompt_set_gender_body")}
          </Text>
          {OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              testID={`set-gender-prompt.set-${opt.value}`}
              onPress={() => choose(opt.value)}
              disabled={saving}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                marginBottom: 10,
                opacity: saving ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-Bold",
                  fontSize: 15,
                  color: colors.white,
                }}
              >
                {t(opt.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            testID="set-gender-prompt.snooze"
            onPress={snooze}
            disabled={saving}
            style={{ paddingVertical: 10, alignItems: "center" }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 14,
                color: colors.textSecondaryLight,
              }}
            >
              {t("prompt_set_gender_later")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
