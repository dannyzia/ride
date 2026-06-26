import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { spacing, radii, colors } from "@/theme/goRide";
import { logger } from "@/lib/logger";

export interface Preference {
  id: string;
  name: string;
  display_label_en: string;
  display_label_bn: string;
  icon: string | null;
  charge_bdt: number;
  affects_matching: boolean;
}

interface PreferenceChipsProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export default function PreferenceChips({
  selectedIds,
  onChange,
  disabled = false,
}: PreferenceChipsProps) {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPreferences = useCallback(async () => {
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SERVER_URL}/api/reference/preferences`,
      );
      if (res.ok) {
        const data = await res.json();
        setPreferences(data.preferences ?? []);
      }
    } catch (err) {
      logger.error("[PreferenceChips] fetch error", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  if (loading) {
    return (
      <View style={{ paddingVertical: spacing.md, alignItems: "center" }}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (preferences.length === 0) return null;

  const toggle = (id: string) => {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text
        style={{
          fontFamily: "Urbanist",
          fontWeight: "600",
          fontSize: 13,
          color: colors.textSecondaryDark,
          marginBottom: spacing.sm,
        }}
      >
        Ride Preferences
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {preferences.map((pref) => {
          const isSelected = selectedIds.includes(pref.id);
          return (
            <TouchableOpacity
              key={pref.id}
              onPress={() => toggle(pref.id)}
              disabled={disabled}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: isSelected ? colors.primary : colors.borderDark,
                backgroundColor: isSelected
                  ? colors.primary + "20"
                  : colors.surfaceElevatedDark,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter",
                  fontSize: 12,
                  fontWeight: "500",
                  color: isSelected ? colors.primary : colors.textSecondaryDark,
                }}
              >
                {pref.display_label_en}
              </Text>
              {pref.charge_bdt > 0 && (
                <Text
                  style={{
                    fontFamily: "Inter",
                    fontSize: 10,
                    color: colors.textDisabledDark,
                    marginLeft: 4,
                  }}
                >
                  +৳{(pref.charge_bdt / 100).toFixed(0)}
                </Text>
              )}
              {pref.affects_matching && (
                <View
                  style={{
                    marginLeft: 4,
                    paddingHorizontal: 4,
                    paddingVertical: 1,
                    borderRadius: 4,
                    backgroundColor: colors.info + "20",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter",
                      fontSize: 9,
                      color: colors.info,
                    }}
                  >
                    filter
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
