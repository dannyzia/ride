import { colors } from '@/theme/goRide';
import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

interface CityBoundary {
  id: string;
  name: string;
  polygon: { lat: number; lng: number }[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function CityBoundariesScreen() {
  const [cities, setCities] = useState<CityBoundary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [newCityPolygon, setNewCityPolygon] = useState(
    '[{"lat":23.8,"lng":90.4},{"lat":23.9,"lng":90.4},{"lat":23.9,"lng":90.5},{"lat":23.8,"lng":90.5}]',
  );
  const [editCityId, setEditCityId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPolygon, setEditPolygon] = useState('');

  const fetchCities = useCallback(async () => {
    try {
      const token = (await import('@/lib/supabase')).supabase.auth.getSession();
      const session = await token;
      const accessToken = session.data.session?.access_token ?? '';
      const res = await fetch('/api/admin/city-boundaries?include_inactive=true', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCities(data.cities ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchCities(); }, [fetchCities]);

  const handleAddCity = async () => {
    if (!newCityName.trim()) return;
    let polygon: { lat: number; lng: number }[];
    try {
      polygon = JSON.parse(newCityPolygon);
      if (!Array.isArray(polygon) || polygon.length < 3) {
        Alert.alert('Invalid Polygon', 'Provide at least 3 {lat, lng} points.');
        return;
      }
    } catch {
      Alert.alert('Invalid JSON', 'Polygon must be valid JSON, e.g. [{"lat":23.8,"lng":90.4},...]');
      return;
    }
    try {
      const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const res = await fetch('/api/admin/city-boundaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newCityName.trim(), polygon }),
      });
      if (res.ok) {
        setNewCityName('');
        setShowAddForm(false);
        fetchCities();
      } else {
        const err = await res.json();
        Alert.alert('Error', err.error ?? 'Failed to add city');
      }
    } catch {
      Alert.alert('Error', 'Failed to add city');
    }
  };

  const handleToggleActive = async (city: CityBoundary) => {
    if (city.is_active) {
      Alert.alert(
        'Deactivate City',
        `Deactivate ${city.name}? Existing rides will not be affected.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Deactivate',
            style: 'destructive',
            onPress: async () => {
              try {
                const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
                const token = session?.access_token ?? '';
                await fetch(`/api/admin/city-boundaries?id=${city.id}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${token}` },
                });
                fetchCities();
              } catch { /* silently fail */ }
            },
          },
        ],
      );
    } else {
      try {
        const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
        const token = session?.access_token ?? '';
        await fetch(`/api/admin/city-boundaries?id=${city.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ is_active: true }),
        });
        fetchCities();
      } catch { /* silently fail */ }
    }
  };

  const renderCity = ({ item }: { item: CityBoundary }) => (
    <View className="bg-cardBgColor rounded-2xl p-5 mb-3">
      {editCityId === item.id ? (
        <View>
          <TextInput
            value={editName}
            onChangeText={setEditName}
            className="bg-hoverBgColor rounded-lg px-3 py-2 text-primaryTextColor mb-2"
          />
          <TextInput
            value={editPolygon}
            onChangeText={setEditPolygon}
            multiline
            numberOfLines={4}
            className="bg-hoverBgColor rounded-lg px-3 py-2 text-primaryTextColor mb-2"
            style={{ fontFamily: 'monospace', minHeight: 60 }}
            textAlignVertical="top"
          />
          <View className="flex-row">
            <TouchableOpacity
              onPress={async () => {
                try {
                  const polygon = JSON.parse(editPolygon);
                  if (!Array.isArray(polygon) || polygon.length < 3) {
                    Alert.alert('Invalid', 'At least 3 points required');
                    return;
                  }
                  const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
                  const token = session?.access_token ?? '';
                  const res = await fetch(`/api/admin/city-boundaries?id=${item.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ name: editName.trim(), polygon }),
                  });
                  if (res.ok) {
                    setEditCityId(null);
                    fetchCities();
                  } else {
                    const err = await res.json();
                    Alert.alert('Error', err.error ?? 'Failed to update');
                  }
                } catch {
                  Alert.alert('Invalid JSON', 'Check polygon format');
                }
              }}
              className="bg-accentColor rounded-lg px-4 py-2 mr-2"
            >
              <Text className="text-white font-semibold">Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setEditCityId(null)}
              className="bg-hoverBgColor rounded-lg px-4 py-2"
            >
              <Text className="text-secondaryTextColor">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <View className={`w-3 h-3 rounded-full mr-3 ${item.is_active ? 'bg-general-400' : 'bg-borderColor'}`} />
            <View className="flex-1">
              <Text className="text-primaryTextColor font-semibold text-base">{item.name}</Text>
              <Text className="text-secondaryTextColor text-xs">
                {item.polygon.length} polygon points · {item.is_active ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => {
              setEditCityId(item.id);
              setEditName(item.name);
              setEditPolygon(JSON.stringify(item.polygon));
            }}
            className="bg-hoverBgColor rounded-full p-2 mr-2"
          >
            <AntDesign name="edit" size={16} color={colors.adminAccent} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleToggleActive(item)}
            className="px-3 py-1.5 rounded-lg ml-2"
            style={{ backgroundColor: item.is_active ? colors.danger + '20' : colors.adminAccent + '20' }}
          >
            <Text className="text-xs font-semibold" style={{ color: item.is_active ? colors.danger : colors.adminAccent }}>
              {item.is_active ? 'Deactivate' : 'Activate'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-bgColor">
      <View className="flex-row items-center px-5 py-4">
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color={colors.adminSubtle} />
        </TouchableOpacity>
        <Text className="text-primaryTextColor text-lg font-bold ml-4">City Boundaries</Text>
        <TouchableOpacity onPress={() => setShowAddForm(!showAddForm)} className="ml-auto">
          <AntDesign name="plus" size={22} color={colors.adminAccent} />
        </TouchableOpacity>
      </View>

      {showAddForm && (
        <View className="mx-5 mb-4 bg-cardBgColor rounded-2xl p-4">
          <Text className="text-primaryTextColor font-semibold mb-3">Add City Boundary</Text>
          <TextInput
            value={newCityName}
            onChangeText={setNewCityName}
            placeholder="City name"
            placeholderTextColor={colors.textDisabledDark}
            className="bg-hoverBgColor rounded-lg px-4 py-3 text-primaryTextColor mb-3"
          />
          <TextInput
            value={newCityPolygon}
            onChangeText={setNewCityPolygon}
            placeholder='[{"lat":23.8,"lng":90.4},...]'
            placeholderTextColor={colors.textDisabledDark}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            className="bg-hoverBgColor rounded-lg px-4 py-3 text-primaryTextColor mb-3"
            style={{ minHeight: 80, fontFamily: 'monospace' }}
          />
          <Text className="text-secondaryTextColor text-xs mb-3">
            Paste polygon as JSON array: {"{lat, lng}"}. At least 3 points required.
          </Text>
          <View className="flex-row">
            <TouchableOpacity onPress={() => { setShowAddForm(false); setNewCityName(''); }} className="flex-1 py-2 rounded-lg mr-2" style={{ backgroundColor: colors.borderDark + '40' }}>
              <Text className="text-secondaryTextColor text-center text-sm">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleAddCity} className="flex-1 py-2 rounded-lg" style={{ backgroundColor: colors.adminAccent }}>
              <Text className="text-white text-center text-sm font-semibold">Add City</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={colors.adminAccent} /></View>
      ) : cities.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <AntDesign name="enviromento" size={64} color={colors.adminIconDark} />
          <Text className="text-secondaryTextColor text-base mt-4 text-center">No city boundaries configured yet.</Text>
          <Text className="text-secondaryTextColor text-xs mt-2 text-center">Tap + to add a city boundary for intercity pricing.</Text>
        </View>
      ) : (
        <FlatList
          data={cities}
          keyExtractor={item => item.id}
          renderItem={renderCity}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchCities(); }} tintColor={colors.adminAccent} />}
        />
      )}
    </SafeAreaView>
  );
}
