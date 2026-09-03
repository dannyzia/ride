import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, StatusBar, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useRiderStore } from "@/store/useRiderStore";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useTranslation } from "react-i18next";

const TIP_OPTIONS = [20, 50, 100];

interface DriverInfo {
  full_name: string;
  vehicle_type: string;
  vehicle_plate: string;
  avatar_url?: string;
  id?: string;
}

export default function RateDriver() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const { rideId: rideIdParam } = useLocalSearchParams<{ rideId?: string }>();
  const { activeRide } = useRiderStore();
  const rideId = rideIdParam || activeRide?.id;

  const [rating, setRating] = useState(0);
  const [tip, setTip] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [driverLoading, setDriverLoading] = useState(!!rideId);
  const [driverError, setDriverError] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blocking, setBlocking] = useState(false);

  const fetchDriver = useCallback(async () => {
    if (!rideId) return;
    setDriverLoading(true);
    setDriverError(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/ride/${rideId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setDriver(data.driver ?? null);
    } catch (e) {
      setDriverError(true);
      logger.error("[rate-driver] fetch driver failed", e);
    } finally {
      setDriverLoading(false);
    }
  }, [rideId]);

  useEffect(() => {
    fetchDriver();
  }, [fetchDriver]);

  useEffect(() => {
    const driverId = driver?.id || activeRide?.driver_id;
    if (!driverId) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/rider/block`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const blocked = (data.blocked_drivers ?? []).some((b: { driver_id: string }) => b.driver_id === driverId);
          setIsBlocked(blocked);
        }
      } catch {
        // non-blocking
      }
    })();
  }, [driver?.id, activeRide?.driver_id]);

  const handleSubmit = async () => {
    if (rating === 0) {
      setError(t('rate_rider.please_select_rating'));
      return;
    }
    if (!rideId) {
      setError(t('rate_driver.missing_ride_id'));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(t('finish_ride.not_authenticated'));
        return;
      }

      const rateRes = await fetch(`${API_URL}/api/ride/${rideId}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rating,
          role: "rider",
        }),
      });
      const rateData = await rateRes.json();
      if (!rateRes.ok) {
        setError(rateData.error || t('rate_rider.failed_to_submit'));
        setLoading(false);
        return;
      }

      const tipBdtPaisa = tip === 0 && customTip ? parseInt(customTip, 10) * 100 : tip * 100;
      if (tipBdtPaisa > 0) {
        try {
          const tipRes = await fetch(`${API_URL}/api/ride/${rideId}/tip`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ amount_bdt: tipBdtPaisa }),
          });
          if (!tipRes.ok) {
            const tipData = await tipRes.json().catch(() => ({}));
            logger.warn("[rate-driver] tip failed", { error: tipData.error });
          }
        } catch {
          // tip is optional — never block rating on tip failure
        }
      }

      router.replace("/(main)/(customer)/services-hub");
    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)) || t('wallet.network_error'));
      logger.error("Rate driver failed", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleBlock = () => {
    const driverId = driver?.id || activeRide?.driver_id;
    if (!driverId) return;
    if (isBlocked) {
      Alert.alert(t('rate_driver.unblock_title'), t('rate_driver.unblock_message'), [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('rate_driver.unblock'),
          onPress: async () => {
            setBlocking(true);
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const token = session?.access_token;
              if (!token) return;
              await fetch(`${API_URL}/api/rider/block?driver_id=${driverId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              setIsBlocked(false);
            } catch {
              Alert.alert(t('common.error'), t('rate_driver.failed_to_unblock'));
            } finally {
              setBlocking(false);
            }
          },
        },
      ]);
    } else {
      Alert.alert(t('rate_driver.block_title'), t('rate_driver.block_message'), [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('rate_driver.block'),
          style: "destructive",
          onPress: async () => {
            setBlocking(true);
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const token = session?.access_token;
              if (!token) return;
              const res = await fetch(`${API_URL}/api/rider/block`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ driver_id: driverId, reason: "other" }),
              });
              if (res.ok) setIsBlocked(true);
              else {
                const d = await res.json();
                Alert.alert(t('common.error'), d.error ?? t('rate_driver.failed'));
              }
            } catch {
              Alert.alert(t('common.error'), t('wallet.network_error'));
            } finally {
              setBlocking(false);
            }
          },
        },
      ]);
    }
  };

  const ratingLabel = rating === 1 ? t('rate_driver.poor') : rating === 2 ? t('rate_driver.fair') : rating === 3 ? t('rate_driver.good') : rating === 4 ? t('rate_driver.very_good') : rating === 5 ? t('rate_driver.excellent') : t('rate_driver.tap_to_rate');

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      <View className="flex-1 px-6 pt-4">
        <View className="flex-row items-center justify-between mb-6">
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={textPrimary} />
          </TouchableOpacity>
          <Text className="text-[28px] font-JakartaBold text-center flex-1" style={{ color: textPrimary }}>
            {t('rate_driver.how_was_ride')}
          </Text>
          <TouchableOpacity
            onPress={() => setTheme(isDark ? "light" : "dark")}
            hitSlop={8}
            className="ml-4"
          >
            <Ionicons
              name={isDark ? "sunny-outline" : "moon-outline"}
              size={24}
              color={textPrimary}
            />
          </TouchableOpacity>
        </View>

        {/* Driver info */}
        <View className="items-center mb-8">
          {driverLoading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : driverError ? (
            <View className="items-center gap-3">
              <Text style={{ color: colors.danger }}>{t('rate_driver.could_not_load_driver')}</Text>
              <TouchableOpacity onPress={fetchDriver} className="px-4 py-2 rounded-full border" style={{ borderColor: colors.primary }}>
                <Text style={{ color: colors.primary, fontFamily: "Jakarta-SemiBold" }}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : !driver ? (
            <Text style={{ color: textSecondary }}>{t('rate_driver.no_driver_info')}</Text>
          ) : (
            <>
              <View
                className="w-16 h-16 rounded-full items-center justify-center mb-3 overflow-hidden"
                style={{ backgroundColor: colors.primaryLight }}
              >
                {driver.avatar_url ? (
                  <Image source={{ uri: driver.avatar_url }} style={{ width: 64, height: 64 }} />
                ) : (
                  <Text className="text-[28px] font-JakartaBold" style={{ color: colors.primary }}>
                    {(driver.full_name || "D").charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <Text className="text-xl font-JakartaBold" style={{ color: textPrimary }}>
                {driver.full_name ?? t('rate_driver.driver')}
              </Text>
              <Text className="text-sm font-Jakarta" style={{ color: textSecondary }}>
                {driver.vehicle_type?.toUpperCase?.() ?? ""} {driver.vehicle_plate ?? ""}
              </Text>
            </>
          )}
        </View>

        {/* Star rating */}
        <View className="flex-row justify-center gap-3 mb-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity
              key={star}
              onPress={() => setRating(star)}
              style={{ padding: 4 }}
            >
              <Ionicons
                name={star <= rating ? "star" : "star-outline"}
                size={40}
                color={star <= rating ? colors.amber : textDisabled}
              />
            </TouchableOpacity>
          ))}
        </View>
        <Text className="text-sm font-Jakarta text-center mb-6" style={{ color: textSecondary }}>
          {ratingLabel}
        </Text>

        {/* Tip selector */}
        <Text className="text-base font-JakartaSemiBold mb-3" style={{ color: textPrimary }}>
          {t('rate_driver.add_tip_optional')}
        </Text>
        <View className="flex-row gap-2 mb-2">
          {TIP_OPTIONS.map((t) => (
            <TouchableOpacity
              key={t}
              className="flex-1 py-3 rounded-xl items-center border"
              style={[
                { borderColor: tip === t ? colors.primary : borderColor },
                { backgroundColor: tip === t ? colors.primary : surfaceBg },
              ]}
              onPress={() => { setTip(t); setCustomTip(""); }}
            >
              <Text style={{ color: tip === t ? colors.white : textPrimary, fontFamily: "Jakarta-SemiBold" }}>
                ৳{t}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            className="flex-1 py-3 rounded-xl items-center border"
            style={[
              { borderColor: customTip ? colors.primary : borderColor },
              { backgroundColor: customTip ? colors.primary : surfaceBg },
            ]}
            onPress={() => { setTip(0); }}
          >
            <Text style={{ color: customTip ? colors.white : textPrimary, fontFamily: "Jakarta-SemiBold" }}>
              {t('rate_driver.custom')}
            </Text>
          </TouchableOpacity>
        </View>
        {tip === 0 && customTip === "" && (
          <TextInput
            className="rounded-xl border px-4 py-3 text-sm font-Jakarta mb-4"
            style={{ borderColor, backgroundColor: surfaceBg, color: textPrimary }}
            placeholder={t('rate_driver.custom_tip_placeholder')}
            placeholderTextColor={textDisabled}
            keyboardType="number-pad"
            value={customTip}
            onChangeText={(text) => {
              const num = parseInt(text, 10);
              if (text === "" || (Number.isFinite(num) && num >= 0 && num <= 2000)) {
                setCustomTip(text);
              }
            }}
          />
        )}

        {/* Block driver */}
        <TouchableOpacity
          className="flex-row items-center mb-6"
          onPress={toggleBlock}
          disabled={blocking || !(driver?.id || activeRide?.driver_id)}
        >
          <View
            className="w-5 h-5 rounded border items-center justify-center mr-3"
            style={{ borderColor: isBlocked ? colors.primary : borderColor, backgroundColor: isBlocked ? colors.primary : "transparent" }}
          >
            {isBlocked && <Ionicons name="checkmark" size={14} color={colors.white} />}
          </View>
          <Text className="text-sm font-Jakarta" style={{ color: textPrimary }}>
            {t('rate_driver.block_this_driver')}
          </Text>
          <Text className="text-xs font-Jakarta ml-2" style={{ color: textSecondary }}>
            {t('rate_driver.wont_be_matched_again')}
          </Text>
        </TouchableOpacity>

        {error ? <Text className="text-sm font-Jakarta text-center mb-3" style={{ color: colors.danger }}>{error}</Text> : null}

        <TouchableOpacity
          className="rounded-full py-4 items-center"
          style={{ backgroundColor: rating > 0 ? colors.primary : textDisabled }}
          onPress={handleSubmit}
          disabled={loading || rating === 0}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text className="text-lg font-JakartaBold" style={{ color: colors.white }}>
              {t('rate_driver.submit_rating')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
