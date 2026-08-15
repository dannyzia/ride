import React, { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { colors, spacing, radii } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

export interface ScheduleOption {
  label: string;
  offsetMinutes: number;
}

const PRESET_OPTIONS: ScheduleOption[] = [
  { label: "Now", offsetMinutes: 0 },
  { label: "+15 min", offsetMinutes: 15 },
  { label: "+30 min", offsetMinutes: 30 },
  { label: "+45 min", offsetMinutes: 45 },
  { label: "+60 min", offsetMinutes: 60 },
];

interface SchedulePickerProps {
  selectedIndex?: number;
  onSelect: (scheduledAt: string | null, option: ScheduleOption) => void;
}

export default function SchedulePicker({ selectedIndex = 0, onSelect }: SchedulePickerProps) {
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const isDark = useIsDark();

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const handleSelect = (index: number) => {
    setActiveIndex(index);
    const option = PRESET_OPTIONS[index];
    if (option.offsetMinutes === 0) {
      onSelect(null, option);
    } else {
      const scheduledAt = new Date(Date.now() + option.offsetMinutes * 60_000).toISOString();
      onSelect(scheduledAt, option);
    }
  };

  const selectedOption = PRESET_OPTIONS[activeIndex];

  const formattedTime = useMemo(() => {
    if (selectedOption.offsetMinutes === 0) return null;
    const d = new Date(Date.now() + selectedOption.offsetMinutes * 60_000);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  }, [activeIndex]);

  return (
    <View style={{ marginBottom: spacing.md }}>
      {/* Header row */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}>
        <MaterialIcons name="schedule" size={18} color={colors.primary} />
        <Text
          style={{
            fontFamily: "Jakarta-Bold",
            fontSize: 14,
            color: textPrimary,
            marginLeft: spacing.xs,
          }}
        >
          Pickup Time
        </Text>
        {formattedTime && (
          <View
            style={{
              marginLeft: spacing.sm,
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
              borderRadius: radii.pill,
              backgroundColor: colors.primaryLight,
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-SemiBold",
                fontSize: 12,
                color: colors.primary,
              }}
            >
              {formattedTime}
            </Text>
          </View>
        )}
      </View>

      {/* Segmented control */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {PRESET_OPTIONS.map((option, index) => {
          const isActive = index === activeIndex;
          return (
            <TouchableOpacity
              key={option.label}
              onPress={() => handleSelect(index)}
              activeOpacity={0.7}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: isActive ? colors.primary : borderColor,
                backgroundColor: isActive ? colors.primary : surfaceBg,
              }}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-SemiBold",
                  fontSize: 13,
                  color: isActive ? colors.white : textSecondary,
                  letterSpacing: 0.3,
                }}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
