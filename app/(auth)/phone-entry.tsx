import { useState } from "react";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity, Image } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsDark } from "@/lib/useAppearance";
import CustomButton from "@/components/CustomButton";
import { getRideVerticalEnabled } from "@/lib/verticalFlags";

export default function PhoneEntryScreen(props: { mode?: "user" | "operator" } = {}) {
  const router = useRouter();
  const isDark = useIsDark();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ mode?: string; role?: string }>();

  // Stage 4: mode prop (from operator-login wrapper) or URL param (from operator-register)
  const mode = props.mode ?? (params.mode === "operator" ? "operator" : "user");
  const isOperatorMode = mode === "operator";

  const [phone, setPhone] = useState("");
  // Stage 4: role pills render ONLY when flag is on AND in user mode (D-6)
  const rideVisible = getRideVerticalEnabled();
  const initialRole = (["rider", "driver", "shop_owner", "fleet_owner", "delivery_man"].includes(params.role as string)
    ? params.role
    : "rider") as "rider" | "driver" | "shop_owner" | "fleet_owner" | "delivery_man";
  const [role, setRole] = useState<"rider" | "driver" | "shop_owner" | "fleet_owner" | "delivery_man">(initialRole);
  // C1-1 (STAGE C1-FIX): T&C + Privacy consent gate — one checkbox between
  // role choice and phone/OTP, covering all five paths (F-01 REG node).
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Separated consent (§4 mandatory / §6 optional): marketing opt-in is
  // independent, defaults OFF, and never blocks registration.
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  // C7 (REPAIR-1): noun-named on purpose — the testID codemod derives
  // phone-entry.terms-checkbox from this identifier (an inline arrow derives
  // set-terms-accepted, which does not round-trip against the recorded id).
  const termsCheckbox = () => setTermsAccepted((v) => !v);
  const marketingCheckbox = () => setMarketingOptIn((v) => !v);

  // Separated consent params: terms stays mandatory (terms=1), marketing
  // rides alongside as mkt=1 only when opted in (default absent = OFF).
  const consentSuffix = (marketing: boolean) =>
    `${marketing ? "&mkt=1" : ""}`;

  const handleLogin = async () => {
    const fullPhone = `+880${phone}`;
    if (fullPhone.length !== 14) {
      setError("Enter a valid phone number");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const checkResponse = await fetch(`${API_URL}/api/auth/check-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });

      const checkData = await checkResponse.json();

      if (!checkResponse.ok) {
        const msg =
          typeof checkData.message === "string"
            ? checkData.message
            : checkData.error || "Failed to check phone number";
        setError(msg);
        return;
      }

      if (checkData.exists) {
        router.push(`/(auth)/login?phone=${encodeURIComponent(fullPhone)}`);
      } else {
        setError("No account found with this phone number. Tap Register to create one.");
      }
    } catch (e) {
      setError("Network error. Please try again.");
      logger.error("[auth] login check error", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    const fullPhone = `+880${phone}`;
    if (fullPhone.length !== 14) {
      setError("Enter a valid phone number");
      return;
    }

    // C1-1: registration requires explicit T&C + Privacy consent first.
    if (!termsAccepted) {
      setError(t("auth.terms.required"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const checkResponse = await fetch(`${API_URL}/api/auth/check-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });

      const checkData = await checkResponse.json();

      if (!checkResponse.ok) {
        const msg =
          typeof checkData.message === "string"
            ? checkData.message
            : checkData.error || "Failed to check phone number";
        setError(msg);
        return;
      }

      if (checkData.exists) {
        // S2.1 D-1 (§16): a MULTI-role phone taps Register → the §2 login
        // contract (phone → OTP → role routing) — otp-verify completes the
        // phone-ownership proof, then the password screen holds the session
        // and the auth gate routes to the Login-as chooser. Single-role
        // keepers get the unchanged login hint.
        const held = Array.isArray(checkData.roles) ? checkData.roles : [];
        if (held.length > 1) {
          router.push(`/(auth)/otp-verify?phone=${encodeURIComponent(fullPhone)}&role=${role}&terms=1${consentSuffix(marketingOptIn)}`);
          return;
        }
        setError("An account with this phone already exists. Please login.");
      } else {
        router.push(`/(auth)/otp-verify?phone=${encodeURIComponent(fullPhone)}&role=${role}&terms=1${consentSuffix(marketingOptIn)}`);
      }
    } catch (e) {
      setError("Network error. Please try again.");
      logger.error("[auth] register check error", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 px-6 justify-center" style={{ backgroundColor: bg }}>
      {/* Logo */}
      <View className="items-center mb-10">
        <Image
          source={require("@/assets/logo/node_icon_1024.png")}
          className="w-24 h-24 rounded-xl"
          resizeMode="contain"
        />
        <Text
          className="text-[28px] font-JakartaBold font-bold mb-3 leading-[1.2] tracking-[-0.5px]"
          style={{ color: textPrimary }}
        >
          Node
        </Text>
        <Text
          className="text-[15px] font-JakartaBold mb-1"
          style={{ color: textSecondary }}
        >
          {t("auth.tagline")}
        </Text>
      </View>

      <Text
        className="text-[22px] font-JakartaBold font-bold mb-1"
        style={{ color: textPrimary }}
      >
        {t("auth.get_started")}
      </Text>
      <Text
        className="text-[14px] font-JakartaBold mb-6"
        style={{ color: textSecondary }}
      >
        {t("auth.phone_entry")}
      </Text>

      {/* Phone Input */}
      <View
        className="flex-row items-center rounded-xl border px-4 mb-4"
        style={{ backgroundColor: surfaceBg, borderColor: borderColor }}
      >
        <Text
          className="text-[15px] font-JakartaBold mr-2"
          style={{ color: textSecondary }}
        >
          +880
        </Text>
        <TextInput
          className="flex-1 py-4 text-[15px] font-JakartaBold"
          style={{ color: textPrimary }}
          placeholder="1XXXXXXXXX"
          placeholderTextColor={isDark ? colors.textDisabledDark : colors.textDisabledLight}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={(text) => {
            setPhone(text.replace(/\D/g, "").replace(/^0+/, "").slice(0, 10));
            if (error) setError("");
          }}
          maxLength={10}
         testID="phone-entry.set-phone"/>
      </View>

{/* Role Selector — §0 #8: every public signup role is a visible button.
          Stage 4: pills render ONLY when flag is on AND in user mode (D-6).
          Operator mode suppresses pills entirely. */}
      {!isOperatorMode && rideVisible && (
        <View
          className="flex-row flex-wrap gap-2 mb-6"
        >        {/* §0 #8: every public signup role is a visible button. One element
            per pill (not a .map) so each keeps its own derivable testID —
            driver flows select phone-entry.set-role-2. */}
        <TouchableOpacity
          key="rider"
          className="py-3 px-4 rounded-full items-center justify-center"
          style={{
            backgroundColor: role === "rider" ? colors.primary : surfaceBg,
            borderWidth: 1,
            borderColor: role === "rider" ? colors.primary : borderColor,
          }}
          onPress={() => setRole("rider")}
         testID="phone-entry.set-role">
          <Text
            className="text-[13px] font-JakartaBold font-bold"
            style={{ color: role === "rider" ? colors.white : textSecondary }}
          >
            {t("auth.roles.rider")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          key="driver"
          className="py-3 px-4 rounded-full items-center justify-center"
          style={{
            backgroundColor: role === "driver" ? colors.primary : surfaceBg,
            borderWidth: 1,
            borderColor: role === "driver" ? colors.primary : borderColor,
          }}
          onPress={() => setRole("driver")}
         testID="phone-entry.set-role-2">
          <Text
            className="text-[13px] font-JakartaBold font-bold"
            style={{ color: role === "driver" ? colors.white : textSecondary }}
          >
            {t("auth.roles.driver")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          key="shop_owner"
          className="py-3 px-4 rounded-full items-center justify-center"
          style={{
            backgroundColor: role === "shop_owner" ? colors.primary : surfaceBg,
            borderWidth: 1,
            borderColor: role === "shop_owner" ? colors.primary : borderColor,
          }}
          onPress={() => setRole("shop_owner")}
         testID="phone-entry.set-role-3">
          <Text
            className="text-[13px] font-JakartaBold font-bold"
            style={{ color: role === "shop_owner" ? colors.white : textSecondary }}
          >
            {t("auth.roles.shop_owner")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          key="fleet_owner"
          className="py-3 px-4 rounded-full items-center justify-center"
          style={{
            backgroundColor: role === "fleet_owner" ? colors.primary : surfaceBg,
            borderWidth: 1,
            borderColor: role === "fleet_owner" ? colors.primary : borderColor,
          }}
          onPress={() => setRole("fleet_owner")}
         testID="phone-entry.set-role-4">
          <Text
            className="text-[13px] font-JakartaBold font-bold"
            style={{ color: role === "fleet_owner" ? colors.white : textSecondary }}
          >
            {t("auth.roles.fleet_owner")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          key="delivery_man"
          className="py-3 px-4 rounded-full items-center justify-center"
          style={{
            backgroundColor: role === "delivery_man" ? colors.primary : surfaceBg,
            borderWidth: 1,
            borderColor: role === "delivery_man" ? colors.primary : borderColor,
          }}
          onPress={() => setRole("delivery_man")}
         testID="phone-entry.set-role-5">
          <Text
            className="text-[13px] font-JakartaBold font-bold"
            style={{ color: role === "delivery_man" ? colors.white : textSecondary }}
          >
            {t("auth.roles.delivery_man")}
          </Text>
        </TouchableOpacity>
      </View>
      )}
      {/* C1-1: T&C + Privacy consent gate — links render LegalDocumentScreen
          (lib/legalContent.ts copy, no new copy per Copy Truth). */}
      <TouchableOpacity
        onPress={termsCheckbox}
        className="flex-row items-start mb-4"
        testID="phone-entry.terms-checkbox">
        <View
          className="w-6 h-6 rounded-md border items-center justify-center mr-3 mt-[2px]"
          style={{
            backgroundColor: termsAccepted ? colors.primary : surfaceBg,
            borderColor: termsAccepted ? colors.primary : borderColor,
          }}>
          {termsAccepted ? (
            <Text style={{ color: colors.white, fontSize: 16, fontWeight: "bold" }}>✓</Text>
          ) : null}
        </View>
        <Text className="flex-1 text-[13px] font-JakartaBold leading-[18px]" style={{ color: textSecondary }}>
          {t("auth.terms.agree_prefix")}{" "}
          <Text style={{ color: colors.primary }} onPress={() => router.push("/(auth)/terms")}>
            {t("auth.terms.terms_link")}
          </Text>{" "}          {t("auth.terms.and")}{" "}
          <Text style={{ color: colors.primary }} onPress={() => router.push("/(auth)/privacy")}>
            {t("auth.terms.privacy_link")}
          </Text>
        </Text>
      </TouchableOpacity>

      {/* §6 optional marketing opt-in — default OFF, never blocks progress. */}
      <TouchableOpacity
        onPress={marketingCheckbox}
        className="flex-row items-start mb-4"
        testID="phone-entry.marketing-checkbox">
        <View
          className="w-6 h-6 rounded-md border items-center justify-center mr-3 mt-[2px]"
          style={{
            backgroundColor: marketingOptIn ? colors.primary : surfaceBg,
            borderColor: marketingOptIn ? colors.primary : borderColor,
          }}>
          {marketingOptIn ? (
            <Text style={{ color: colors.white, fontSize: 16, fontWeight: "bold" }}>✓</Text>
          ) : null}
        </View>
        <Text className="flex-1 text-[13px] font-JakartaBold leading-[18px]" style={{ color: textSecondary }}>
          {t("auth.terms.marketing_opt_in")}
        </Text>
      </TouchableOpacity>

      {error ? (
        <Text className="text-[14px] font-JakartaBold text-center mb-3" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}

<View className="gap-y-3">
        <CustomButton
          title={loading ? "Loading..." : t("auth.login")}
          onPress={handleLogin}
          disabled={loading}
         testID="phone-entry.handle-login"/>
        {!isOperatorMode && (
          <CustomButton
            title={loading ? "Loading..." : t("auth.register")}
            onPress={handleRegister}
            disabled={loading}
           testID="phone-entry.handle-register"/>
        )}
        {isOperatorMode && (
          <TouchableOpacity
            onPress={() => router.push("/(auth)/operator-register")}
           
           testID="phone-entry.push-operator-register">
            <Text style={{ color: colors.primary, textDecorationLine: "underline" }}>
              {t("auth.register_as_operator")}
            </Text>
          </TouchableOpacity>
        )}
        <Text className="text-center text-[13px] font-JakartaBold mt-4" style={{ color: textSecondary }}>
          {t("auth.one_account_explainer")}
        </Text>
        {!isOperatorMode && (
          <TouchableOpacity
            onPress={() => router.push("/(auth)/operator-login")}
           
           testID="phone-entry.push-operator-login">
            <Text style={{ color: colors.primary, textDecorationLine: "underline" }}>
              {t("auth.login_as_operator")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
