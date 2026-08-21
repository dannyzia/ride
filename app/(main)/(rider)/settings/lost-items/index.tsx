import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface LostItem {
  id: string;
  item_description: string;
  status: string;
  ride_id: string | null;
  created_at: string | null;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  reported: {
    label: "Reported",
    color: colors.amber,
    bg: `${colors.amber}20`,
  },
  driver_confirmed: {
    label: "Confirmed",
    color: colors.primary,
    bg: `${colors.primary}20`,
  },
  photo_provided: {
    label: "Photo Provided",
    color: colors.primary,
    bg: `${colors.primary}20`,
  },
  arranged_return: {
    label: "Return Arranged",
    color: colors.accent,
    bg: `${colors.accent}20`,
  },
  resolved: {
    label: "Resolved",
    color: colors.success,
    bg: `${colors.success}20`,
  },
  unresolved: {
    label: "Unresolved",
    color: colors.danger,
    bg: `${colors.danger}20`,
  },
};

export default function DriverLostItems() {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const [items, setItems] = useState<LostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setError("");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/driver/lost-items`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setItems((await res.json()).items ?? []);
      else setError("Failed to load. Pull down to refresh.");
    } catch (e) {
      setError("Failed to load. Pull down to refresh.");
      logger.error("Fetch driver lost items failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const respond = async (itemId: string, action: string) => {
    setSubmittingId(itemId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        Alert.alert("Error", "Not authenticated");
        return;
      }
      const body: { item_id: string; action: string; return_method?: string } = {
        item_id: itemId,
        action,
      };
      if (action === "return_arranged") body.return_method = "driver_returns";
      const res = await fetch(`${API_URL}/api/driver/lost-items`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        Alert.alert("Updated", "Response submitted.");
        fetchItems();
      } else {
        const d = await res.json();
        Alert.alert("Error", d.error ?? "Failed");
      }
    } catch {
      Alert.alert("Error", "Network error");
    } finally {
      setSubmittingId(null);
    }
  };

  const renderItem = ({ item }: { item: LostItem }) => {
    const statusConfig = STATUS_CONFIG[item.status] ?? {
      label: item.status.replace(/_/g, " "),
      color: textSecondary,
      bg: "transparent",
    };

    return (
      <View
        className="rounded-[12px] p-[14px] mb-3"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
      >
        {/* Status badge */}
        <View className="flex-row justify-between items-start mb-2">
          <Text
            className="text-[15px] font-JakartaBold flex-1"
            style={{ color: textPrimary }}
          >
            {item.item_description}
          </Text>
          <View
            className="rounded-full px-[8px] py-[2px] ml-2"
            style={{ backgroundColor: statusConfig.bg }}
          >
            <Text
              className="text-[11px] font-JakartaBold"
              style={{ color: statusConfig.color }}
            >
              {statusConfig.label}
            </Text>
          </View>
        </View>

        {/* Actions for 'reported' status */}
        {item.status === "reported" && (
          <View className="flex-row gap-3 mt-2">
            <TouchableOpacity
              onPress={() => respond(item.id, "confirm")}
              disabled={submittingId === item.id}
              className="flex-1 py-[10px] rounded-full items-center flex-row justify-center gap-1.5"
              style={{
                backgroundColor:
                  submittingId === item.id ? colors.borderDark : colors.primary,
              }}
            >
              {submittingId === item.id ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={colors.white}
                  />
                  <Text className="text-[13px] font-JakartaBold text-white">
                    I Have It
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => respond(item.id, "not_found")}
              disabled={submittingId === item.id}
              className="flex-1 py-[10px] rounded-full items-center flex-row justify-center gap-1.5"
              style={{
                borderWidth: 1.5,
                borderColor: colors.danger,
                opacity: submittingId === item.id ? 0.5 : 1,
              }}
            >
              <Ionicons name="close-circle" size={16} color={colors.danger} />
              <Text
                className="text-[13px] font-JakartaBold"
                style={{ color: colors.danger }}
              >
                Not Found
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Action for 'driver_confirmed' status */}
        {item.status === "driver_confirmed" && (
          <TouchableOpacity
            onPress={() => respond(item.id, "return_arranged")}
            disabled={submittingId === item.id}
            className="mt-2 py-[10px] rounded-full items-center"
            style={{
              backgroundColor:
                submittingId === item.id ? colors.borderDark : colors.primary,
            }}
          >
            {submittingId === item.id ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text className="text-[13px] font-JakartaBold text-white">
                Arrange Return
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      {/* Header */}
      <View
        className="flex-row items-center px-[24px] py-[16px] border-b"
        style={{ borderBottomColor: borderColor }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-[12px] p-[4px]"
        >
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          className="flex-1 text-center text-[18px] font-JakartaBold"
          style={{ color: textPrimary }}
        >
          Lost Item Reports
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ marginTop: 40 }}
        />
      ) : error && items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Ionicons
            name="alert-circle-outline"
            size={40}
            color={colors.danger}
          />
          <Text
            className="text-[14px] font-Jakarta mt-3 text-center"
            style={{ color: colors.danger }}
          >
            {error}
          </Text>
          <TouchableOpacity onPress={fetchItems} className="mt-3">
            <Text
              className="text-[14px] font-JakartaBold"
              style={{ color: colors.primary }}
            >
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          className="flex-1 px-[24px]"
          data={items}
          keyExtractor={(r: LostItem) => r.id}
          contentContainerStyle={{ paddingVertical: 16 }}
          ListEmptyComponent={
            <View className="items-center py-[40px]">
              <Ionicons
                name="search-outline"
                size={48}
                color={textSecondary}
              />
              <Text
                className="text-[15px] font-Jakarta mt-3 text-center"
                style={{ color: textSecondary }}
              >
                No lost item reports
              </Text>
              <Text
                className="text-[13px] font-Jakarta mt-1 text-center"
                style={{ color: textSecondary }}
              >
                If a rider reports a lost item, it will appear here.
              </Text>
            </View>
          }
          renderItem={renderItem}
        />
      )}
    </SafeAreaView>
  );
}
