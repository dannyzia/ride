import { useMemo } from "react";
import { Text, TouchableOpacity, ScrollView } from "react-native";
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface DatePickerProps {
  /** Currently selected date (only the date part is used). */
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  /** First selectable day (defaults to today). */
  minDate?: Date;
  /** Number of selectable days (defaults to 7 — the schedule API's max lead). */
  dayCount?: number;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export default function DatePicker({
  selectedDate,
  onSelectDate,
  minDate,
  dayCount = 7,
}: DatePickerProps) {
  const isDark = useIsDark();

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const days = useMemo(() => {
    const start = minDate ? new Date(minDate) : new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: dayCount }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [minDate, dayCount]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm }}
    >
      {days.map((day, index) => {
        const isSelected = selectedDate !== null && isSameDay(day, selectedDate);
        const label =
          index === 0 ? "Today" : index === 1 ? "Tomorrow" : DAY_NAMES[day.getDay()];
        return (
          <TouchableOpacity
            key={day.toISOString()}
            onPress={() => onSelectDate(day)}
            accessibilityRole="button"
            accessibilityLabel={`Select ${label}`}
            style={{
              minWidth: 68,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.sm,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: isSelected ? colors.primary : borderColor,
              backgroundColor: isSelected ? colors.primary : surfaceBg,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-Medium",
                fontSize: 12,
                color: isSelected ? colors.white : textSecondary,
              }}
            >
              {label}
            </Text>
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 18,
                marginTop: 2,
                color: isSelected ? colors.white : textPrimary,
              }}
            >
              {day.getDate()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
