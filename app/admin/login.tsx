import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

/**
 * Dedicated admin login page.
 *
 * Uses Supabase email/password auth — does NOT require an SMS provider.
 * After successful sign-in, navigates to /admin (dashboard).
 * The admin layout's onAuthStateChange listener verifies the role.
 */
export default function AdminLoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      setError("Enter email and password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
        logger.error("[admin] sign-in failed", signInError);
        return;
      }

      if (!data.user) {
        setError("No user returned. Check your credentials.");
        return;
      }

      // Navigate to admin dashboard.
      // The admin layout's onAuthStateChange will verify the role.
      router.replace("/admin");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      setError(msg);
      logger.error("[admin] sign-in exception", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.inner}
      >
        {/* Lock icon */}
        <View style={styles.iconWrap}>
          <Text style={styles.iconText}>🔒</Text>
        </View>

        <Text style={styles.title}>Admin Panel</Text>
        <Text style={styles.subtitle}>Sign in with your admin credentials</Text>

        {/* Email */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="admin@example.com"
            placeholderTextColor="#666"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
        </View>

        {/* Password */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
            onSubmitEditing={handleSignIn}
          />
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.signInBtn, loading && styles.signInBtnDisabled]}
          onPress={handleSignIn}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.signInBtnText}>Sign In</Text>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#181A20",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  inner: {
    width: "100%",
    maxWidth: 380,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(100, 181, 246, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 20,
  },
  iconText: {
    fontSize: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 6,
    fontFamily: "Jakarta-Bold",
  },
  subtitle: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 32,
    fontFamily: "Jakarta-Regular",
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9CA3AF",
    marginBottom: 6,
    fontFamily: "Jakarta-SemiBold",
  },
  input: {
    backgroundColor: "#212126",
    borderWidth: 1,
    borderColor: "#35383F",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: "#FFFFFF",
    fontFamily: "Jakarta-Regular",
  },
  errorBox: {
    backgroundColor: "rgba(227, 29, 28, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(227, 29, 28, 0.3)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 13,
    fontFamily: "Jakarta-Regular",
  },
  signInBtn: {
    backgroundColor: "#64B5F6",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  signInBtnDisabled: {
    backgroundColor: "#35383F",
  },
  signInBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Jakarta-Bold",
  },
});
