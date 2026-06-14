import { colors } from "@/theme/goRide";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Stack, router, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AntDesign } from "@expo/vector-icons";
import { logger } from "@/lib/logger";

const STACK_OPTS = {
  headerShown: false,
  contentStyle: { backgroundColor: colors.darkSurface },
} as const;

export default function AdminLayout() {
  const segments = useSegments();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

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
      try {
        const res = await fetch("/api/auth/verify-token", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setHasSession(true);
          setIsAdmin(data.role === "admin");
        } else {
          setHasSession(true);
          setIsAdmin(false);
        }
      } catch {
        setHasSession(true);
        setIsAdmin(false);
      } finally {
        setChecking(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ---- Navigation side-effects ----
  useEffect(() => {
    // Unauthenticated users on admin routes → go to admin login (NOT rider phone-entry)
    if (!checking && !hasSession && !isLoginRoute) {
      router.replace("/admin/login");
    }
    // Already authenticated admin stuck on login page → go to dashboard
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

  // ---- Authenticated but not admin ----
  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <AntDesign name="lock" size={48} color={colors.danger} />
        <Text style={styles.deniedTitle}>Access Denied</Text>
        <Text style={styles.deniedSubtitle}>
          Admin privileges required. Your account role is not &quot;admin&quot;.
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
      </View>
    );
  }

  // ---- Admin authenticated: render full panel ----
  return (
    <Stack screenOptions={STACK_OPTS}>
      <Stack.Screen name="index" options={{ title: "Admin" }} />
      <Stack.Screen name="verification" options={{ title: "Verification" }} />
      <Stack.Screen name="packages" options={{ title: "Packages" }} />
      <Stack.Screen name="zones" options={{ title: "Zones" }} />
      <Stack.Screen name="city-boundaries" options={{ title: "City Boundaries" }} />
      <Stack.Screen name="configuration" options={{ title: "Configuration" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.darkSurface,
    paddingHorizontal: 24,
  },
  deniedTitle: {
    color: colors.textPrimaryDark,
    fontSize: 20,
    fontWeight: "700",
    marginTop: 16,
    fontFamily: "Jakarta-Bold",
  },
  deniedSubtitle: {
    color: colors.textSecondaryDark,
    textAlign: "center",
    marginTop: 8,
    fontSize: 14,
    fontFamily: "Jakarta-Regular",
  },
  signOutLink: {
    color: colors.adminAccent,
    fontSize: 14,
    marginTop: 20,
    textDecorationLine: "underline",
    fontFamily: "Jakarta-SemiBold",
  },
});
