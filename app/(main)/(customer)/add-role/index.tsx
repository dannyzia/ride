/**
 * Add a role (§2, OWNER-DECISION #8/#9) — reached from Profile → Add a role.
 *
 * Shows the roles this account already HOLDS (with verification state and any
 * admin reject reason — R6 surfaces in-app here too), plus the roles it can
 * still add:
 *   - Customer      → INSTANT (no verification)
 *   - Shop Owner / Fleet Owner / Delivery Man → their wizard → PENDING until
 *     the admin queue approves (§7)
 * R9: adding a role expands the EXISTING account — never a second account.
 * Driver is intentionally absent: its gate is the driver onboarding wizard.
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsDark } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";

interface HeldRole {
  role: string;
  status: "active" | "pending" | "suspended" | "closed";
  reason: string | null;
  is_primary: boolean;
}

const ADDABLE: { role: string; route?: string; instant?: boolean }[] = [
  { role: "rider", instant: true },
  { role: "shop_owner", route: "/(auth)/register-shop-owner" },
  { role: "fleet_owner", route: "/(auth)/register-fleet-owner" },
  { role: "delivery_man", route: "/(auth)/register-delivery-man" },
];

// S2.1 minor (§16): static testIDs — one literal per role everywhere, never a
// shared id and never a dynamic template (testid-map visibility).
const ROW_TESTID: Record<string, string> = {
  rider: "add-role.row-rider",
  driver: "add-role.row-driver",
  shop_owner: "add-role.row-shop-owner",
  fleet_owner: "add-role.row-fleet-owner",
  delivery_man: "add-role.row-delivery-man",
};
const ADDABLE_TESTID: Record<string, string> = {
  rider: "add-role.add-rider",
  shop_owner: "add-role.add-shop-owner",
  fleet_owner: "add-role.add-fleet-owner",
  delivery_man: "add-role.add-delivery-man",
};

export default function AddRoleScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const [roles, setRoles] = useState<HeldRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/user/roles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.roles)) setRoles(data.roles as HeldRole[]);
    } catch (e) {
      logger.error("[add-role] load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addRider = async () => {
    setBusy("rider");
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) return;
      await fetch(`${API_URL}/api/user/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: "rider" }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const held = new Set(roles.map((r) => r.role));

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text className="text-[24px] font-JakartaBold mb-1" style={{ color: textPrimary }}>
          {t("auth.add_role.title")}
        </Text>
        <Text className="text-[13px] font-JakartaBold mb-5" style={{ color: textSecondary }}>
          {t("auth.add_role.subtitle")}
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Text className="text-[13px] mb-2" style={{ color: textSecondary }}>
              {t("auth.add_role.your_roles")}
            </Text>
            {roles.map((r) => (
              <View
                key={r.role}
                testID={ROW_TESTID[r.role]}
                className="rounded-xl border px-4 py-3 mb-2"
                style={{ backgroundColor: surfaceBg, borderColor }}
              >
                <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>
                  {t(`auth.roles.${r.role}`)}
                  {r.is_primary ? ` · ${t("auth.add_role.primary")}` : ""}
                </Text>
                {r.status !== "active" ? (
                  <Text className="text-[13px] mt-1" style={{ color: colors.danger }}>
                    {r.status === "pending"
                      ? t("auth.login_as.status_pending")
                      : r.status === "closed"
                        ? t("auth.login_as.status_closed")
                        : t("auth.login_as.status_rejected")}
                  </Text>
                ) : null}
                {r.reason ? (
                  <Text className="text-[13px] mt-1" style={{ color: textSecondary }}>
                    {r.reason}
                  </Text>
                ) : null}
              </View>
            ))}

            <Text className="text-[13px] mt-4 mb-2" style={{ color: textSecondary }}>
              {t("auth.add_role.add_more")}
            </Text>
            {ADDABLE.filter((a) => !held.has(a.role)).map((a) => (
              <TouchableOpacity
                key={a.role}
                disabled={busy === a.role}
                onPress={() =>
                  a.instant
                    ? addRider()
                    : router.push(`${a.route}?mode=addRole` as never)
                }
               
                className="rounded-xl border px-4 py-3 mb-2"
                style={{ backgroundColor: surfaceBg, borderColor: colors.primary }}
               testID="customer.add-role.push-push">
                <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>
                  {t(`auth.roles.${a.role}`)}
                </Text>
                <Text className="text-[12px] mt-1" style={{ color: textSecondary }}>
                  {a.instant ? t("auth.add_role.instant") : t("auth.add_role.verification_gated")}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
