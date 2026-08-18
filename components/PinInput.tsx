import { useRef } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { colors, radii } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { sanitizePin } from "@/lib/pin";

interface PinInputProps {
  /** Current PIN string (digits only, up to `length`). */
  value: string;
  onChange: (pin: string) => void;
  length?: number;
  /** Red border + error styling. */
  error?: boolean;
  /** Grab focus (and open the numeric keyboard) on mount. */
  autoFocus?: boolean;
  accessibilityLabel?: string;
}

/**
 * 4-digit PIN entry: one hidden, auto-focusable numeric TextInput stretched
 * invisibly over a row of rendered boxes (the plan's §6.5 "hidden
 * auto-focused TextInput driving four rendered boxes" pattern). All touches
 * land on the invisible input, so the OS keyboard opens and digits flow into
 * the boxes — no per-box inputs, no state spread.
 *
 * The caller controls the value: display-first callers (ride-tracking's PIN
 * reveal) pre-fill `value` and the boxes render the digits; entry-first
 * callers (driver PIN confirmation) start empty and fill as the rider/driver
 * types.
 */
export default function PinInput({
  value,
  onChange,
  length = 4,
  error = false,
  autoFocus = false,
  accessibilityLabel = "PIN entry",
}: PinInputProps) {
  const inputRef = useRef<TextInput>(null);
  const isDark = useIsDark();

  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {Array.from({ length }, (_, i) => {
          const digit = value[i] ?? "";
          const isNext = i === value.length;
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  backgroundColor: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
                  borderColor: error ? colors.danger : isNext ? colors.primary : borderColor,
                },
              ]}
            >
              {digit ? (
                <Text
                  style={[
                    styles.digit,
                    { color: textPrimary },
                  ]}
                >
                  {digit}
                </Text>
              ) : (
                <Text style={[styles.placeholder, { color: textSecondary }]}>•</Text>
              )}
            </View>
          );
        })}
      </View>
      {/* Hidden input: fills the whole row, invisible, catches all touches and
          the keyboard. Driving the boxes above. */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChange(sanitizePin(t, length))}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        autoComplete="off"
        autoCorrect={false}
        selectionColor="transparent"
        style={styles.hiddenInput}
        accessibilityLabel={`Hidden ${accessibilityLabel} input`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    width: "100%",
    maxWidth: 280,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  box: {
    width: 60,
    height: 60,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  digit: {
    fontFamily: "Jakarta-Bold",
    fontSize: 22,
    fontVariant: ["tabular-nums"],
  },
  placeholder: {
    fontSize: 22,
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
});
