import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface UpfrontTipSliderProps {
  value: number;
  onChange: (val: number) => void;
}

export function UpfrontTipSlider({ value, onChange }: UpfrontTipSliderProps) {
  const isDark = useIsDark();
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  return (
    <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}>
      <View className="flex-row items-center gap-[6px] mb-1">
        <Ionicons name="cash" size={15} color={colors.primary} />
        <Text className="text-[15px] font-JakartaBold" style={{ color: colors.primary }}>
          Get a Driver Faster
        </Text>
      </View>
      <Text className="text-[13px] font-Jakarta mb-3" style={{ color: textSecondary }}>
        Add an upfront tip to attract drivers quickly.
      </Text>
      <View className="flex-row gap-2">
        {[0, 20, 50, 100].map((amount) => (
          <TouchableOpacity
            key={amount}
            onPress={() => onChange(amount)}
            className="flex-1 py-2.5 rounded-full items-center border"
            style={value === amount
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { backgroundColor: "transparent", borderColor: isDark ? colors.borderDark : colors.borderLight }}
          >
            <Text className="text-[14px] font-JakartaBold" style={{ color: value === amount ? colors.white : textPrimary }}>
              {amount === 0 ? "No tip" : `৳${amount}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
