import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert, RefreshControl, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

interface Package {
  id: string;
  name: string;
  call_count: number;
  duration_days: number;
  price_bdt: number;
  is_trial: boolean;
  is_active: boolean;
  daily_cap: number;
  created_at: string;
}

const defaultForm = { name: '', call_count: '', duration_days: '', price_bdt: '', daily_cap: '200', is_trial: false };

export default function PackagesScreen() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/packages');
      if (res.ok) {
        const data = await res.json();
        setPackages(data.packages ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  const handleSave = async () => {
    if (!form.name || !form.call_count || !form.duration_days || !form.price_bdt) {
      Alert.alert('Validation', 'Please fill all required fields');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          call_count: parseInt(form.call_count),
          duration_days: parseInt(form.duration_days),
          price_bdt: parseInt(form.price_bdt),
          daily_cap: parseInt(form.daily_cap),
          is_trial: form.is_trial,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm(defaultForm);
        fetchPackages();
      } else {
        const err = await res.json();
        Alert.alert('Error', err.message || 'Save failed');
      }
    } catch {
      Alert.alert('Error', 'Could not save package');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (pkg: Package) => {
    try {
      await fetch('/api/admin/packages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pkg.id, is_active: !pkg.is_active }),
      });
      fetchPackages();
    } catch {
      Alert.alert('Error', 'Could not update package');
    }
  };

  const renderPackage = ({ item }: { item: Package }) => (
    <View className="bg-cardBgColor rounded-2xl p-5 mb-3">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-primaryTextColor font-semibold text-base">{item.name}</Text>
        {item.is_trial && <View className="bg-accentColor/20 rounded-full px-2 py-0.5"><Text className="text-accentColor text-xs">Trial</Text></View>}
      </View>
      <View className="flex-row flex-wrap gap-2 mb-3">
        <View className="bg-hoverBgColor rounded-full px-3 py-1"><Text className="text-secondaryTextColor text-xs">{item.call_count} calls</Text></View>
        <View className="bg-hoverBgColor rounded-full px-3 py-1"><Text className="text-secondaryTextColor text-xs">{item.duration_days} days</Text></View>
        <View className="bg-hoverBgColor rounded-full px-3 py-1"><Text className="text-secondaryTextColor text-xs">৳{(item.price_bdt / 100).toFixed(0)}</Text></View>
        <View className="bg-hoverBgColor rounded-full px-3 py-1"><Text className="text-secondaryTextColor text-xs">Cap: {item.daily_cap}/day</Text></View>
      </View>
      <TouchableOpacity onPress={() => handleToggleActive(item)}>
        <Text className={`text-sm font-medium ${item.is_active ? 'text-success-500' : 'text-danger-500'}`}>
          {item.is_active ? 'Active' : 'Inactive'} — Tap to toggle
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-bgColor">
      <View className="flex-row items-center justify-between px-5 py-4">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()}>
            <AntDesign name="arrowleft" size={24} color="#E0E0E0" />
          </TouchableOpacity>
          <Text className="text-primaryTextColor text-lg font-bold ml-4">Call Packages</Text>
        </View>
        <TouchableOpacity onPress={() => setShowForm(true)} className="bg-general-400 rounded-full px-4 py-2">
          <Text className="text-white font-semibold text-sm">+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#64B5F6" /></View>
      ) : packages.length === 0 ? (
        <View className="flex-1 items-center justify-center"><Text className="text-secondaryTextColor">No packages defined.</Text></View>
      ) : (
        <FlatList
          data={packages}
          keyExtractor={item => item.id}
          renderItem={renderPackage}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPackages(); }} tintColor="#64B5F6" />}
        />
      )}

      <Modal visible={showForm} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-cardBgColor rounded-t-3xl p-6">
            <View className="flex-row justify-between items-center mb-5">
              <Text className="text-primaryTextColor text-lg font-bold">New Package</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}><AntDesign name="close" size={24} color="#E0E0E0" /></TouchableOpacity>
            </View>
            {(['name', 'call_count', 'duration_days', 'price_bdt', 'daily_cap'] as const).map(field => (
              <TextInput
                key={field}
                className="bg-hoverBgColor text-primaryTextColor rounded-xl px-4 py-3 mb-3"
                placeholder={field.replace(/_/g, ' ')}
                placeholderTextColor="#555555"
                value={form[field]}
                onChangeText={v => setForm(prev => ({ ...prev, [field]: v }))}
                keyboardType={field === 'name' ? 'default' : 'numeric'}
              />
            ))}
            <TouchableOpacity
              onPress={() => setForm(prev => ({ ...prev, is_trial: !prev.is_trial }))}
              className="flex-row items-center mb-5"
            >
              <View className={`w-5 h-5 rounded border-2 mr-3 items-center justify-center ${form.is_trial ? 'bg-accentColor border-accentColor' : 'border-borderColor'}`}>
                {form.is_trial && <AntDesign name="check" size={12} color="#121212" />}
              </View>
              <Text className="text-primaryTextColor">Trial package</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              className="bg-general-400 rounded-full py-4 items-center"
            >
              {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text className="text-white font-bold">Save Package</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
