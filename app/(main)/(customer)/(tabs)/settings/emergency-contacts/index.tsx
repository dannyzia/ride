import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { colors } from "@/theme/goRide";
import { useAppearance, useIsDark } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useTranslation } from "react-i18next";
import EmptyState from "@/components/EmptyState";

interface Contact {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
}

const ADD_ROUTE = "/(main)/(customer)/(tabs)/settings/emergency-contacts/add";

const RELATIONSHIP_LABEL_KEYS: Record<string, string> = {
  Family: "emergency_contacts.relationship_family",
  Friend: "emergency_contacts.relationship_friend",
  Partner: "emergency_contacts.relationship_partner",
  Colleague: "emergency_contacts.relationship_colleague",
  Other: "emergency_contacts.relationship_other",
};

export default function SettingsEmergencyContacts() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const skeletonBg = isDark ? colors.darkSecondary : colors.gray100;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const relLabel = (rel: string) => {
    const key = RELATIONSHIP_LABEL_KEYS[rel];
    return key ? t(key) : rel;
  };

  const fetchContacts = useCallback(async () => {
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(t('emergency_contacts.not_authenticated'));
        return;
      }
      const res = await fetch(`${API_URL}/api/user/emergency-contacts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || data.error || t('emergency_contacts.load_failed'));
        return;
      }
      const data = await res.json();
      setContacts(data.contacts ?? []);
    } catch (err) {
      setError(t('emergency_contacts.network_error'));
      logger.error("[emergency-contacts] fetch failed", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchContacts();
  };

  const callContact = async (contact: Contact) => {
    try {
      const canCall = await Linking.canOpenURL(`tel:${contact.phone}`);
      if (canCall) {
        await Linking.openURL(`tel:${contact.phone}`);
      } else {
        Alert.alert(t('emergency_contacts.cannot_call_title'), t('emergency_contacts.cannot_call_message'));
      }
    } catch (err) {
      logger.error("[emergency-contacts] call failed", err);
      Alert.alert(t('emergency_contacts.cannot_call_title'), t('emergency_contacts.cannot_call_message'));
    }
  };

  const deleteContact = (contact: Contact) => {
    Alert.alert(
      t('emergency_contacts.delete_title'),
      t('emergency_contacts.delete_message', { name: contact.name }),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('common.delete'),
          style: "destructive",
          onPress: async () => {
            try {
              const {
                data: { session },
              } = await supabase.auth.getSession();
              const token = session?.access_token;
              if (!token) {
                Alert.alert(t('common.error'), t('emergency_contacts.not_authenticated'));
                return;
              }
              const res = await fetch(`${API_URL}/api/user/emergency-contacts?id=${contact.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                Alert.alert(t('common.error'), data.message || data.error || t('emergency_contacts.delete_failed'));
                return;
              }
              setContacts((prev) => prev.filter((c) => c.id !== contact.id));
            } catch (err) {
              Alert.alert(t('common.error'), t('emergency_contacts.network_error'));
              logger.error("[emergency-contacts] delete failed", err);
            }
          },
        },
      ],
    );
  };

  const renderSkeleton = () => (
    <View style={styles.listContent}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: surfaceBg, borderColor }]}>
          <View style={[styles.avatar, { backgroundColor: skeletonBg }]} />
          <View style={styles.skeletonTextCol}>
            <View style={[styles.skeletonLine, { backgroundColor: skeletonBg, width: "45%" }]} />
            <View style={[styles.skeletonLine, { backgroundColor: skeletonBg, width: "70%" }]} />
          </View>
        </View>
      ))}
    </View>
  );

  const renderItem = ({ item }: { item: Contact }) => (
    <View style={[styles.card, { backgroundColor: surfaceBg, borderColor }]}>
      <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
        <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.contactCol}>
        <Text style={[styles.nameText, { color: textPrimary }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.phoneText, { color: textSecondary }]} numberOfLines={1}>
          {item.relationship ? `${relLabel(item.relationship)} · ` : ""}
          {item.phone}
        </Text>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t('emergency_contacts.a11y_call', { name: item.name })}
        onPress={() => callContact(item)}
        style={styles.callButton}
        hitSlop={4}
      >
        <Ionicons name="call-outline" size={22} color={colors.primary} />
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t('emergency_contacts.a11y_delete', { name: item.name })}
        onPress={() => deleteContact(item)}
        style={styles.deleteButton}
        hitSlop={4}
      >
        <Ionicons name="trash-outline" size={20} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('emergency_contacts.a11y_go_back')}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: textPrimary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {t('profile.emergency_contacts')}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('emergency_contacts.a11y_add')}
          onPress={() => router.push(ADD_ROUTE)}
          style={styles.addButton}
        >
          <Ionicons name="add" size={24} color={colors.white} />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('emergency_contacts.a11y_toggle_theme')}
          onPress={() => setTheme(isDark ? "light" : "dark")}
          hitSlop={8}
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={24} color={textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        renderSkeleton()
      ) : error ? (
        <View style={styles.errorWrap}>
          <View style={[styles.errorBanner, { backgroundColor: `${colors.danger}1A` }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('emergency_contacts.a11y_retry')}
              style={[styles.retryButton, { borderColor: colors.danger }]}
              onPress={() => {
                setLoading(true);
                fetchContacts();
              }}
            >
              <Text style={[styles.retryText, { color: colors.danger }]}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title={t('emergency_contacts.empty_title')}
              subtitle={t('emergency_contacts.empty_subtitle')}
              actionLabel={t('emergency_contacts.add')}
              onAction={() => router.push(ADD_ROUTE)}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
    textAlign: "center",
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    minHeight: 80,
    gap: 4,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarInitial: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
    color: colors.primary,
  },
  contactCol: {
    flex: 1,
    gap: 2,
  },
  nameText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  phoneText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  callButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  skeletonTextCol: {
    flex: 1,
    gap: 8,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
  },
  errorWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  errorBanner: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  errorText: {
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
  },
  retryButton: {
    alignSelf: "flex-start",
    minHeight: 48,
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 20,
  },
  retryText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
});
