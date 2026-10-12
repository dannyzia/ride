/**
 * Shop Owner onboarding wizard (§2c) — register screen c.
 *
 * Shop profile (name, category, address) + trade license (+ food-safety cert
 * for restaurants) → the account is created with the shop PENDING until the
 * admin verification queue approves it (§7). Also reachable from Settings →
 * Add a role (mode=addRole), which expands an EXISTING account (R9) instead of
 * creating a second one.
 */
import { useState, useEffect } from "react";
import { Text, TextInput, ScrollView, ActivityIndicator, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsDark } from "@/lib/useAppearance";
import CustomButton from "@/components/CustomButton";
import DocumentUploadCard from "@/components/DocumentUploadCard";

interface ShopType {
  id: string;
  slug: string;
  label_en: string;
  label_bn: string;
  is_restaurant: boolean;
}

export default function RegisterShopOwnerScreen() {
  const params = useLocalSearchParams<{
    phone?: string;
    name?: string;
    password?: string;
    mode?: string;
    resubmit?: string;
  }>();
  const mode = params.mode === "addRole" ? "addRole" : "register";
  const { t, i18n } = useTranslation();
  const isDark = useIsDark();
  const isBn = i18n.language === "bn";

  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [types, setTypes] = useState<ShopType[]>([]);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [licenseUrl, setLicenseUrl] = useState<string | null>(null);
  const [foodCertUrl, setFoodCertUrl] = useState<string | null>(null);

  // F-03 prefilled resubmit: seed the applicant's prior answers (best-effort —
  // the wizard stays fully usable empty).
  useEffect(() => {
    if (params.resubmit !== "1") return;
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
        const res = await fetch(`${API_URL}/api/user/roles`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        const data = await res.json();
        const mine = (data.roles ?? []).find((r: { role: string }) => r.role === "shop_owner");
        const p = mine?.prefill;
        if (!p) return;
        if (p.shop_name) setShopName(p.shop_name);
        if (p.address_line) setAddress(p.address_line);
        if (p.shop_type_id) setTypeId(p.shop_type_id);
      } catch {
        /* prefill is best-effort */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.resubmit]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/shop/types`);
        const data = await res.json();
        if (res.ok && Array.isArray(data.shop_types)) setTypes(data.shop_types as ShopType[]);
      } catch (e) {
        logger.warn("[register-shop-owner] shop types load failed", e);
      }
    })();
  }, []);

  const selectedType = types.find((ty) => ty.id === typeId) ?? null;

  const canSubmit =
    shopName.trim().length >= 2 &&
    address.trim().length >= 3 &&
    !!typeId &&
    !!licenseUrl &&
    (!selectedType?.is_restaurant || !!foodCertUrl);

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      const url = mode === "addRole" ? `${API_URL}/api/user/roles` : `${API_URL}/api/register`;
      const body =
        mode === "addRole"
          ? {
              role: "shop_owner",
              shop: {
                shop_name: shopName.trim(),
                shop_type_id: typeId,
                address_line: address.trim(),
                license_url: licenseUrl,
                ...(foodCertUrl ? { food_safety_cert_url: foodCertUrl } : {}),
              },
            }
          : {
              phone: params.phone,
              name: params.name,
              password: params.password,
              role: "shop_owner",
              shop: {
                shop_name: shopName.trim(),
                shop_type_id: typeId,
                address_line: address.trim(),
                license_url: licenseUrl,
                ...(foodCertUrl ? { food_safety_cert_url: foodCertUrl } : {}),
              },
            };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || t("auth.shop_owner.submit_failed"));
        return;
      }
      if (mode === "addRole") {
        Alert.alert(t("auth.shop_owner.added_title"), t("auth.shop_owner.added_body"));
        router.back();
      } else {
        router.replace("/(main)/(customer)/home");
      }
    } catch (e) {
      logger.error("[register-shop-owner] submit failed", e);
      setError(t("auth.shop_owner.submit_failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text className="text-[24px] font-JakartaBold mb-1" style={{ color: textPrimary }}>
          {t("auth.shop_owner.title")}
        </Text>
        <Text className="text-[13px] font-JakartaBold mb-5" style={{ color: textSecondary }}>
          {t("auth.shop_owner.subtitle")}
        </Text>

        <TextInput
          value={shopName}
          onChangeText={setShopName}
          placeholder={t("auth.shop_owner.shop_name")}
          placeholderTextColor={textSecondary}
          className="rounded-xl border px-4 py-3 mb-3 text-[15px]"
          style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
         
         testID="register-shop-owner.set-shop-name"/>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder={t("auth.shop_owner.address")}
          placeholderTextColor={textSecondary}
          className="rounded-xl border px-4 py-3 mb-3 text-[15px]"
          style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
         
         testID="register-shop-owner.set-address"/>

        <Text className="text-[13px] mb-2" style={{ color: textSecondary }}>
          {t("auth.shop_owner.category")}
        </Text>
        {types.map((ty) => (
          <Text
            key={ty.id}
            onPress={() => setTypeId(ty.id)}
            testID={`register-shop-owner.select-type-${ty.slug}`}
            className="rounded-xl border px-4 py-3 mb-2 text-[14px]"
            style={{
              backgroundColor: typeId === ty.id ? colors.primary : surfaceBg,
              borderColor: typeId === ty.id ? colors.primary : borderColor,
              color: typeId === ty.id ? colors.white : textPrimary,
            }}
          >
            {isBn ? ty.label_bn : ty.label_en}
          </Text>
        ))}

        <DocumentUploadCard
          docType="trade_license"
          label={t("auth.shop_owner.trade_license")}
          folder="documents"
          onUploadComplete={(url) => setLicenseUrl(url)}
          testID="register-shop-owner.upload-trade-license"
        />
        {selectedType?.is_restaurant ? (
          <DocumentUploadCard
            docType="food_safety_cert"
            label={t("auth.shop_owner.food_cert")}
            folder="documents"
            onUploadComplete={(url) => setFoodCertUrl(url)}
            testID="register-shop-owner.upload-food-cert"
          />
        ) : null}

        {error ? (
          <Text className="text-[13px] mb-2" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <CustomButton
            title={t("auth.shop_owner.submit")}
            onPress={submit}
            disabled={!canSubmit}
           
           testID="register-shop-owner.submit"/>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
