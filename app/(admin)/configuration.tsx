import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

interface ConfigItem {
  key: string;
  value: string;
  updated_at: string;
}

const KEY_LABELS: Record<string, string> = {
  driver_min_ratio: 'Driver Min Ratio',
  driver_max_ratio: 'Driver Max Ratio',
  brta_max_base_bdt: 'BRTA Max Base (BDT)',
  brta_max_per_km_bdt: 'BRTA Max Per Km (BDT)',
  brta_max_wait_per_2min_bdt: 'BRTA Max Wait / 2min (BDT)',
};

const KEY_DESCRIPTIONS: Record<string, string> = {
  driver_min_ratio: 'Min ratio of system rate a driver can set (0.10 – 5.00)',
  driver_max_ratio: 'Max ratio of system rate a driver can set (0.10 – 5.00)',
  brta_max_base_bdt: 'BRTA ceiling for base fare in BDT paisa',
  brta_max_per_km_bdt: 'BRTA ceiling for per-km fare in BDT paisa',
  brta_max_wait_per_2min_bdt: 'BRTA ceiling for wait-time charge per 2 min in BDT paisa',
};

export default function ConfigurationScreen() {
  const [config, setConfig] = useState<ConfigItem[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/config');
      if (res.ok) {
        const data = await res.json();
        const items: ConfigItem[] = data.config ?? [];
        setConfig(items);
        // Seed the local edit buffer from server values
        const initial: Record<string, string> = {};
        for (const item of items) {
          initial[item.key] = item.value;
        }
        setEdits(initial);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const hasChanges = config.some(item => edits[item.key] !== item.value);

  const handleSave = async () => {
    const updates = config
      .filter(item => edits[item.key] !== item.value)
      .map(item => ({ key: item.key, value: edits[item.key] }));

    if (updates.length === 0) {
      Alert.alert('No changes', 'No values have been modified.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (res.ok) {
        const data = await res.json();
        const items: ConfigItem[] = data.config ?? [];
        setConfig(items);
        const refreshed: Record<string, string> = {};
        for (const item of items) {
          refreshed[item.key] = item.value;
        }
        setEdits(refreshed);
        Alert.alert('Saved', 'Configuration updated successfully.');
      } else {
        const err = await res.json().catch(() => ({ errors: ['Save failed'] }));
        const message = Array.isArray(err.errors) ? err.errors.join('\n') : (err.message ?? 'Save failed');
        Alert.alert('Error', message);
      }
    } catch {
      Alert.alert('Error', 'Could not save configuration');
    } finally {
      setSaving(false);
    }
  };

  const renderConfigItem = ({ item }: { item: ConfigItem }) => (
    <View className="bg-cardBgColor rounded-2xl p-5 mb-3">
      <Text className="text-primaryTextColor font-semibold text-base mb-1">
        {KEY_LABELS[item.key] ?? item.key}
      </Text>
      <Text className="text-secondaryTextColor text-xs mb-3">
        {KEY_DESCRIPTIONS[item.key] ?? item.key}
      </Text>
      <TextInput
        className="bg-hoverBgColor text-primaryTextColor rounded-xl px-4 py-3"
        value={edits[item.key] ?? item.value}
        onChangeText={v => setEdits(prev => ({ ...prev, [item.key]: v }))}
        keyboardType="decimal-pad"
        placeholderTextColor="#555555"
      />
      {edits[item.key] !== item.value && (
        <Text className="text-general-400 text-xs mt-1">Modified</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-bgColor">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()}>
            <AntDesign name="arrowleft" size={24} color="#E0E0E0" />
          </TouchableOpacity>
          <Text className="text-primaryTextColor text-lg font-bold ml-4">Configuration</Text>
        </View>
        {hasChanges && (
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            className="bg-general-400 rounded-full px-4 py-2"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text className="text-white font-semibold text-sm">Save</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#64B5F6" />
        </View>
      ) : config.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <AntDesign name="setting" size={64} color="#3A3A3A" />
          <Text className="text-secondaryTextColor text-base mt-4 text-center">
            No configuration values found.
          </Text>
        </View>
      ) : (
        <FlatList
          data={config}
          keyExtractor={item => item.key}
          renderItem={renderConfigItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchConfig(); }}
              tintColor="#64B5F6"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
