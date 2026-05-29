import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { VEHICLE_TYPES } from '@/lib/vehicleTypes';

interface Alternative {
  vehicle_type: string;
  fare_breakdown: {
    total_bdt: number;
  };
  available_drivers: number;
}

interface AlternativesSheetProps {
  visible: boolean;
  alternatives: Alternative[];
  onSelect: (vehicleType: string) => void;
  onCancel: () => void;
}

export default function AlternativesSheet({ visible, alternatives, onSelect, onCancel }: AlternativesSheetProps) {
  if (!visible || alternatives.length === 0) return null;

  return (
    <View className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-6 shadow-xl z-50">
      <Text className="text-lg font-urbanist-bold text-goTextPrimaryLight text-center mb-2">
        No drivers available
      </Text>
      <Text className="text-sm font-inter text-gray-500 text-center mb-4">
        Try an alternative vehicle type
      </Text>

      <FlatList
        data={alternatives}
        keyExtractor={item => item.vehicle_type}
        renderItem={({ item }) => {
          const def = VEHICLE_TYPES.find(v => v.key === item.vehicle_type as any);
          return (
            <TouchableOpacity
              onPress={() => onSelect(item.vehicle_type)}
              className="flex-row items-center justify-between p-4 mb-2 bg-goBgLight rounded-2xl border border-goBorderLight"
            >
              <View className="flex-1">
                <Text className="text-base font-urbanist-bold text-goTextPrimaryLight">
                  {def?.display_en ?? item.vehicle_type}
                </Text>
                <Text className="text-sm font-inter text-gray-500">
                  {item.available_drivers} driver{item.available_drivers !== 1 ? 's' : ''} nearby
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-base font-urbanist-bold text-goAccent">
                  ৳{(item.fare_breakdown.total_bdt / 100).toFixed(0)}
                </Text>
                <Text className="text-xs font-inter text-general-400 font-semibold mt-1">
                  Select
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        onPress={onCancel}
        className="mt-2 py-4 items-center rounded-full border border-goDanger"
      >
        <Text className="text-sm font-inter text-goDanger font-semibold">Cancel Request</Text>
      </TouchableOpacity>
    </View>
  );
}
