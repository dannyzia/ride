import { colors } from "@/theme/goRide";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Stack, router, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AntDesign from "@expo/vector-icons/AntDesign";
import GlobalActionButtons from "@/components/GlobalActionButtons";
import { logger } from "@/lib/logger";
import { AdminToastProvider } from "@/components/admin/AdminToast";
import { ADMIN_ROLES, type AdminRole } from "@/lib/adminRoles";

const STACK_OPTS = {
  headerShown: false,
  contentStyle: { backgroundColor: colors.darkSurface },
} as const;

export default function AdminLayout() {
  const segments = useSegments();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState("");

  const segs = segments as readonly string[];
  const isLoginRoute = segs.length > 1 && segs[1] === "login";

  // ---- Auth state listener ----
  useEffect(() => {
    if (!supabase?.auth?.onAuthStateChange) {
      logger.warn("[admin] Supabase client not configured");
      setChecking(false);
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setHasSession(false);
        setIsAdmin(false);
        setChecking(false);
        return;
      }

      setHasSession(true);
      setAuthError("");
      const email = session.user.email ?? "unknown";

      // Role resolution is server-only (POST /api/auth/verify-token): the
      // former anon-key table lookup was killed by RLS default-deny (T6 audit)
      // and is removed — ISSUE-81 zero-policy conversion. The
      // registration-race retry lives server-side in the route.
      try {
        const res = await fetch("/api/auth/verify-token", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.exists && ADMIN_ROLES.includes(data.role)) {
            setIsAdmin(true);
            setChecking(false);
            return;
          }
          if (data.exists) {
            setIsAdmin(false);
            setAuthError(
              `Signed in as ${email}, but role is "${data.role}".\n\n` +
                `Contact the owner to be granted panel access.`,
            );
            setChecking(false);
            return;
          }
          // data.exists === false → user not in DB
          setIsAdmin(false);
          setAuthError(
            `Signed in as ${email}, but no admin account was found.\n\n` +
              `Contact the owner to be granted panel access.`,
          );
          setChecking(false);
          return;
        }
      } catch {
        // Server API unreachable — fall through to error
      }

      // ── Server API failed ──
      setIsAdmin(false);
      setAuthError(
        `Signed in as ${email}.\n\n` +
          `The server API is not reachable. Contact the owner to be granted panel access.`,
      );
      setChecking(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ---- Navigation side-effects ----
  useEffect(() => {
    if (!checking && !hasSession && !isLoginRoute) {
      router.replace("/admin/login");
    }
    if (!checking && hasSession && isAdmin && isLoginRoute) {
      router.replace("/admin");
    }
  }, [checking, hasSession, isAdmin, isLoginRoute]);

  // ---- Login page: always render without auth gate ----
  if (isLoginRoute) {
    return (
      <Stack screenOptions={STACK_OPTS}>
        <Stack.Screen name="login" options={{ title: "Admin Login" }} />
      </Stack>
    );
  }

  // ---- Loading state ----
  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.adminAccent} />
      </View>
    );
  }

  // ---- No session (redirect firing) ----
  if (!hasSession) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.adminAccent} />
      </View>
    );
  }

  // ---- Authenticated but not admin — show detailed error ----
  if (!isAdmin) {
    return (
      <ScrollView
        style={styles.errorScroll}
        contentContainerStyle={styles.center}
      >
        <AntDesign name="lock" size={48} color={colors.danger} />
        <Text style={styles.deniedTitle}>Access Denied</Text>
        <Text style={styles.errorText}>
          {authError || "Admin privileges required."}
        </Text>
        <Text
          onPress={() => {
            supabase.auth.signOut();
            router.replace("/admin/login");
          }}
          style={styles.signOutLink}
        >
          Sign out and try a different account
        </Text>
      </ScrollView>
    );
  }

  // ---- Admin authenticated: render full panel ----
  // Stack auto-discovers any new admin/*.tsx route. We just supply shared opts.
  return (
    <AdminToastProvider>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={STACK_OPTS}>
          <Stack.Screen name="index" options={{ title: "Admin" }} />
          <Stack.Screen name="login" options={{ title: "Admin Login" }} />
        </Stack>
        <GlobalActionButtons />
      </View>
    </AdminToastProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.darkSurface,
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  errorScroll: {
    flex: 1,
    backgroundColor: colors.darkSurface,
  },
  deniedTitle: {
    color: colors.textPrimaryDark,
    fontSize: 20,
    fontWeight: "700",
    marginTop: 16,
    fontFamily: "Jakarta-Bold",
  },
  errorText: {
    color: colors.textSecondaryDark,
    textAlign: "center",
    marginTop: 12,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Jakarta-Regular",
  },
  signOutLink: {
    color: colors.adminAccent,
    fontSize: 14,
    marginTop: 24,
    textDecorationLine: "underline",
    fontFamily: "Jakarta-SemiBold",
  },
});
