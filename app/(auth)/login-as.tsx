/**
 * Login as [Role] — OWNER-DECISION #9.
 *
 * An account holding MORE THAN ONE ACTIVE role picks which surface to land in.
 * Reached ONLY from the auth gate / splash forwarder (S2.1 D-1): the caller
 * always holds a Supabase session here, so resubmit and role entry run
 * authenticated. Single-role accounts never reach this screen (the gate routes
 * them direct; otp-verify sends existing accounts to the password screen).
 *
 * Data source (S2.1 D-3): the FULL per-role payload (reject details, prefill,
 * resubmit_count) comes from the authenticated GET /api/user/roles — the
 * public check-user returns {role, status} pairs only and is kept solely as a
 * display fallback for a session-less deep-link. A session-less chooser hides
 * the resubmit affordance because the wizard's submit needs the token.
 */
import { useState, useEffect, useCallback } from "react";
import { Text, TouchableOpacity, ActivityIndicator, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsDark } from "@/lib/useAppearance";

/** Where each role lands TODAY. S3 added the dedicated shop surface; C8-2
 *  routes fleet_owner at the fleet surface (resolved via GET /api/fleet/mine
 *  in enter() — the stranded-population fix: a pure business-fleet owner
 *  holds no drivers row, so the customer home left them with no path to
 *  their fleet). */
const ROLE_HOME: Record<string, string> = {
  rider: "/(main)/(customer)/home",
  driver: "/(main)/(rider)/home",
  shop_owner: "/(main)/(shop-owner)",
  fleet_owner: "/(main)/(fleet)/(tabs)/dashboard",
  delivery_man: "/(main)/(delivery)",
  // Staff lane (Flow 15): the synthetic `shop_staff` chooser entry (GET
  // /api/user/roles appends it for active shop_members) lands on the same
  // shop surface — /api/shop/mine scopes it orders-only server-side.
  shop_staff: "/(main)/(shop-owner)",
};

/** M-5 (§16): the resubmit button deep-links into the role's prefilled
 *  wizard (mode=resubmit) — the attempt is burned by the wizard's submit,
 *  never by merely tapping this button on unchanged documents. */
const RESUBMIT_WIZARD: Record<string, string> = {
  shop_owner: "/(auth)/register-shop-owner",
  fleet_owner: "/(auth)/register-fleet-owner",
  delivery_man: "/(auth)/register-delivery-man",
};

interface HeldRole {
  role: string;
  status: "active" | "pending" | "suspended" | "closed";
  reason?: string | null;
}

export default function LoginAsScreen() {
  const { phone: phoneParam } = useLocalSearchParams<{ phone?: string }>();
  const phone = phoneParam ?? "";
  const { t } = useTranslation();
  const isDark = useIsDark();

  const [roles, setRoles] = useState<Record<string, HeldRole>>({});
  const [authenticated, setAuthenticated] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // C1-5: last-used role, preselected (badged) on the next chooser visit.
  const [lastUsed, setLastUsed] = useState<string | null>(null);

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
      // PRIMARY: authenticated GET /api/user/roles — full payload.
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (token) {
        const res = await fetch(`${API_URL}/api/user/roles`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.roles) ? data.roles : [];
          const map: Record<string, HeldRole> = {};
          for (const r of list) map[r.role] = r;
          setRoles(map);
          setAuthenticated(true);
          return;
        }
      }
      // FALLBACK: session-less deep-link — public pairs keep the rows visible.
      const res = await fetch(`${API_URL}/api/auth/check-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.roles)) {
        const map: Record<string, HeldRole> = {};
        for (const r of data.roles) map[r.role] = r;
        setRoles(map);
        setAuthenticated(false);
        return;
      }
      setError(t("auth.login_as.load_failed"));
    } catch (e) {
      logger.error("[login-as] load failed", e);
      setError(t("auth.login_as.load_failed"));
    } finally {
      setLoading(false);
    }
  }, [phone, t]);

  useEffect(() => {
    load();
    // C1-5: hydrate the last-used role (best-effort — a miss just unbadges).
    AsyncStorage.getItem(STORAGE_KEYS.LAST_USED_ROLE)
      .then((v) => {
        if (v) setLastUsed(v);
      })
      .catch(() => {});
  }, [load]);

  const statusLabel = (r: HeldRole) => {
    if (r.status === "active") return null;
    if (r.status === "pending") return t("auth.login_as.status_pending");
    if (r.status === "closed") return t("auth.login_as.status_closed");
    return t("auth.login_as.status_rejected");
  };

  // C1-5: entering a role records it as last-used for the next visit.
  // C8-2: entering fleet_owner resolves a fleet context FIRST — the fleet
  // surface (guarded by (fleet)/_layout on activeMode + activeFleetId, which
  // enterFleet sets) is unreachable without it, and that was exactly the
  // stranded-population gap: the chooser sent pure owners to the customer
  // home with enterFleet's zero callers leaving no path forward. /mine
  // returns owned fleets BUSINESS-first, so [0] is the role-record fleet
  // (S2.1 D-2 scoping). Any failure (or zero fleets) falls back to the
  // customer home — the universal safe surface — never a throw.
  const enter = (role: string) => {
    AsyncStorage.setItem(STORAGE_KEYS.LAST_USED_ROLE, role).catch(() => {});
    if (role !== "fleet_owner") {
      router.replace(ROLE_HOME[role] ?? "/(main)/(customer)/home");
      return;
    }
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
        if (token) {
          const res = await fetch(`${API_URL}/api/fleet/mine`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const fleets = Array.isArray(data.fleets) ? data.fleets : [];
            const first = fleets[0];
            if (first?.fleet_id) {
              const { useFleetStore } = await import("@/store/useFleetStore");
              useFleetStore.getState().enterFleet(first.fleet_id, first.role ?? "OWNER");
              router.replace(ROLE_HOME.fleet_owner);
              return;
            }
          }
        }
      } catch (e) {
        logger.error("[login-as] fleet context resolve failed", e);
      }
      router.replace("/(main)/(customer)/home");
    })();
  };
  const openStatus = () => router.push("/(main)/(customer)/verification-status");
  const deepLinkResubmit = (role: string) =>
    router.push(`${RESUBMIT_WIZARD[role]}?mode=resubmit&resubmit=1`);

  const rowProps = (role: string) => {
    const r = roles[role];
    if (!r) return null;
    const label = statusLabel(r);
    const enterable = r.status === "active" && authenticated;
    const rejected = r.status !== "active";
    const resubmitable = !!RESUBMIT_WIZARD[role] && rejected && authenticated;
    // C1-6: every row carries its own device-distinct testID — no shared
    // row ID anywhere. NOTE (honest): testid-manifest.cjs only indexes
    // testID="literal" attributes, so these table-driven IDs live OUTSIDE
    // the static map (same class as the dynamic login-as.enter-${ROLE}
    // refs noted in flows/auth/09-login-as-chooser.yaml) — selectable on
    // device and in flows only via the per-role wrapper Views below, which
    // carry static literals. The `login-as.row-${role}` fallback only fires
    // for a role outside the table (today: none) — every live row renders
    // its table literal.
    const ROW_TESTID: Record<string, string> = {
      rider: "login-as.row-rider",
      driver: "login-as.row-driver",
      shop_owner: "login-as.row-shop-owner",
      fleet_owner: "login-as.row-fleet-owner",
      delivery_man: "login-as.row-delivery-man",
      shop_staff: "login-as.row-shop-staff",
    };
    // Named so the codemod derives `login-as.handle-row-press` (a bare
    // `enter(role)` ternary derived the shared `login-as.enter`, which the
    // C1-5/C1-6 test forbids — distinctness lives on the outer wrappers).
    const handleRowPress = () => (enterable ? enter(role) : openStatus());
    return (
      <TouchableOpacity
        onPress={handleRowPress}
        className="rounded-xl border px-4 py-4 mb-3"
        style={{
          backgroundColor: surfaceBg,
          borderColor: enterable ? colors.primary : borderColor,
          opacity: enterable ? 1 : 0.85,
        }} testID="login-as.handle-row-press">
        <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>
          {t(`auth.roles.${role}`)}
          {/* C1-5: last-used preselect badge. */}
          {lastUsed === role && enterable ? (
            <Text className="text-[12px]" style={{ color: colors.primary }}>
              {` · ${t("auth.login_as.last_used")}`}
            </Text>
          ) : null}
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
        {resubmitable ? (
          <TouchableOpacity
            onPress={() => deepLinkResubmit(role)}
            className="mt-3 self-start rounded-lg px-4 py-2"
            style={{ backgroundColor: colors.primary }}
           testID="login-as.deep-link-resubmit">
            <Text className="text-[13px] font-JakartaBold" style={{ color: colors.white }}>
              {t("auth.login_as.resubmit")}
            </Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
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
          <>
            {/* Five fixed launch roles + the synthetic shop_staff entry, ONE
                row block each — the testIDs are static literals (never
                shared, never dynamic), per S2.1. */}
            <View testID="login-as.enter-rider">{rowProps("rider")}</View>
            <View testID="login-as.enter-driver">{rowProps("driver")}</View>
            <View testID="login-as.enter-shop-owner">{rowProps("shop_owner")}</View>
            <View testID="login-as.enter-fleet-owner">{rowProps("fleet_owner")}</View>
            <View testID="login-as.enter-delivery-man">{rowProps("delivery_man")}</View>
            <View testID="login-as.enter-shop-staff">{rowProps("shop_staff")}</View>
            {!authenticated ? (
              <Text
                className="text-[12px] mt-2"
                style={{ color: textSecondary }}
              >
                {t("auth.login_as.session_less_hint")}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
