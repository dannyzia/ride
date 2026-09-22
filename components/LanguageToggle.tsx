import React from "react";
import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { toggleLanguage } from "@/i18n/i18n";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";

/**
 * Free-floating language toggle (EN ↔ বাংলা) — content-only circular button
 * that FILLS its parent (the parent owns all positioning: the (auth) layout
 * mounts it beside the theme toggle; the GlobalActionButtons draggable stack
 * crowns it as its topmost member). Static labels — never passed through
 * t() (no new locale keys). Label shows the TARGET language (plan D8,
 * Zia-ruled 2026-09-17): "বাং" when active=en, "EN" when active=bn.
 * Bengali glyphs fall back to the system font under Jakarta (established).
 */
export default function LanguageToggle() {
  const isDark = useIsDark();
  const { i18n } = useTranslation();
  const target = i18n.language === "bn" ? "EN" : "বাং";

  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;

  return (
    <Pressable
      onPress={toggleLanguage}
      accessibilityRole="button"
      accessibilityLabel="Switch language"
      hitSlop={12}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: surfaceBg,
        borderWidth: 1,
        borderColor,
      }}
    >
      <Text
        style={{
          fontFamily: "Jakarta-SemiBold",
          fontSize: 13,
          color: textPrimary,
        }}
      >
        {target}
      </Text>
    </Pressable>
  );
}
