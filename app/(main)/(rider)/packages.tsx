import { colors } from "@/theme/goRide";
import { API_URL } from "@/lib/config";
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
import { useIsDark } from "@/lib/useAppearance";
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

  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [confirmingElapsed, setConfirmingElapsed] = useState(0);
  const confirmingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [paymentURL, setPaymentURL] = useState<string | null>(null);
  const [paymentID, setPaymentID] = useState<string | null>(null);

  const isDark = useIsDark();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/package/list`);
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

  const handleBuy = async (pkg: CallPackage) => {
    setPurchasing(true);
    setPendingPkgId(pkg.id);
    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(`${API_URL}/api/package/purchase`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ package_id: pkg.id, provider: "portpos" }),
      });
      if (res.ok) {
        const data = await res.json();
        setPaymentURL(data.payment_url);
        setPaymentID(data.payment_event_id);
      } else {
        const err = await res.json().catch(() => ({ message: "Purchase failed" }));
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
          [{ text: "OK" }],
        );
        return;
      }

      fetch(`${API_URL}/api/package/active`)
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
          // Silently retry
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

  useEffect(() => {
    return () => {
      if (confirmingIntervalRef.current) {
        clearInterval(confirmingIntervalRef.current);
      }
    };
  }, []);

  const renderPackage = ({ item }: { item: CallPackage }) => (
    <View
      className="rounded-2xl p-5 mb-3"
      style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor: borderColor }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text
          className="font-JakartaSemiBold text-base"
          style={{ color: textPrimary }}
        >
          {item.name}
        </Text>
        {item.is_trial && (
          <View
            className="rounded-full px-2 py-0.5"
            style={{ backgroundColor: colors.primary + "20" }}
          >
            <Text
              className="text-xs font-JakartaSemiBold"
              style={{ color: colors.primary }}
            >
              Trial
            </Text>
          </View>
        )}
      </View>

      <View className="flex-row flex-wrap gap-2 mb-3">
        <View
          className="rounded-full px-3 py-1"
          style={{ backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }}
        >
          <Text className="text-xs font-Jakarta" style={{ color: textSecondary }}>
            {item.call_count} calls
          </Text>
        </View>
        <View
          className="rounded-full px-3 py-1"
          style={{ backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }}
        >
          <Text className="text-xs font-Jakarta" style={{ color: textSecondary }}>
            {item.duration_days} days
          </Text>
        </View>
        <View
          className="rounded-full px-3 py-1"
          style={{ backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }}
        >
          <Text className="text-xs font-Jakarta" style={{ color: textSecondary }}>
            Cap: {item.daily_cap}/day
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between mt-1">
        <Text
          className="text-xl font-JakartaBold"
          style={{ color: textPrimary }}
        >
          ৳{(item.price_bdt / 100).toFixed(0)}
        </Text>
        <TouchableOpacity
          onPress={() => handleBuy(item)}
          disabled={purchasing && pendingPkgId === item.id}
          className="rounded-full px-5 py-2"
          style={{ backgroundColor: colors.primary, opacity: purchasing && pendingPkgId === item.id ? 0.6 : 1 }}
        >
          {purchasing && pendingPkgId === item.id ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text className="text-white font-JakartaSemiBold text-sm">Buy Now</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <View className="flex-row items-center justify-between px-5 py-4">
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          className="text-lg font-JakartaBold"
          style={{ color: textPrimary }}
        >
          Call Packages
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : packages.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <AntDesign name="database" size={64} color={textDisabled} />
          <Text
            className="text-base mt-4 text-center font-Jakarta"
            style={{ color: textSecondary }}
          >
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
              tintColor={colors.primary}
            />
          }
        />
      )}

      {paymentURL && paymentID && (
        <PaymentWebView
          bkashURL={paymentURL}
          paymentID={paymentID}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
        />
      )}

      {confirmingPayment && (
        <Modal visible={confirmingPayment} transparent animationType="none">
          <View className="flex-1 items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <View
              className="rounded-2xl p-6 mx-8 items-center"
              style={{ backgroundColor: surfaceBg }}
            >
              <ActivityIndicator size="large" color={colors.primary} />
              <Text
                className="text-lg font-JakartaSemiBold mt-4"
                style={{ color: textPrimary }}
              >
                Confirming Payment...
              </Text>
              <Text
                className="text-sm mt-2 font-Jakarta"
                style={{ color: textSecondary }}
              >
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
                className="mt-4 px-4 py-2 rounded-full"
                style={{ backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }}
              >
                <Text className="text-sm font-JakartaSemiBold" style={{ color: textSecondary }}>
                  Dismiss
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}
