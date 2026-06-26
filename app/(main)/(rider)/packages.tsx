import { colors } from "@/theme/goRide";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { AntDesign } from "@expo/vector-icons";
import PaymentWebView from "@/components/PaymentWebView";

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

  // Payment confirmation state
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [confirmingElapsed, setConfirmingElapsed] = useState(0);
  const confirmingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // Payment flow state
  const [paymentURL, setPaymentURL] = useState<string | null>(null);
  const [paymentID, setPaymentID] = useState<string | null>(null);

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SERVER_URL}/api/package/list`,
      );
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

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  /** Initiate a purchase via PortPos (supports bKash, Nagad, Rocket, cards) */
  const handleBuy = async (pkg: CallPackage) => {
    setPurchasing(true);
    setPendingPkgId(pkg.id);
    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SERVER_URL}/api/package/purchase`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({ package_id: pkg.id, provider: "portpos" }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setPaymentURL(data.payment_url);
        setPaymentID(data.payment_event_id);
      } else {
        const err = await res
          .json()
          .catch(() => ({ message: "Purchase failed" }));
        Alert.alert("Error", err.message || "Could not initiate purchase");
        setPurchasing(false);
        setPendingPkgId(null);
      }
    } catch {
      Alert.alert("Error", "Network error — could not initiate purchase");
      setPurchasing(false);
      setPendingPkgId(null);
    }
  };

  /** Poll /api/package/active after payment to confirm subscription activation */
  const startPollingActiveSubscription = useCallback(() => {
    const POLL_INTERVAL_MS = 3000;
    const MAX_DURATION_MS = 120000;
    let elapsed = 0;

    setConfirmingPayment(true);
    setConfirmingElapsed(0);

    confirmingIntervalRef.current = setInterval(() => {
      elapsed += POLL_INTERVAL_MS;
      setConfirmingElapsed(Math.floor(elapsed / 1000));

      if (elapsed >= MAX_DURATION_MS) {
        stopPolling();
        Alert.alert(
          "Payment Not Confirmed",
          "If you were charged, please contact support with your package details.",
          [{ text: "OK", onPress: () => {} }],
        );
        return;
      }

      fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/package/active`)
        .then((res) => res.json())
        .then((data) => {
          if (data.subscription && data.subscription.id) {
            stopPolling();
            Alert.alert("Success", "Package purchased successfully!", [
              {
                text: "OK",
                onPress: () => {
                  router.replace("/(main)/(rider)");
                },
              },
            ]);
          }
        })
        .catch(() => {
          // Silently retry on next interval
        });
    }, POLL_INTERVAL_MS);

    const stopPolling = () => {
      if (confirmingIntervalRef.current) {
        clearInterval(confirmingIntervalRef.current);
        confirmingIntervalRef.current = null;
      }
      setConfirmingPayment(false);
      setConfirmingElapsed(0);
    };
  }, [router]);

  const handlePaymentSuccess = () => {
    setPaymentURL(null);
    setPaymentID(null);
    startPollingActiveSubscription();
  };

  const handlePaymentError = (error: string) => {
    setPaymentURL(null);
    setPaymentID(null);
    Alert.alert("Payment Failed", error);
    setPurchasing(false);
    setPendingPkgId(null);
  };

  /** Cleanup intervals on unmount */
  useEffect(() => {
    return () => {
      if (confirmingIntervalRef.current) {
        clearInterval(confirmingIntervalRef.current);
      }
    };
  }, []);

  const renderPackage = ({ item }: { item: CallPackage }) => (
    <View className="bg-cardBgColor rounded-2xl p-5 mb-3">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-primaryTextColor font-semibold text-base">
          {item.name}
        </Text>
        {item.is_trial && (
          <View className="bg-accentColor/20 rounded-full px-2 py-0.5">
            <Text className="text-accentColor text-xs">Trial</Text>
          </View>
        )}
      </View>

      <View className="flex-row flex-wrap gap-2 mb-3">
        <View className="bg-hoverBgColor rounded-full px-3 py-1">
          <Text className="text-secondaryTextColor text-xs">
            {item.call_count} calls
          </Text>
        </View>
        <View className="bg-hoverBgColor rounded-full px-3 py-1">
          <Text className="text-secondaryTextColor text-xs">
            {item.duration_days} days
          </Text>
        </View>
        <View className="bg-hoverBgColor rounded-full px-3 py-1">
          <Text className="text-secondaryTextColor text-xs">
            Cap: {item.daily_cap}/day
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between mt-1">
        <Text className="text-primaryTextColor text-xl font-bold">
          ৳{(item.price_bdt / 100).toFixed(0)}
        </Text>
        <TouchableOpacity
          onPress={() => handleBuy(item)}
          disabled={purchasing && pendingPkgId === item.id}
          className="bg-general-400 rounded-full px-5 py-2"
        >
          {purchasing && pendingPkgId === item.id ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text className="text-white font-semibold text-sm">Buy Now</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-bgColor">
      <View className="flex-row items-center justify-between px-5 py-4">
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color={colors.adminSubtle} />
        </TouchableOpacity>
        <Text className="text-primaryTextColor text-lg font-bold">
          Call Packages
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.adminAccent} />
        </View>
      ) : packages.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <AntDesign name="database" size={64} color={colors.adminIconDark} />
          <Text className="text-secondaryTextColor text-base mt-4 text-center">
            No packages available. Check back later.
          </Text>
        </View>
      ) : (
        <FlatList
          data={packages}
          keyExtractor={(item) => item.id}
          renderItem={renderPackage}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchPackages();
              }}
              tintColor={colors.adminAccent}
            />
          }
        />
      )}

      {/* Payment WebView (PortPos hosted checkout — supports bKash/Nagad/Rocket/cards) */}
      {paymentURL && paymentID && (
        <PaymentWebView
          bkashURL={paymentURL}
          paymentID={paymentID}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
        />
      )}

      {/* Confirming Payment Overlay */}
      {confirmingPayment && (
        <Modal visible={confirmingPayment} transparent animationType="none">
          <View className="flex-1 bg-black/50 items-center justify-center">
            <View className="bg-cardBgColor rounded-2xl p-6 mx-8 items-center">
              <ActivityIndicator size="large" color={colors.adminAccent} />
              <Text className="text-primaryTextColor text-lg font-semibold mt-4">
                Confirming Payment...
              </Text>
              <Text className="text-secondaryTextColor text-sm mt-2">
                {confirmingElapsed}s / 120s
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (confirmingIntervalRef.current) {
                    clearInterval(confirmingIntervalRef.current);
                    confirmingIntervalRef.current = null;
                  }
                  setConfirmingPayment(false);
                }}
                className="mt-4 px-4 py-2 bg-hoverBgColor rounded-full"
              >
                <Text className="text-secondaryTextColor text-sm">Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}
