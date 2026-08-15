import { View, Text, ActivityIndicator } from "react-native";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface LoadingRiderProps {
  message?: string;
}

export default function LoadingRider({ message }: LoadingRiderProps) {
  const isDark = useIsDark();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;

  return (
    <View
      className="flex-1 justify-center items-center px-6"
      style={{ backgroundColor: bg }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
      <Text
        className="mt-4 text-base font-JakartaSemiBold text-center"
        style={{ color: textPrimary }}
      >
        {message || "Looking for drivers..."}
      </Text>
    </View>
  );
}
