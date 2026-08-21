import { useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { dhakaTodayKey, bdtDayBoundariesUtc } from "@/lib/time";

interface TimePickerProps {
  /** Selected date — slots are generated for this day (null = today). */
  date: Date | null;
  /** Currently selected time (only the time-of-day part is used). */
  selectedTime: Date | null;
  onSelectTime: (time: Date) => void;
}

const SLOT_MS = 30 * 60 * 1000;
const MIN_LEAD_MS = 30 * 60 * 1000;

/** Extract BDT minutes-since-midnight from a Date stored as a BDT slot. */
function bdtMinutes(slotUtcMs: number, bdtMidnightUtcMs: number): number {
  return Math.round((slotUtcMs - bdtMidnightUtcMs) / 60000);
}

/** Format a BDT time label from minutes-since-midnight. */
function bdtTimeLabel(minutesSinceMidnight: number): string {
  const h = Math.floor(minutesSinceMidnight / 60);
  const m = minutesSinceMidnight % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function TimePicker({ date, selectedTime, onSelectTime }: TimePickerProps) {
  const isDark = useIsDark();

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  // 30-minute slots anchored to the selected Dhaka day's midnight (UTC).
  // On "today" in BDT, only slots >= BDT now + 30 min are offered.
  const { slots, bdtMidnightMs } = useMemo(() => {
    const dayKey = dhakaTodayKey(date ?? new Date());
    const boundaries = bdtDayBoundariesUtc(dayKey);
    if (!boundaries) return { slots: [], bdtMidnightMs: 0 };
    const dayStart = boundaries.start.getTime(); // UTC ms of BDT midnight
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    // Is this the current BDT day?
    const now = Date.now();
    const todayKey = dhakaTodayKey();
    const isToday = dayKey === todayKey;

    // First slot: on today, advance to BDT now + 30 min, rounded up to the next 30-min boundary
    let firstSlotMs = dayStart;
    if (isToday) {
      firstSlotMs = Math.ceil((now + MIN_LEAD_MS) / SLOT_MS) * SLOT_MS;
      // Clamp to this day's range
      if (firstSlotMs < dayStart) firstSlotMs = dayStart;
    }

    const out: Date[] = [];
    for (let t = firstSlotMs; t < dayEnd; t += SLOT_MS) {
      out.push(new Date(t));
    }
    return { slots: out, bdtMidnightMs: dayStart };
  }, [date]);

  // selectedTime is a Date that was passed via onSelectTime — it's one of
  // our slot Dates, so we compare by BDT minutes since midnight.
  const selectedMins = selectedTime && bdtMidnightMs > 0
    ? bdtMinutes(selectedTime.getTime(), bdtMidnightMs)
    : -1;

  if (slots.length === 0) {
    return (
      <View style={{ paddingVertical: spacing.xs }}>
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontSize: 13,
            color: textSecondary,
          }}
        >
          No available times left today — pick another day.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {slots.map((slot) => {
        const mins = bdtMinutes(slot.getTime(), bdtMidnightMs);
        const isSelected = mins === selectedMins;
        const label = bdtTimeLabel(mins);
        return (
          <TouchableOpacity
            key={slot.toISOString()}
            onPress={() => onSelectTime(slot)}
            accessibilityRole="button"
            accessibilityLabel={`Select ${label}`}
            style={{
              minWidth: 76,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.sm,
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: isSelected ? colors.primary : borderColor,
              backgroundColor: isSelected ? colors.primary : surfaceBg,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-SemiBold",
                fontSize: 13,
                color: isSelected ? colors.white : textPrimary,
              }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
