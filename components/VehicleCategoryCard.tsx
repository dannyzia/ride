import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useAppearance } from "@/lib/useAppearance";

interface VehicleCategoryCardProps {
  icon: string;
  label: string;
  estimatedFare: number;
  eta: number;
  onPress: () => void;
}

export default function VehicleCategoryCard({ icon, label, estimatedFare, eta, onPress }: VehicleCategoryCardProps) {
  const { theme } = useAppearance();
  const isDark = theme === "dark" || theme === "system";

  const cardBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <TouchableOpacity
      className="flex-row items-center rounded-2xl p-4 mb-3"
      style={{
        backgroundColor: cardBg,
        borderWidth: 1,
        borderColor: borderColor,
        shadowColor: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.06)",
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        elevation: 3,
      }}
      onPress={onPress}
    >
      <Text className="text-[32px] mr-3">{icon}</Text>
      <View className="flex-1">
        <Text
          className="text-[16px] font-JakartaBold"
          style={{ color: textPrimary }}
        >
          {label}
        </Text>
        <Text
          className="text-[14px] font-Jakarta"
          style={{ color: textSecondary }}
        >
          ৳{(estimatedFare / 100).toFixed(0)} · {eta} min
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={textSecondary} />
    </TouchableOpacity>
  );
}
