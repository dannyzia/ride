/**
 * Login as [Role] — OWNER-DECISION #9.
 *
 * After OTP, an account holding MORE THAN ONE role picks which surface to land
 * in. The screen shows EXACTLY the roles the account holds (never a role it
 * doesn't), with each role's verification state: a pending role explains itself
 * and a REJECTED role shows the admin's reason in-app (R6) with a one-tap
 * resubmit. Single-role accounts never reach this screen (otp-verify branches).
 */
import { useState, useEffect, useCallback } from "react";
import { Text, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsDark } from "@/lib/useAppearance";

/** Where each role lands TODAY. The dedicated shop/fleet/delivery-man
 *  surfaces arrive with S3/S5/S6; until then those roles land on the customer
 *  home with their verification state shown here. */
const ROLE_HOME: Record<string, string> = {
  rider: "/(main)/(customer)/home",
  driver: "/(main)/(rider)/home",
  shop_owner: "/(main)/(customer)/home",
  fleet_owner: "/(main)/(customer)/home",
  delivery_man: "/(main)/(customer)/home",
};

const RESUBMIT_KIND: Record<string, "shop" | "fleet" | "delivery_man"> = {
  shop_owner: "shop",
  fleet_owner: "fleet",
  delivery_man: "delivery_man",
};

interface HeldRole {
  role: string;
  status: "active" | "pending" | "suspended";
  reason: string | null;
  is_primary: boolean;
}

export default function LoginAsScreen() {
  const { phone: phoneParam } = useLocalSearchParams<{ phone?: string }>();
  const phone = phoneParam ?? "";
  const { t } = useTranslation();
  const isDark = useIsDark();

  const [roles, setRoles] = useState<HeldRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resubmitting, setResubmitting] = useState<string | null>(null);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const load = useCallback(async () => {
    if (!phone) {
      setError(t("auth.login_as.missing_phone"));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/check-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.roles)) {
        setError(t("auth.login_as.load_failed"));
        return;
      }
      setRoles(data.roles as HeldRole[]);
    } catch (e) {
      logger.error("[login-as] load failed", e);
      setError(t("auth.login_as.load_failed"));
    } finally {
      setLoading(false);
    }
  }, [phone, t]);

  useEffect(() => {
    load();
  }, [load]);

  const resubmit = async (role: string) => {
    const kind = RESUBMIT_KIND[role];
    if (!kind) return;
    setResubmitting(role);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch(`${API_URL}/api/user/roles/resubmit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ kind }),
      });
      if (res.ok) await load();
    } catch (e) {
      logger.error("[login-as] resubmit failed", e);
    } finally {
      setResubmitting(null);
    }
  };

  const statusLabel = (r: HeldRole) => {
    if (r.status === "active") return null;
    if (r.status === "pending") return t("auth.login_as.status_pending");
    return t("auth.login_as.status_rejected");
  };

  return (
    <SafeAreaView className="flex-1 px-6 justify-center" style={{ backgroundColor: bg }}>
      <ScrollView contentContainerStyle={{ paddingVertical: 24 }}>
        <Text className="text-[26px] font-JakartaBold mb-1" style={{ color: textPrimary }}>
          {t("auth.login_as.title")}
        </Text>
        <Text className="text-[14px] font-JakartaBold mb-6" style={{ color: textSecondary }}>
          {t("auth.login_as.subtitle")}
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text className="text-[14px]" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : (
          roles.map((r) => {
            const label = statusLabel(r);
            const enterable = r.status === "active";
            return (
              <TouchableOpacity
                key={r.role}
                onPress={() =>
                  enterable
                    ? router.replace(ROLE_HOME[r.role] ?? "/(main)/(customer)/home")
                    : // F-02 → F-03: a pending/rejected role is not enterable;
                      // its row opens the verification-status screen.
                      router.push("/(main)/(customer)/verification-status")
                }
               
                className="rounded-xl border px-4 py-4 mb-3"
                style={{
                  backgroundColor: surfaceBg,
                  borderColor: enterable ? colors.primary : borderColor,
                  opacity: enterable ? 1 : 0.85,
                }}
               testID="login-as.push-verification-status">
                <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>
                  {t(`auth.roles.${r.role}`)}
                </Text>
                {label ? (
                  <Text className="text-[13px] mt-1" style={{ color: colors.danger }}>
                    {label}
                  </Text>
                ) : null}
                {r.reason ? (
                  <Text className="text-[13px] mt-1" style={{ color: textSecondary }}>
                    {r.reason}
                  </Text>
                ) : null}
                {!enterable && RESUBMIT_KIND[r.role] ? (
                  <TouchableOpacity
                    onPress={() => resubmit(r.role)}
                    disabled={resubmitting === r.role}
                   
                    className="mt-3 self-start rounded-lg px-4 py-2"
                    style={{ backgroundColor: colors.primary }}
                   testID="login-as.resubmit">
                    <Text className="text-[13px] font-JakartaBold" style={{ color: colors.white }}>
                      {resubmitting === r.role
                        ? t("auth.login_as.resubmitting")
                        : t("auth.login_as.resubmit")}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
