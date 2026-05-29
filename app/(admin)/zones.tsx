import { colors } from '@/theme/goRide';
import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

interface PricingRow {
  id: string;
  vehicle_type: string;
  base_fare_bdt: number;
  per_km_bdt: number;
  total_bdt?: number;
  is_active: boolean;
}

interface Zone {
  id: string;
  name: string;
  polygon: { lat: number; lng: number }[];
  is_active: boolean;
  pricing: PricingRow[];
}

export default function ZonesScreen() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedZone, setExpandedZone] = useState<string | null>(null);

  const fetchZones = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/zones');
      if (res.ok) {
        const data = await res.json();
        setZones(data.zones ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  const renderPricing = (pricing: PricingRow[]) => (
    <View className="mt-3 pt-3 border-t border-borderColor">
      <Text className="text-secondaryTextColor text-xs font-semibold mb-2">Pricing</Text>
      {pricing.map(p => (
        <View key={p.id} className="flex-row items-center justify-between py-1">
          <Text className="text-primaryTextColor text-xs capitalize">{p.vehicle_type.replace(/_/g, ' ')}</Text>
          <Text className="text-primaryTextColor text-xs">Base ৳{(p.base_fare_bdt / 100).toFixed(0)} · Per km ৳{(p.per_km_bdt / 100).toFixed(0)}</Text>
        </View>
      ))}
    </View>
  );

  const renderZone = ({ item }: { item: Zone }) => {
    const isExpanded = expandedZone === item.id;
    return (
      <TouchableOpacity
        onPress={() => setExpandedZone(isExpanded ? null : item.id)}
        className="bg-cardBgColor rounded-2xl p-5 mb-3"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className={`w-3 h-3 rounded-full mr-3 ${item.is_active ? 'bg-general-400' : 'bg-borderColor'}`} />
            <View>
              <Text className="text-primaryTextColor font-semibold text-base">{item.name}</Text>
              <Text className="text-secondaryTextColor text-xs">{item.polygon.length} polygon points</Text>
            </View>
          </View>
          <AntDesign name={isExpanded ? 'up' : 'down'} size={16} color={colors.textDisabledDark} />
        </View>
        {isExpanded && renderPricing(item.pricing)}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-bgColor">
      <View className="flex-row items-center px-5 py-4">
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color={colors.adminSubtle} />
        </TouchableOpacity>
        <Text className="text-primaryTextColor text-lg font-bold ml-4">Zones & Pricing</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={colors.adminAccent} /></View>
      ) : zones.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <AntDesign name="enviromento" size={64} color={colors.adminIconDark} />
          <Text className="text-secondaryTextColor text-base mt-4 text-center">No zones configured yet.</Text>
        </View>
      ) : (
        <FlatList
          data={zones}
          keyExtractor={item => item.id}
          renderItem={renderZone}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchZones(); }} tintColor={colors.adminAccent} />}
        />
      )}
    </SafeAreaView>
  );
}
