import { colors } from '@/theme/goRide';
import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

interface LedgerEntry {
  id: string;
  event_type: 'deduction' | 'credit' | 'initial_load' | 'expiry_writeoff' | 'pro_rata_credit';
  delta: number;
  balance_after: number;
  description: string | null;
  ride_id: string | null;
  created_at: string;
}

interface GroupedEntries {
  date: string;
  entries: LedgerEntry[];
}

const EVENT_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  deduction: { label: 'Ride Deduction', icon: 'minuscircleo', color: colors.danger },
  credit: { label: 'Credit Added', icon: 'pluscircleo', color: colors.primary },
  initial_load: { label: 'Subscription Activated', icon: 'arrowdown', color: colors.primary },
  expiry_writeoff: { label: 'Expired Credits', icon: 'clockcircleo', color: colors.mediumGray },
  pro_rata_credit: { label: 'Pro-rata Compensation', icon: 'gift', color: colors.adminAccent },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const datePart = d.toLocaleDateString('en-BD', { day: 'numeric', month: 'long', year: 'numeric' });
  if (d.toDateString() === today.toDateString()) return `Today, ${datePart}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${datePart}`;
  return datePart;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function CallLedgerScreen() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [subscriptionName, setSubscriptionName] = useState<string | null>(null);

  const fetchLedger = useCallback(async () => {
    try {
      const res = await fetch('/api/driver/call-ledger');
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries ?? []);
        setBalance(data.current_balance ?? null);
        setSubscriptionName(data.subscription_name ?? null);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLedger();
  };

  const groupByDate = (entries: LedgerEntry[]): GroupedEntries[] => {
    const groups: Record<string, LedgerEntry[]> = {};
    for (const entry of entries) {
      const dk = new Date(entry.created_at).toDateString();
      if (!groups[dk]) groups[dk] = [];
      groups[dk].push(entry);
    }
    return Object.entries(groups)
      .sort(([_a], [_b]) => 0)
      .map(([_dk, entries]) => ({
        date: formatDate(entries[0].created_at),
        entries: entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      }));
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-bgColor items-center justify-center">
        <ActivityIndicator size="large" color={colors.adminAccent} />
      </SafeAreaView>
    );
  }

  const grouped = groupByDate(entries);

  return (
    <SafeAreaView className="flex-1 bg-bgColor">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4">
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color={colors.adminSubtle} />
        </TouchableOpacity>
        <Text className="text-primaryTextColor text-lg font-bold">Call Ledger</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Balance Card */}
      <View className="mx-5 mb-4 bg-cardBgColor rounded-2xl p-5">
        <Text className="text-secondaryTextColor text-sm mb-1">Available Balance</Text>
        <Text className="text-primaryTextColor text-3xl font-bold">{balance ?? 0} calls</Text>
        {subscriptionName && (
          <Text className="text-secondaryTextColor text-xs mt-1">{subscriptionName}</Text>
        )}
      </View>

      {entries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <AntDesign name="clockcircleo" size={64} color={colors.adminIconDark} />
          <Text className="text-secondaryTextColor text-base mt-4 text-center">
            No call history yet. Your call usage will appear here once you start accepting rides.
          </Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={item => item.date}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.adminAccent} />
          }
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          renderItem={({ item: group }) => (
            <View className="mb-5">
              <Text className="text-secondaryTextColor text-sm font-semibold mb-2">{group.date}</Text>
              {group.entries.map(entry => {
                const config = EVENT_CONFIG[entry.event_type] ?? { label: entry.event_type, icon: 'infocirlceo', color: colors.mediumGray };
                return (
                  <View key={entry.id} className="bg-cardBgColor rounded-xl p-4 mb-2 flex-row items-center">
                    <View className="w-9 h-9 rounded-full bg-hoverBgColor items-center justify-center mr-3">
                      <AntDesign name={config.icon as any} size={18} color={config.color} />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-primaryTextColor font-medium text-sm">{config.label}</Text>
                        <Text className={`text-sm font-bold ${entry.delta > 0 ? 'text-success-500' : 'text-danger-500'}`}>
                          {entry.delta > 0 ? '+' : ''}{entry.delta}
                        </Text>
                      </View>
                      {entry.description && (
                        <Text className="text-secondaryTextColor text-xs mt-0.5">{entry.description}</Text>
                      )}
                      <Text className="text-secondaryTextColor text-xs mt-0.5">
                        {formatTime(entry.created_at)} · Balance: {entry.balance_after}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
