import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import PaymentWebView from '@/components/PaymentWebView';

interface CallPackage {
  id: string;
  name: string;
  call_count: number;
  duration_days: number;
  price_bdt: number;
  daily_cap: number;
  is_trial: boolean;
}

export default function PackagesScreen() {
  const [packages, setPackages] = useState<CallPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [pendingPkgId, setPendingPkgId] = useState<string | null>(null);

  // Payment flow state
  const [paymentURL, setPaymentURL] = useState<string | null>(null);
  const [paymentID, setPaymentID] = useState<string | null>(null);

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch('/api/package/list');
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

  /** Initiate a purchase for the selected package and open the bKash PaymentWebView. */
  const handleBuy = async (pkg: CallPackage) => {
    setPurchasing(true);
    setPendingPkgId(pkg.id);
    try {
      const res = await fetch('/api/package/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: pkg.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setPaymentURL(data.bkashURL);
        setPaymentID(data.paymentID);
      } else {
        const err = await res.json().catch(() => ({ message: 'Purchase failed' }));
        Alert.alert('Error', err.message || 'Could not initiate purchase');
      }
    } catch {
      Alert.alert('Error', 'Network error — could not initiate purchase');
    } finally {
      setPurchasing(false);
      setPendingPkgId(null);
    }
  };

  const handlePaymentSuccess = () => {
    setPaymentURL(null);
    setPaymentID(null);
    Alert.alert('Success', 'Package purchased successfully!');
    fetchPackages();
  };

  const handlePaymentError = (error: string) => {
    setPaymentURL(null);
    setPaymentID(null);
    Alert.alert('Payment Failed', error);
  };

  const renderPackage = ({ item }: { item: CallPackage }) => (
    <View className="bg-cardBgColor rounded-2xl p-5 mb-3">
      {/* Top row: name + trial badge */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-primaryTextColor font-semibold text-base">{item.name}</Text>
        {item.is_trial && (
          <View className="bg-accentColor/20 rounded-full px-2 py-0.5">
            <Text className="text-accentColor text-xs">Trial</Text>
          </View>
        )}
      </View>

      {/* Tags row */}
      <View className="flex-row flex-wrap gap-2 mb-3">
        <View className="bg-hoverBgColor rounded-full px-3 py-1">
          <Text className="text-secondaryTextColor text-xs">{item.call_count} calls</Text>
        </View>
        <View className="bg-hoverBgColor rounded-full px-3 py-1">
          <Text className="text-secondaryTextColor text-xs">{item.duration_days} days</Text>
        </View>
        <View className="bg-hoverBgColor rounded-full px-3 py-1">
          <Text className="text-secondaryTextColor text-xs">Cap: {item.daily_cap}/day</Text>
        </View>
      </View>

      {/* Price + Buy button */}
      <View className="flex-row items-center justify-between mt-1">
        <Text className="text-primaryTextColor text-xl font-bold">৳{(item.price_bdt / 100).toFixed(0)}</Text>
        <TouchableOpacity
          onPress={() => handleBuy(item)}
          disabled={purchasing && pendingPkgId === item.id}
          className="bg-general-400 rounded-full px-5 py-2"
        >
          {purchasing && pendingPkgId === item.id ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text className="text-white font-semibold text-sm">Buy Now</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-bgColor">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4">
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color="#E0E0E0" />
        </TouchableOpacity>
        <Text className="text-primaryTextColor text-lg font-bold">Call Packages</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#64B5F6" />
        </View>
      ) : packages.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <AntDesign name="database" size={64} color="#3A3A3A" />
          <Text className="text-secondaryTextColor text-base mt-4 text-center">
            No packages available. Check back later.
          </Text>
        </View>
      ) : (
        <FlatList
          data={packages}
          keyExtractor={item => item.id}
          renderItem={renderPackage}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchPackages(); }}
              tintColor="#64B5F6"
            />
          }
        />
      )}

      {/* Payment WebView (renders as a full-screen Modal) */}
      {paymentURL && paymentID && (
        <PaymentWebView
          bkashURL={paymentURL}
          paymentID={paymentID}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
        />
      )}
    </SafeAreaView>
  );
}
