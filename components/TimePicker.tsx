import { useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface TimePickerProps {
  /** Selected date — slots are generated for this day (null = today). */
  date: Date | null;
  /** Currently selected time (only the time-of-day part is used). */
  selectedTime: Date | null;
  onSelectTime: (time: Date) => void;
}

const SLOT_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_LEAD_MS = 30 * 60 * 1000;

export default function TimePicker({ date, selectedTime, onSelectTime }: TimePickerProps) {
  const isDark = useIsDark();

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  // 30-minute slots from the day's start; on "today" only slots >= now + 30 min
  // (the server's minimum lead) are offered — a slot grid can't produce too_soon.
  const slots = useMemo(() => {
    const base = date ? new Date(date) : new Date();
    base.setHours(0, 0, 0, 0);
    const dayStart = base.getTime();
    const now = Date.now();
    const isToday = now >= dayStart && now < dayStart + DAY_MS;
    let firstSlot = dayStart;
    if (isToday) {
      firstSlot = Math.ceil((now + MIN_LEAD_MS) / SLOT_MS) * SLOT_MS;
    }
    const out: Date[] = [];
    for (let t = firstSlot; t < dayStart + DAY_MS; t += SLOT_MS) {
      out.push(new Date(t));
    }
    return out;
  }, [date]);

  const selectedMinutes = selectedTime
    ? selectedTime.getHours() * 60 + selectedTime.getMinutes()
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
        const minutes = slot.getHours() * 60 + slot.getMinutes();
        const isSelected = minutes === selectedMinutes;
        const label = slot.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        });
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
