import { useMemo } from "react";
import { Text, TouchableOpacity, ScrollView } from "react-native";
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { dhakaTodayKey, bdtDayBoundariesUtc } from "@/lib/time";

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

/**
 * Compare two dates by their Asia/Dhaka calendar day.
 * Uses fixed UTC+6 offset — correct regardless of device timezone.
 */
const isSameDhakaDay = (a: Date, b: Date) =>
  dhakaTodayKey(a) === dhakaTodayKey(b);

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
    // Anchor to Dhaka "today" using the fixed UTC+6 offset — correct
    // regardless of the device's timezone setting.
    const todayKey = dhakaTodayKey();

    // If a minDate is provided, use its Dhaka day as the start
    let startKey = todayKey;
    if (minDate) {
      startKey = dhakaTodayKey(minDate);
    }
    const [sy, sm, sd] = startKey.split("-").map(Number);

    return Array.from({ length: dayCount }, (_, i) => {
      const dayDate = new Date(Date.UTC(sy, sm - 1, sd + i));
      const key = `${dayDate.getUTCFullYear()}-${String(dayDate.getUTCMonth() + 1).padStart(2, "0")}-${String(dayDate.getUTCDate()).padStart(2, "0")}`;
      const boundaries = bdtDayBoundariesUtc(key);
      const utcAnchor = boundaries ? boundaries.start : dayDate;
      // Store the BDT date parts for display (UTC anchor is midnight BDT,
      // but getDate() on it returns the UTC date, not BDT).
      return { utcAnchor, bdtDay: dayDate.getUTCDate(), bdtDow: dayDate.getUTCDay(), key };
    });
  }, [minDate, dayCount]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm }}
    >
      {days.map(({ utcAnchor, bdtDay, bdtDow }, index) => {
        const isSelected = selectedDate !== null && isSameDhakaDay(utcAnchor, selectedDate);
        const label =
          index === 0 ? "Today" : index === 1 ? "Tomorrow" : DAY_NAMES[bdtDow];
        return (
          <TouchableOpacity
            key={utcAnchor.toISOString()}
            onPress={() => onSelectDate(utcAnchor)}
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
              {bdtDay}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
