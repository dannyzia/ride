import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  StatusBar,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

const DAYS = [
  { key: 1, label: "Monday", short: "Mon" },
  { key: 2, label: "Tuesday", short: "Tue" },
  { key: 3, label: "Wednesday", short: "Wed" },
  { key: 4, label: "Thursday", short: "Thu" },
  { key: 5, label: "Friday", short: "Fri" },
  { key: 6, label: "Saturday", short: "Sat" },
  { key: 0, label: "Sunday", short: "Sun" },
];

/** Generate time options in 30-minute increments */
function generateTimeOptions(): string[] {
  const options: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      options.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

interface DaySchedule {
  is_active: boolean;
  start_time: string;
  end_time: string;
}

export default function Schedule() {
  const { t } = useTranslation();  const [schedule, setSchedule] = useState<Record<number, DaySchedule>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Time picker modal state
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [timePickerDay, setTimePickerDay] = useState<number | null>(null);
  const [timePickerField, setTimePickerField] = useState<"start" | "end">(
    "start",
  );

  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/driver/schedule`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const map: Record<number, DaySchedule> = {};
        for (const slot of data.schedule ?? []) {
          map[slot.day_of_week] = {
            is_active: slot.is_active,
            start_time: slot.start_time ?? "09:00",
            end_time: slot.end_time ?? "21:00",
          };
        }
        setSchedule(map);
      }
    } catch (err) {
      logger.error("Schedule fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const toggleDay = (key: number) => {
    setSchedule((prev) => ({
      ...prev,
      [key]: {
        is_active: !(prev[key]?.is_active ?? false),
        start_time: prev[key]?.start_time ?? "09:00",
        end_time: prev[key]?.end_time ?? "21:00",
      },
    }));
  };

  const openTimePicker = (dayKey: number, field: "start" | "end") => {
    setTimePickerDay(dayKey);
    setTimePickerField(field);
    setTimePickerVisible(true);
  };

  const selectTime = (time: string) => {
    if (timePickerDay === null) return;
    setSchedule((prev) => ({
      ...prev,
      [timePickerDay]: {
        ...prev[timePickerDay],
        is_active: prev[timePickerDay]?.is_active ?? false,
        [timePickerField === "start" ? "start_time" : "end_time"]: time,
      },
    }));
    setTimePickerVisible(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not authenticated");
        return;
      }

      // Validate: start must be before end for active days
      for (const d of DAYS) {
        const s = schedule[d.key];
        if (s?.is_active && s.start_time >= s.end_time) {
          setError(
            `${d.label}: start time must be before end time`,
          );
          setSaving(false);
          return;
        }
      }

      // Client-side overlap check: within each day, verify the time range
      // doesn't conflict with itself (safety net for edge cases).
      // The server also validates this and returns 422 schedule_overlap.
      const activeByDay = new Map<number, { start: string; end: string; label: string }>();
      for (const d of DAYS) {
        const s = schedule[d.key];
        if (!s?.is_active) continue;
        const existing = activeByDay.get(d.key);
        if (existing && existing.start < s.end_time && existing.end > s.start_time) {
          setError(`${d.label}: overlapping time ranges (${existing.start}-${existing.end} and ${s.start_time}-${s.end_time})`);
          setSaving(false);
          return;
        }
        activeByDay.set(d.key, { start: s.start_time, end: s.end_time, label: d.label });
      }

      const payload = DAYS.map((d) => ({
        day_of_week: d.key,
        start_time: schedule[d.key]?.start_time ?? "09:00",
        end_time: schedule[d.key]?.end_time ?? "21:00",
        is_active: schedule[d.key]?.is_active ?? false,
      }));

      const res = await fetch(`${API_URL}/api/driver/schedule`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ schedule: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Server-side overlap validation returns a descriptive message
        if (data.error === 'schedule_overlap' && data.message) {
          setError(data.message);
        } else {
          setError(data.message || data.error || 'Failed to save');
        }
        return;
      }
      Alert.alert("Saved", "Your availability has been updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("Schedule save failed", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: bg }}
      >
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={bg}
        />
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      {/* Header */}
      <View
        className="flex-row items-center px-[24px] py-[16px] border-b"
        style={{ borderBottomColor: borderColor }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-[12px] p-[4px]"
        >
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          className="flex-1 text-center text-[18px] font-JakartaBold"
          style={{ color: textPrimary }}
        >
          Set Availability
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        className="flex-1 px-[24px]"
        contentContainerStyle={{ paddingVertical: 16 }}
      >
        <Text
          className="text-[13px] font-Jakarta mb-4"
          style={{ color: textSecondary }}
        >
          Toggle days and set your available hours
        </Text>

        {DAYS.map((d) => {
          const s = schedule[d.key];
          const isActive = s?.is_active ?? false;
          const startTime = s?.start_time ?? "09:00";
          const endTime = s?.end_time ?? "21:00";

          return (
            <View
              key={d.key}
              className="rounded-[12px] p-[14px] mb-3"
              style={{
                backgroundColor: isActive ? surfaceBg : bg,
                borderWidth: 1,
                borderColor: isActive ? colors.primary : borderColor,
              }}
            >
              <View className="flex-row justify-between items-center mb-1">
                <Text
                  className="text-[15px] font-JakartaBold"
                  style={{ color: textPrimary }}
                >
                  {d.label}
                </Text>
                <Switch
                  value={isActive}
                  onValueChange={() => toggleDay(d.key)}
                  trackColor={{ false: "#D1D5DB", true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
              {isActive && (
                <View className="flex-row items-center gap-2 mt-2">
                  <TouchableOpacity
                    className="flex-1 rounded-[8px] px-[10px] py-[8px] items-center"
                    style={{
                      backgroundColor: isDark
                        ? colors.darkSecondary
                        : colors.gray100,
                      borderWidth: 1,
                      borderColor,
                    }}
                    onPress={() => openTimePicker(d.key, "start")}
                  >
                    <Text
                      className="text-[11px] font-Jakarta"
                      style={{ color: textSecondary }}
                    >
                      FROM
                    </Text>
                    <Text
                      className="text-[15px] font-JakartaBold"
                      style={{ color: textPrimary }}
                    >
                      {startTime}
                    </Text>
                  </TouchableOpacity>
                  <Ionicons
                    name="arrow-forward"
                    size={16}
                    color={textSecondary}
                  />
                  <TouchableOpacity
                    className="flex-1 rounded-[8px] px-[10px] py-[8px] items-center"
                    style={{
                      backgroundColor: isDark
                        ? colors.darkSecondary
                        : colors.gray100,
                      borderWidth: 1,
                      borderColor,
                    }}
                    onPress={() => openTimePicker(d.key, "end")}
                  >
                    <Text
                      className="text-[11px] font-Jakarta"
                      style={{ color: textSecondary }}
                    >
                      UNTIL
                    </Text>
                    <Text
                      className="text-[15px] font-JakartaBold"
                      style={{ color: textPrimary }}
                    >
                      {endTime}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {error ? (
          <Text
            className="text-[13px] font-Jakarta mb-3 text-center"
            style={{ color: colors.danger }}
          >
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center mt-2"
          style={{
            backgroundColor: saving ? colors.borderDark : colors.primary,
          }}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text className="text-[16px] font-JakartaBold text-white">
              Save Schedule
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Time Picker Modal */}
      <Modal
        visible={timePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTimePickerVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => setTimePickerVisible(false)}
          />
          <View
            style={{
              maxHeight: "50%",
              backgroundColor: surfaceBg,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              padding: spacing.lg,
              paddingBottom: spacing["3xl"],
            }}
          >
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: borderColor,
                alignSelf: "center",
                marginBottom: spacing.lg,
              }}
            />
            <Text
              className="text-[16px] font-JakartaBold mb-3"
              style={{ color: textPrimary }}
            >
              Select {timePickerField === "start" ? "Start" : "End"} Time
            </Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {TIME_OPTIONS.map((time) => (
                <TouchableOpacity
                  key={time}
                  className="py-[12px] px-[16px] rounded-[8px] mb-1"
                  style={{
                    backgroundColor:
                      time ===
                      (timePickerField === "start"
                        ? schedule[timePickerDay ?? 0]?.start_time
                        : schedule[timePickerDay ?? 0]?.end_time)
                        ? `${colors.primary}20`
                        : "transparent",
                  }}
                  onPress={() => selectTime(time)}
                >
                  <Text
                    className="text-[15px] font-Jakarta"
                    style={{
                      color:
                        time ===
                        (timePickerField === "start"
                          ? schedule[timePickerDay ?? 0]?.start_time
                          : schedule[timePickerDay ?? 0]?.end_time)
                          ? colors.primary
                          : textPrimary,
                    }}
                  >
                    {time}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
