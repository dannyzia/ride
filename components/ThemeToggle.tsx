import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useAppearance, useIsDark } from "@/lib/useAppearance";

export default function ThemeToggle() {
  const { theme, setTheme } = useAppearance();
  const isDark = useIsDark();

  const bg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const options: Array<{ key: typeof theme; label: string; icon: any }> = [
    { key: "light", label: "Light", icon: "sunny-outline" },
    { key: "dark", label: "Dark", icon: "moon-outline" },
    { key: "system", label: "System", icon: "phone-portrait-outline" },
  ];

  return (
    <View
      className="rounded-2xl p-4"
      style={{ backgroundColor: bg, borderWidth: 1, borderColor: borderColor }}
    >
      <Text
        className="text-base font-JakartaBold mb-3"
        style={{ color: textPrimary }}
      >
        Appearance
      </Text>
      <View className="flex-row gap-2">
        {options.map((opt) => {
          const isActive = theme === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              className="flex-1 flex-row items-center justify-center py-3 rounded-xl gap-2"
              style={{
                backgroundColor: isActive ? colors.primary + "20" : "transparent",
                borderWidth: 1.5,
                borderColor: isActive ? colors.primary : borderColor,
              }}
              onPress={() => setTheme(opt.key)}
            >
              <Ionicons
                name={opt.icon}
                size={18}
                color={isActive ? colors.primary : textSecondary}
              />
              <Text
                className="text-sm font-JakartaSemiBold"
                style={{ color: isActive ? colors.primary : textSecondary }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
