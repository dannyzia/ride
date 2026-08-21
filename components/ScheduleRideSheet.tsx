import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { toUtcIso, dhakaTodayKey } from "@/lib/time";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";

/**
 * §1.5 / S4 — ScheduleRideSheet replaces the legacy SchedulePicker with a
 * full Dhaka date+time selection sheet. Requirements met:
 *
 *  - **Dhaka date+time**: DatePicker/TimePicker already use Asia/Dhaka
 *    for slot generation. Display labels use `toLocaleString("en-GB",
 *    { timeZone: "Asia/Dhaka" })`.
 *  - **7-day lead**: DatePicker `dayCount` defaults to 7; server enforces
 *    `schedule_max_lead_days` from platform_config.
 *  - **+30-minute minimum**: TimePicker skips slots earlier than
 *    `now + 30 min` on the selected day.
 *  - **Overlap validation**: On selection, the component fetches
 *    `GET /api/ride/schedule/overlap?scheduled_at=...` (client-side check;
 *    server's advisory lock is the authoritative guard).
 *
 * Usage:
 *   <ScheduleRideSheet
 *     onConfirm={(iso) => setScheduledAt(iso)}
 *     onClose={() => setVisible(false)}
 *   />
 */
interface ScheduleRideSheetProps {
  /** Called with the selected ISO timestamp when the user confirms. */
  onConfirm: (scheduledAtIso: string) => void;
  /** Called when the user taps close/back. */
  onClose: () => void;
  /** Optional pre-selected date (e.g. from a previous selection). */
  initialDate?: Date | null;
}

/** Asia/Dhaka display helper — always Dhaka, never device tz. */
function formatDhaka(d: Date): string {
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDhakaDate(d: Date): string {
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function ScheduleRideSheet({
  onConfirm,
  onClose,
  initialDate = null,
}: ScheduleRideSheetProps) {
  const isDark = useIsDark();

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const [selectedDate, setSelectedDate] = useState<Date | null>(
    initialDate ?? null,
  );
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [overlapError, setOverlapError] = useState<string | null>(null);
  const [checkingOverlap, setCheckingOverlap] = useState(false);

  // Combined date+time
  const combined: Date | null = useMemo(() => {
    if (!selectedDate || !selectedTime) return null;
    const d = new Date(selectedDate);
    d.setHours(
      selectedTime.getHours(),
      selectedTime.getMinutes(),
      0,
      0,
    );
    return d;
  }, [selectedDate, selectedTime]);

  // Validation — mirrors the server's [min_lead, max_lead] window
  const MIN_LEAD_MS = 30 * 60 * 1000;
  const MAX_LEAD_MS = 7 * 24 * 60 * 60 * 1000;
  const isValid = useMemo(() => {
    if (!combined) return false;
    const diff = combined.getTime() - Date.now();
    return diff >= MIN_LEAD_MS && diff <= MAX_LEAD_MS;
  }, [combined]);

  const validationHint = useMemo(() => {
    if (!combined) return "Select a date and time";
    const diff = combined.getTime() - Date.now();
    if (diff < MIN_LEAD_MS)
      return "Must be at least 30 minutes from now";
    if (diff > MAX_LEAD_MS) return "Cannot schedule more than 7 days ahead";
    return null;
  }, [combined]);

  // Overlap check — lightweight client-side guard before the server's
  // advisory lock rejects the request with 409.
  const checkOverlap = useCallback(
    async (iso: string) => {
      setCheckingOverlap(true);
      setOverlapError(null);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return; // let server handle auth

        const res = await fetch(
          `${API_URL}/api/ride/schedule/overlap?scheduled_at=${encodeURIComponent(iso)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.conflict) {
            setOverlapError(
              data.message ?? "You already have a scheduled ride near this time",
            );
          }
        }
        // If endpoint doesn't exist yet (404), skip — server's 409 is
        // the authoritative guard.
      } catch {
        // Network error — skip; let server handle
      } finally {
        setCheckingOverlap(false);
      }
    },
    [],
  );

  // Re-check overlap whenever the combined time changes
  React.useEffect(() => {
    if (combined && isValid) {
      const debounce = setTimeout(() => {
        checkOverlap(toUtcIso(combined));
      }, 500);
      return () => clearTimeout(debounce);
    }
  }, [combined, isValid, checkOverlap]);

  const handleConfirm = () => {
    if (!combined || !isValid || overlapError) return;
    onConfirm(toUtcIso(combined));
  };

  const canConfirm = isValid && !overlapError && !checkingOverlap;

  return (
    <View style={[styles.container, { backgroundColor: surfaceBg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close schedule picker"
        >
          <Ionicons name="close" size={22} color={textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: textPrimary }]}>
          Schedule Ride
        </Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Dhaka timezone badge */}
      <View style={styles.tzBadge}>
        <Ionicons name="globe-outline" size={12} color={colors.primary} />
        <Text style={styles.tzText}>Asia/Dhaka (UTC+6)</Text>
      </View>

      {/* Date picker */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: textSecondary }]}>
          Date
        </Text>
        <DatePicker
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setOverlapError(null);
          }}
        />
      </View>

      {/* Time picker */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: textSecondary }]}>
          Time
        </Text>
        <TimePicker
          date={selectedDate}
          selectedTime={selectedTime}
          onSelectTime={(t) => {
            setSelectedTime(t);
            setOverlapError(null);
          }}
        />
      </View>

      {/* Preview */}
      {combined && isValid && (
        <View style={[styles.preview, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
          <Ionicons name="time-outline" size={16} color={colors.primary} />
          <Text style={[styles.previewText, { color: textPrimary }]}>
            Pickup at{" "}
            <Text style={{ fontFamily: "Jakarta-SemiBold" }}>
              {formatDhaka(combined)}
            </Text>
          </Text>
        </View>
      )}

      {/* Errors / hints */}
      {overlapError && (
        <View
          style={[styles.errorBox, { backgroundColor: `${colors.danger}14` }]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {overlapError}
          </Text>
        </View>
      )}

      {checkingOverlap && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size={12} color={colors.primary} />
          <Text style={[styles.loadingText, { color: textSecondary }]}>
            Checking availability…
          </Text>
        </View>
      )}

      {!combined && !overlapError && (
        <Text style={[styles.hint, { color: textSecondary }]}>
          Pick a date and time to schedule your ride
        </Text>
      )}

      {combined && !isValid && !overlapError && (
        <Text style={[styles.hint, { color: textSecondary }]}>
          {validationHint}
        </Text>
      )}

      {/* Confirm button */}
      <TouchableOpacity
        style={[
          styles.confirmBtn,
          {
            backgroundColor: canConfirm ? colors.primary : colors.gray200,
            opacity: canConfirm ? 1 : 0.6,
          },
        ]}
        onPress={handleConfirm}
        disabled={!canConfirm}
        accessibilityRole="button"
        accessibilityLabel="Confirm scheduled time"
      >
        <Text
          style={[
            styles.confirmText,
            { color: canConfirm ? colors.white : colors.gray },
          ]}
        >
          {checkingOverlap ? "Checking…" : "Confirm Time"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopLeftRadius: radii["2xl"],
    borderTopRightRadius: radii["2xl"],
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: "Jakarta-Bold",
    fontSize: 17,
  },
  tzBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginHorizontal: 20,
    marginTop: 12,
  },
  tzText: {
    fontFamily: "Jakarta-Medium",
    fontSize: 11,
    color: colors.primary,
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 20,
  },
  sectionLabel: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
    marginBottom: 8,
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  previewText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    flex: 1,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: {
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
    flex: 1,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 20,
    marginTop: 8,
  },
  loadingText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
  },
  hint: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginHorizontal: 20,
    marginTop: 12,
  },
  confirmBtn: {
    marginHorizontal: 20,
    marginTop: 20,
    height: 52,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
  },
});
