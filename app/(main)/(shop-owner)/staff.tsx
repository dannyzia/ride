/**
 * Staff (S3 §3) — member list + invite-by-phone (OWNER only; the buttons
 * mirror that, the server route is the enforcement).
 *
 * MANAGER|STAFF: can manage day-to-day orders (dashboard). They CANNOT edit
 * the catalog, invite staff, or see payout/settlement money (§3).
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { logger } from "@/lib/logger";

interface Member {
  id: string;
  user_id: string;
  role: string;
  status: string;
  joined_at: string;
  user_name: string | null;
  user_phone: string | null;
}

export default function ShopStaffScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const C = {
    bg: isDark ? colors.bgDark : colors.bgLight,
    text: isDark ? colors.textPrimaryDark : colors.textPrimaryLight,
    sub: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
    surface: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
    border: isDark ? colors.borderDark : colors.borderLight,
  };

  const [shopId, setShopId] = useState<string | null>(null);
  const [role, setRole] = useState<"OWNER" | "MANAGER" | "STAFF">("STAFF");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState<"STAFF" | "MANAGER">("STAFF");
  const [inviting, setInviting] = useState(false);

  const authHeaders = useCallback(async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    return { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" };
  }, []);

  const load = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const mineRes = await fetch(`${API_URL}/api/shop/mine`, { headers });
      if (!mineRes.ok) {
        router.back();
        return;
      }
      const mine = (await mineRes.json()) as {
        shop: { id: string };
        role: "OWNER" | "MANAGER" | "STAFF";
      };
      setShopId(mine.shop.id);
      setRole(mine.role);
      const membersRes = await fetch(`${API_URL}/api/shop/${mine.shop.id}/members`, { headers });
      if (membersRes.ok) {
        const data = (await membersRes.json()) as { members: Member[] };
        setMembers(data.members ?? []);
      }
    } catch (e) {
      logger.error("[shop.staff] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async () => {
    if (!shopId) return;
    const phone = invitePhone.trim();
    if (!phone) {
      Alert.alert(t("shop.dashboard.action_failed"), t("shop.staff.phone_required"));
      return;
    }
    setInviting(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_URL}/api/shop/${shopId}/members`, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone, role: inviteRole }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        Alert.alert(t("shop.dashboard.action_failed"), body.message ?? "");
        return;
      }
      setInvitePhone("");
      // Blind success — resolve the membership display on reload.
      await load();
    } finally {
      setInviting(false);
    }
  };

  const removeMember = async (member: Member) => {
    if (!shopId) return;
    const headers = await authHeaders();
    const res = await fetch(
      `${API_URL}/api/shop/${shopId}/members?user_id=${member.user_id}`,
      { method: "DELETE", headers },
    );
    if (!res.ok) {
      const body = (await res.json()) as { message?: string };
      Alert.alert(t("shop.dashboard.action_failed"), body.message ?? "");
      return;
    }
    await load();
  };

  const canInvite = role === "OWNER";

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: C.bg }}>
      <View className="flex-row items-center px-5 py-3">
        <TouchableOpacity onPress={() => router.back()} testID="shop-owner.staff.el-1">
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text className="text-[17px] font-JakartaBold ml-3" style={{ color: C.text }}>
          {t("shop.staff.title")}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator className="mt-10" color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text className="text-[12px] mb-4" style={{ color: C.sub }}>
            {t("shop.staff.orders_only_note")}
          </Text>

          {members.map((m) => (
            <View
              key={m.id}
              className="rounded-2xl p-4 mb-3 flex-row justify-between items-center"
              style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
            >
              <View className="flex-1 pr-3">
                <Text className="text-[14px] font-JakartaBold" style={{ color: C.text }}>
                  {m.user_name ?? "—"}
                </Text>
                <Text className="text-[12px]" style={{ color: C.sub }}>
                  {m.user_phone ?? "—"}
                </Text>
                <Text className="text-[11px] font-JakartaBold mt-1" style={{ color: colors.primary }}>
                  {t(`shop.staff.role_${m.role.toLowerCase()}`)}
                </Text>
              </View>
              {canInvite && m.role !== "OWNER" ? (
                <TouchableOpacity
                  onPress={() => void removeMember(m)}
                  className="rounded-lg px-3 py-2"
                  style={{ borderWidth: 1, borderColor: colors.danger }}
                 
                 testID="shop-owner.staff.remove-member">
                  <Text className="text-[12px]" style={{ color: colors.danger }}>
                    {t("shop.staff.remove")}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}

          {canInvite ? (
            <View
              className="rounded-2xl p-4 mt-2"
              style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
            >
              <Text className="text-[14px] font-JakartaBold mb-3" style={{ color: C.text }}>
                {t("shop.staff.invite_title")}
              </Text>
              <TextInput
                value={invitePhone}
                onChangeText={setInvitePhone}
                placeholder={t("shop.staff.phone_placeholder")}
                placeholderTextColor={C.sub}
                keyboardType="phone-pad"
                className="rounded-xl border px-3 py-2 mb-3 text-[13px]"
                style={{ color: C.text, borderColor: C.border, backgroundColor: C.bg }}
               
               testID="shop-owner.staff.set-invite-phone"/>
              <View className="flex-row gap-2 mb-3">
                {(["STAFF", "MANAGER"] as const).map((r) => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setInviteRole(r)}
                    className="flex-1 rounded-xl py-2"
                    style={{
                      backgroundColor: inviteRole === r ? colors.primary : C.bg,
                      borderWidth: 1,
                      borderColor: inviteRole === r ? colors.primary : C.border,
                    }}
                   
                   testID="shop-owner.staff.set-invite-role">
                    <Text
                      className="text-[12px] text-center font-JakartaBold"
                      style={{ color: inviteRole === r ? colors.white : C.sub }}
                    >
                      {t(`shop.staff.role_${r.toLowerCase()}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                className="rounded-xl py-3 items-center"
                style={{ backgroundColor: colors.primary }}
                disabled={inviting}
                onPress={() => void invite()}
               
               testID="shop-owner.staff.invite">
                {inviting ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={{ color: colors.white }}>{t("shop.staff.invite")}</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
