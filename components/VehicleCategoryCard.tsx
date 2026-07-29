import { View, Text, TouchableOpacity } from "react-native";

interface VehicleCategoryCardProps {
  icon: string;
  label: string;
  estimatedFare: number; // integer paisa
  eta: number; // minutes
  onPress: () => void;
}

export default function VehicleCategoryCard({ icon, label, estimatedFare, eta, onPress }: VehicleCategoryCardProps) {
  return (
    <TouchableOpacity
      className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[16px] p-[16px] flex-row items-center"
      onPress={onPress}
    >
      <Text className="text-[32px] mr-[12px]">{icon}</Text>
      <View className="flex-1">
        <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{label}</Text>
        <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
          ৳{(estimatedFare / 100).toFixed(0)} · {eta} min
        </Text>
      </View>
      <Text className="text-[18px] text-goTextSecondaryLight dark:text-goTextSecondaryDark">›</Text>
    </TouchableOpacity>
  );
}
