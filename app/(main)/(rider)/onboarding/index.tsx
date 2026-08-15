import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { uploadImage } from "@/lib/imageToURL";
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import DocumentUploadCard from "@/components/DocumentUploadCard";
import { VEHICLE_TYPES, type VehicleTypeEnum } from "@/lib/vehicleTypes";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";

class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new ApiError("not_authenticated", "Not authenticated");
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      typeof data.error === "string" ? data.error : `http_${res.status}`,
      typeof data.message === "string"
        ? data.message
        : `Request failed (${res.status})`,
    );
  }
  return res;
}

const alertApiError = (title: string, err: unknown) => {
  if (err instanceof ApiError) {
    Alert.alert(title, `${err.code}: ${err.message}`);
  } else {
    logger.error("[onboarding] unexpected error", { error: String(err) });
    Alert.alert(title, "Unexpected error. Please try again.");
  }
};

interface VehicleModelRow {
  id: string;
  brand: string;
  model: string;
  year_start: number | null;
  year_end: number | null;
  default_vehicle_type: string | null;
}

interface DriverMe {
  status: string;
  name: string | null;
  phone: string | null;
  profile_image_url: string | null;
  vehicle_id: string | null;
}

const OTHERS = "__others__";
const CURRENT_YEAR = new Date().getFullYear();
const YEARS: number[] = Array.from(
  { length: CURRENT_YEAR - 1980 + 1 },
  (_, i) => CURRENT_YEAR - i,
);

const STEP_TITLES = [
  "Profile",
  "Vehicle",
  "Vehicle Documents",
  "Driver Documents",
  "Rideshare Experience",
  "Payout",
  "Review & Consent",
];

const VEHICLE_DOC_FIELDS = [
  { key: "reg_scan_front", label: "Registration (Front)" },
  { key: "reg_scan_back", label: "Registration (Back)" },
  { key: "brta_certificate", label: "BRTA Enlistment Certificate" },
  { key: "vehicle_photo_front", label: "Vehicle Photo (Front)" },
  { key: "vehicle_photo_left", label: "Vehicle Photo (Left)" },
  { key: "vehicle_photo_back", label: "Vehicle Photo (Back)" },
  { key: "vehicle_photo_right", label: "Vehicle Photo (Right)" },
];

const DRIVER_DOC_FIELDS = [
  { key: "nid_front", label: "NID (Front)" },
  { key: "nid_back", label: "NID (Back)" },
  { key: "license_front", label: "Driving License (Front)" },
  { key: "license_back", label: "Driving License (Back)" },
];

const LEGACY_DOC_FIELDS = [
  { key: "uber_screenshot", label: "Uber Screenshot" },
  { key: "pathao_screenshot", label: "Pathao Screenshot" },
  { key: "obhai_screenshot", label: "Obhai Screenshot" },
  { key: "indrive_screenshot", label: "Indrive Screenshot" },
];

const CONSENT_ITEMS = [
  "I confirm that all submitted documents are genuine and belong to me.",
  "I agree to the Terms of Service and Privacy Policy.",
  "I consent to background verification as required by regulatory authorities.",
  "I understand that submitting false documents will result in permanent account rejection.",
];

interface PickerOption {
  value: string;
  label: string;
}

function OptionPickerModal({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedValue: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Close picker"
          style={{ flex: 1 }}
          onPress={onClose}
        />
        <View
          style={{
            maxHeight: "60%",
            backgroundColor: surfaceBg,
            borderTopLeftRadius: radii["2xl"],
            borderTopRightRadius: radii["2xl"],
            padding: spacing.lg,
            paddingBottom: spacing["2xl"],
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: spacing.md,
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 17,
                color: textPrimary,
              }}
            >
              {title}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close picker"
              onPress={onClose}
            >
              <Ionicons name="close" size={22} color={textSecondary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={options}
            keyExtractor={(item) => item.value}
            renderItem={({ item }) => {
              const selected = item.value === selectedValue;
              return (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: spacing.md,
                    paddingHorizontal: spacing.sm,
                    borderRadius: radii.md,
                    backgroundColor: selected ? colors.primary + "1A" : "transparent",
                  }}
                  onPress={() => {
                    onSelect(item.value);
                    onClose();
                  }}
                >
                  <Text
                    style={{
                      fontFamily: selected ? "Jakarta-SemiBold" : "Jakarta-Regular",
                      fontSize: 15,
                      color: selected ? colors.primary : textPrimary,
                    }}
                  >
                    {item.label}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            }}
            ItemSeparatorComponent={() => (
              <View style={{ height: 1, backgroundColor: borderColor }} />
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

export default function OnboardingWizard() {
  const isDark = useIsDark();
  const fetchDriver = useDriverFlowStore((s) => s.fetchDriver);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const [step, setStep] = useState(1);
  const [bootLoading, setBootLoading] = useState(true);
  const [me, setMe] = useState<DriverMe | null>(null);
  const [stepSubmitting, setStepSubmitting] = useState(false);

  // Step 1 — profile
  const [name, setName] = useState("");
  const [photoLocalUri, setPhotoLocalUri] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [savedProfileKey, setSavedProfileKey] = useState<string | null>(null);

  // Step 2 — vehicle
  const [vehicleType, setVehicleType] = useState<VehicleTypeEnum | null>(null);
  const [models, setModels] = useState<VehicleModelRow[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [brand, setBrand] = useState<string | null>(null);
  const [brandText, setBrandText] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [modelText, setModelText] = useState("");
  const [regYear, setRegYear] = useState<number | null>(null);
  const [plate, setPlate] = useState("");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [savedVehicleKey, setSavedVehicleKey] = useState<string | null>(null);
  const [vehicleSkipped, setVehicleSkipped] = useState(false);
  const [pickerModal, setPickerModal] = useState<"brand" | "model" | "year" | null>(
    null,
  );

  // Steps 3–5 — documents
  const [vehicleDocs, setVehicleDocs] = useState<Record<string, string>>({});
  const [savedVehicleDocsKey, setSavedVehicleDocsKey] = useState<string | null>(null);
  const [driverDocs, setDriverDocs] = useState<Record<string, string>>({});
  const [legacyAnswer, setLegacyAnswer] = useState<"yes" | "no" | null>(null);
  const [legacyDocs, setLegacyDocs] = useState<Record<string, string>>({});

  // Step 6 — payout
  const [bkash, setBkash] = useState("");
  const [bkashTouched, setBkashTouched] = useState(false);
  const [savedPayout, setSavedPayout] = useState<string | null>(null);

  // Step 7 — consent
  const [consent, setConsent] = useState<boolean[]>(
    CONSENT_ITEMS.map(() => false),
  );
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/driver/me");
        const data = await res.json();
        if (!cancelled && data.driver) {
          setMe(data.driver);
          setName(data.driver.name ?? "");
          setPhotoUrl(data.driver.profile_image_url ?? null);
        }
      } catch (err) {
        if (!cancelled) alertApiError("Failed to load profile", err);
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedBrand = brand === OTHERS ? brandText.trim() : brand;
  const resolvedModel = model === OTHERS ? modelText.trim() : model;

  const brands = useMemo(() => {
    const set = new Set(models.map((m) => m.brand));
    return Array.from(set).sort();
  }, [models]);

  const modelOptions = useMemo(() => {
    if (!brand || brand === OTHERS) return [];
    const set = new Set(
      models.filter((m) => m.brand === brand).map((m) => m.model),
    );
    return Array.from(set).sort();
  }, [models, brand]);

  const vehiclePayloadKey = JSON.stringify({
    brand: resolvedBrand,
    model: resolvedModel,
    year: regYear,
    type: vehicleType,
    plate: plate.trim().toUpperCase(),
  });

  const profileKey = JSON.stringify({ name: name.trim(), photo: photoUrl ?? photoLocalUri });

  const step1Valid = name.trim().length > 0;
  const step2Valid =
    vehicleType != null &&
    !!resolvedBrand &&
    resolvedBrand.length > 0 &&
    !!resolvedModel &&
    resolvedModel.length > 0 &&
    regYear != null &&
    plate.trim().length > 0;
  const step3Valid = VEHICLE_DOC_FIELDS.every((f) => !!vehicleDocs[f.key]);
  const step4Valid = DRIVER_DOC_FIELDS.every((f) => !!driverDocs[f.key]);
  const step5Valid = true;
  const bkashValid = /^01\d{9}$/.test(bkash);
  const step6Valid = bkashValid;
  const step7Valid = consent.every(Boolean);

  const stepValid = (n: number): boolean => {
    switch (n) {
      case 1:
        return step1Valid;
      case 2:
        return step2Valid;
      case 3:
        return step3Valid;
      case 4:
        return step4Valid;
      case 5:
        return step5Valid;
      case 6:
        return step6Valid;
      case 7:
        return step7Valid;
      default:
        return false;
    }
  };

  const selectVehicleType = async (vt: VehicleTypeEnum) => {
    setVehicleType(vt);
    setBrand(null);
    setBrandText("");
    setModel(null);
    setModelText("");
    setModelsLoading(true);
    try {
      const res = await apiFetch(
        `/api/driver/vehicle-models?vehicle_type=${encodeURIComponent(vt)}`,
      );
      const data = await res.json();
      setModels(data.models ?? []);
    } catch (err) {
      alertApiError("Failed to load vehicle models", err);
    } finally {
      setModelsLoading(false);
    }
  };

  const pickProfilePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoLocalUri(result.assets[0].uri);
      }
    } catch (err) {
      logger.error("[onboarding] photo pick failed", { error: String(err) });
    }
  };

  const submitProfile = async () => {
    if (savedProfileKey === profileKey) {
      setStep(2);
      return;
    }
    setStepSubmitting(true);
    try {
      let urlToSend = photoUrl;
      if (photoLocalUri) {
        urlToSend = await uploadImage(
          photoLocalUri,
          `driver_photo/${Date.now()}.jpg`,
        );
        setPhotoUrl(urlToSend);
      }
      const body: Record<string, string> = { name: name.trim() };
      if (urlToSend) body.profile_image_url = urlToSend;
      await apiFetch("/api/driver/me", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setSavedProfileKey(JSON.stringify({ name: name.trim(), photo: urlToSend ?? null }));
      setStep(2);
    } catch (err) {
      alertApiError("Profile Save Failed", err);
    } finally {
      setStepSubmitting(false);
    }
  };

  const submitVehicle = async () => {
    if (savedVehicleKey === vehiclePayloadKey) {
      setStep(3);
      return;
    }
    setStepSubmitting(true);
    try {
      const res = await apiFetch("/api/driver/vehicles", {
        method: "POST",
        body: JSON.stringify({
          brand: resolvedBrand,
          model: resolvedModel,
          registration_year: regYear,
          vehicle_type: vehicleType,
          registration_plate: plate.trim(),
        }),
      });
      const data = await res.json();
      setVehicleId(data.vehicle?.id ?? null);
      setSavedVehicleKey(vehiclePayloadKey);
      if (data.model_created) {
        Alert.alert(
          "Pending Admin Review",
          "The brand/model you entered is new. It has been submitted for admin review and will be visible to other drivers once approved.",
        );
      }
      setStep(3);
    } catch (err) {
      alertApiError("Vehicle Save Failed", err);
    } finally {
      setStepSubmitting(false);
    }
  };

  const skipVehicleStep = () => {
    if (me?.vehicle_id) {
      setVehicleId(me.vehicle_id);
      setVehicleSkipped(true);
      setStep(3);
    }
  };

  const submitVehicleDocs = async () => {
    const vehicleDocsKey = JSON.stringify(vehicleDocs);
    if (savedVehicleDocsKey === vehicleDocsKey) {
      setStep(4);
      return;
    }
    setStepSubmitting(true);
    try {
      const body: Record<string, unknown> = { documents: vehicleDocs };
      const vid = vehicleId ?? me?.vehicle_id ?? null;
      if (vid) body.vehicle_id = vid;
      await apiFetch("/api/driver/documents", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSavedVehicleDocsKey(vehicleDocsKey);
      setStep(4);
    } catch (err) {
      alertApiError("Document Submission Failed", err);
    } finally {
      setStepSubmitting(false);
    }
  };

  const submitPayout = async () => {
    if (savedPayout === bkash) {
      setStep(7);
      return;
    }
    setStepSubmitting(true);
    try {
      await apiFetch("/api/driver/payout-method", {
        method: "POST",
        body: JSON.stringify({ account_number: bkash }),
      });
      setSavedPayout(bkash);
      setStep(7);
    } catch (err) {
      alertApiError("Payout Setup Failed", err);
    } finally {
      setStepSubmitting(false);
    }
  };

  const finishOnboarding = async () => {
    setFinishing(true);
    try {
      const finalDocs: Record<string, string> = { ...driverDocs };
      if (legacyAnswer === "yes") {
        Object.assign(finalDocs, legacyDocs);
      }
      if (Object.keys(finalDocs).length > 0) {
        await apiFetch("/api/driver/documents", {
          method: "POST",
          body: JSON.stringify({
            documents: finalDocs,
            consent_accepted: true,
            consent_version: "v1",
          }),
        });
      }
      await fetchDriver();
      router.replace("/(main)/(rider)/verification");
    } catch (err) {
      alertApiError("Submission Failed", err);
    } finally {
      setFinishing(false);
    }
  };

  const canContinue = (n: number): boolean =>
    n === 2 && vehicleSkipped ? true : stepValid(n);

  const goNext = () => {
    if (!canContinue(step)) return;
    switch (step) {
      case 1:
        void submitProfile();
        break;
      case 2:
        if (vehicleSkipped && !step2Valid) {
          setStep(3);
          break;
        }
        void submitVehicle();
        break;
      case 3:
        void submitVehicleDocs();
        break;
      case 4:
        setStep(5);
        break;
      case 5:
        setStep(6);
        break;
      case 6:
        void submitPayout();
        break;
      case 7:
        void finishOnboarding();
        break;
    }
  };

  const goBack = () => {
    if (step > 1) setStep(step - 1);
    else router.back();
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: "Jakarta-Regular",
    fontSize: 15,
    color: textPrimary,
  };

  const labelStyle = {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
    color: textPrimary,
    marginBottom: spacing.sm,
  };

  const secondaryLabelStyle = {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    color: textSecondary,
    marginBottom: spacing.sm,
  };

  if (bootLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const checklistRows = [
    {
      label: "Profile",
      detail: name.trim() || "—",
      done: step1Valid,
    },
    {
      label: "Vehicle",
      detail:
        vehicleId != null
          ? `${resolvedBrand ?? ""} ${resolvedModel ?? ""} · ${plate.trim().toUpperCase()}`
          : "Existing vehicle on file",
      done: true,
    },
    {
      label: "Vehicle documents",
      detail: `${VEHICLE_DOC_FIELDS.filter((f) => vehicleDocs[f.key]).length}/${VEHICLE_DOC_FIELDS.length} uploaded`,
      done: step3Valid,
    },
    {
      label: "Driver documents",
      detail: `${DRIVER_DOC_FIELDS.filter((f) => driverDocs[f.key]).length}/${DRIVER_DOC_FIELDS.length} uploaded`,
      done: step4Valid,
    },
    {
      label: "Rideshare experience",
      detail:
        legacyAnswer === "yes"
          ? `${Object.keys(legacyDocs).length} screenshot(s) — optional`
          : "Skipped",
      done: true,
    },
    {
      label: "Payout method",
      detail: bkashValid ? `bKash ${bkash}` : "—",
      done: bkashValid,
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: borderColor,
        }}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={goBack}
          style={{ padding: spacing.xs }}
        >
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            textAlign: "center",
            fontFamily: "Jakarta-Bold",
            fontSize: 17,
            color: textPrimary,
          }}
        >
          Driver Onboarding
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Segmented progress bar */}
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          {STEP_TITLES.map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: radii.pill,
                backgroundColor:
                  i < step ? colors.primary : borderColor,
              }}
            />
          ))}
        </View>
        <Text
          style={{
            fontFamily: "Jakarta-SemiBold",
            fontSize: 12,
            color: textSecondary,
            marginTop: spacing.sm,
          }}
        >
          {`Step ${step} of 7 — ${STEP_TITLES[step - 1]}`}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: spacing["4xl"],
        }}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && (
          <View>
            <Text style={{ ...labelStyle, fontSize: 16 }}>Your name</Text>
            <TextInput
              accessibilityLabel="Full name"
              style={inputStyle}
              placeholder="Enter your full name"
              placeholderTextColor={textSecondary}
              value={name}
              onChangeText={setName}
            />
            <Text style={{ ...labelStyle, fontSize: 16, marginTop: spacing.xl }}>
              Profile photo
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Pick profile photo from gallery"
                onPress={pickProfilePhoto}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  backgroundColor: surfaceBg,
                  borderWidth: 1,
                  borderColor,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {photoLocalUri || photoUrl ? (
                  <Image
                    source={{ uri: photoLocalUri ?? photoUrl ?? undefined }}
                    style={{ width: 96, height: 96, borderRadius: 48 }}
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons name="person" size={36} color={textSecondary} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Pick profile photo from gallery"
                onPress={pickProfilePhoto}
                style={{ marginLeft: spacing.lg }}
              >
                <Text
                  style={{
                    fontFamily: "Jakarta-SemiBold",
                    fontSize: 14,
                    color: colors.primary,
                  }}
                >
                  Choose from gallery
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={{ ...labelStyle, fontSize: 16 }}>Vehicle type</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {VEHICLE_TYPES.map((vt) => {
                const selected = vehicleType === vt.key;
                return (
                  <TouchableOpacity
                    key={vt.key}
                    accessibilityRole="button"
                    accessibilityLabel={vt.display_en}
                    onPress={() => void selectVehicleType(vt.key)}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      borderRadius: radii.pill,
                      borderWidth: 1.5,
                      borderColor: selected ? colors.primary : borderColor,
                      backgroundColor: selected ? colors.primary + "1A" : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: selected ? "Jakarta-SemiBold" : "Jakarta-Regular",
                        fontSize: 13,
                        color: selected ? colors.primary : textPrimary,
                      }}
                    >
                      {vt.display_en}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {modelsLoading && (
              <ActivityIndicator
                size="small"
                color={colors.primary}
                style={{ marginTop: spacing.md }}
              />
            )}

            {vehicleType != null && !modelsLoading && (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={labelStyle}>Brand</Text>
                {brand === OTHERS ? (
                  <View>
                    <TextInput
                      accessibilityLabel="Vehicle brand"
                      style={inputStyle}
                      placeholder="Enter brand (e.g. Bajaj)"
                      placeholderTextColor={textSecondary}
                      value={brandText}
                      onChangeText={setBrandText}
                      autoCapitalize="words"
                    />
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Choose brand from list instead"
                      onPress={() => setBrand(null)}
                      style={{ marginTop: spacing.sm }}
                    >
                      <Text
                        style={{
                          fontFamily: "Jakarta-SemiBold",
                          fontSize: 13,
                          color: colors.primary,
                        }}
                      >
                        Choose from list instead
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Select vehicle brand"
                    style={{ ...inputStyle, justifyContent: "center" }}
                    onPress={() => setPickerModal("brand")}
                  >
                    <Text
                      style={{
                        fontFamily: "Jakarta-Regular",
                        fontSize: 15,
                        color: brand ? textPrimary : textSecondary,
                      }}
                    >
                      {brand ?? "Select brand"}
                    </Text>
                  </TouchableOpacity>
                )}

                {brand != null && (
                  <View style={{ marginTop: spacing.lg }}>
                    <Text style={labelStyle}>Model</Text>
                    {model === OTHERS || brand === OTHERS ? (
                      <View>
                        <TextInput
                          accessibilityLabel="Vehicle model"
                          style={inputStyle}
                          placeholder="Enter model (e.g. CT100)"
                          placeholderTextColor={textSecondary}
                          value={modelText}
                          onChangeText={setModelText}
                          autoCapitalize="words"
                        />
                        {brand !== OTHERS && (
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Choose model from list instead"
                            onPress={() => setModel(null)}
                            style={{ marginTop: spacing.sm }}
                          >
                            <Text
                              style={{
                                fontFamily: "Jakarta-SemiBold",
                                fontSize: 13,
                                color: colors.primary,
                              }}
                            >
                              Choose from list instead
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Select vehicle model"
                        style={{ ...inputStyle, justifyContent: "center" }}
                        onPress={() => setPickerModal("model")}
                      >
                        <Text
                          style={{
                            fontFamily: "Jakarta-Regular",
                            fontSize: 15,
                            color: model ? textPrimary : textSecondary,
                          }}
                        >
                          {model ?? "Select model"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {(brand === OTHERS || model === OTHERS) && (
                  <Text
                    style={{
                      fontFamily: "Jakarta-Regular",
                      fontSize: 12,
                      color: colors.amber,
                      marginTop: spacing.sm,
                    }}
                  >
                    New brand/model entries are reviewed by an admin before other
                    drivers can see them.
                  </Text>
                )}

                <Text style={{ ...labelStyle, marginTop: spacing.lg }}>
                  BRTA Registration Year
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Select BRTA registration year"
                  style={{ ...inputStyle, justifyContent: "center" }}
                  onPress={() => setPickerModal("year")}
                >
                  <Text
                    style={{
                      fontFamily: "Jakarta-Regular",
                      fontSize: 15,
                      color: regYear != null ? textPrimary : textSecondary,
                    }}
                  >
                    {regYear != null ? String(regYear) : "Select year"}
                  </Text>
                </TouchableOpacity>

                <Text style={{ ...labelStyle, marginTop: spacing.lg }}>
                  Registration Plate
                </Text>
                <TextInput
                  accessibilityLabel="Registration plate number"
                  style={inputStyle}
                  placeholder="e.g. DHAKA-METRO-KA-1234"
                  placeholderTextColor={textSecondary}
                  autoCapitalize="characters"
                  value={plate}
                  onChangeText={setPlate}
                />
              </View>
            )}

            {me?.vehicle_id != null && !vehicleSkipped && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Skip vehicle step, use existing vehicle"
                onPress={skipVehicleStep}
                style={{ marginTop: spacing.xl, alignSelf: "center" }}
              >
                <Text
                  style={{
                    fontFamily: "Jakarta-SemiBold",
                    fontSize: 14,
                    color: colors.primary,
                  }}
                >
                  Skip — I already have a vehicle on file
                </Text>
              </TouchableOpacity>
            )}
            {vehicleSkipped && (
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 13,
                  color: textSecondary,
                  marginTop: spacing.lg,
                  textAlign: "center",
                }}
              >
                Skipped — your existing vehicle on file will be used.
              </Text>
            )}
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={secondaryLabelStyle}>
              Upload your vehicle documents. All are required.
            </Text>
            {VEHICLE_DOC_FIELDS.map((f) => (
              <DocumentUploadCard
                key={f.key}
                docType={f.key}
                label={f.label}
                onUploadComplete={(_path, url) =>
                  setVehicleDocs((prev) => ({ ...prev, [f.key]: url }))
                }
              />
            ))}
          </View>
        )}

        {step === 4 && (
          <View>
            <Text style={secondaryLabelStyle}>
              Upload your personal documents. All are required.
            </Text>
            {DRIVER_DOC_FIELDS.map((f) => (
              <DocumentUploadCard
                key={f.key}
                docType={f.key}
                label={f.label}
                onUploadComplete={(_path, url) =>
                  setDriverDocs((prev) => ({ ...prev, [f.key]: url }))
                }
              />
            ))}
          </View>
        )}

        {step === 5 && (
          <View>
            <Text style={{ ...labelStyle, fontSize: 16 }}>
              Have you driven with Uber, Pathao, Obhai or Indrive?
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              {(["yes", "no"] as const).map((ans) => {
                const selected = legacyAnswer === ans;
                return (
                  <TouchableOpacity
                    key={ans}
                    accessibilityRole="button"
                    accessibilityLabel={ans === "yes" ? "Yes" : "No"}
                    onPress={() => setLegacyAnswer(ans)}
                    style={{
                      flex: 1,
                      paddingVertical: spacing.md,
                      borderRadius: radii.md,
                      borderWidth: 1.5,
                      borderColor: selected ? colors.primary : borderColor,
                      backgroundColor: selected ? colors.primary + "1A" : "transparent",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: selected ? "Jakarta-SemiBold" : "Jakarta-Regular",
                        fontSize: 15,
                        color: selected ? colors.primary : textPrimary,
                      }}
                    >
                      {ans === "yes" ? "Yes" : "No"}
                      </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {legacyAnswer === "yes" && (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={secondaryLabelStyle}>
                  Optional — helps us verify your experience. None of these are
                  required.
                </Text>
                {LEGACY_DOC_FIELDS.map((f) => (
                  <DocumentUploadCard
                    key={f.key}
                    docType={f.key}
                    label={f.label}
                    onUploadComplete={(_path, url) =>
                      setLegacyDocs((prev) => ({ ...prev, [f.key]: url }))
                    }
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {step === 6 && (
          <View>
            <Text style={{ ...labelStyle, fontSize: 16 }}>
              bKash account number
            </Text>
            <TextInput
              accessibilityLabel="bKash account number"
              style={{
                ...inputStyle,
                borderColor:
                  bkashTouched && !bkashValid ? colors.danger : borderColor,
              }}
              placeholder="01XXXXXXXXX"
              placeholderTextColor={textSecondary}
              keyboardType="phone-pad"
              maxLength={11}
              value={bkash}
              onChangeText={(t) => {
                setBkash(t.replace(/[^0-9]/g, ""));
                setBkashTouched(true);
              }}
            />
            {bkashTouched && !bkashValid && (
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 13,
                  color: colors.danger,
                  marginTop: spacing.xs,
                }}
              >
                Enter a valid bKash number (11 digits starting with 01)
              </Text>
            )}
            <Text style={{ ...secondaryLabelStyle, marginTop: spacing.md }}>
              Your ride earnings are paid out to this bKash account.
            </Text>
          </View>
        )}

        {step === 7 && (
          <View>
            <Text style={{ ...labelStyle, fontSize: 16 }}>Review</Text>
            {checklistRows.map((row) => (
              <View
                key={row.label}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: surfaceBg,
                  borderWidth: 1,
                  borderColor,
                  borderRadius: radii.md,
                  padding: spacing.md,
                  marginBottom: spacing.sm,
                }}
              >
                <Ionicons
                  name={row.done ? "checkmark-circle" : "ellipse-outline"}
                  size={22}
                  color={row.done ? colors.success : colors.gray600}
                />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text
                    style={{
                      fontFamily: "Jakarta-SemiBold",
                      fontSize: 14,
                      color: textPrimary,
                    }}
                  >
                    {row.label}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Jakarta-Regular",
                      fontSize: 13,
                      color: textSecondary,
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    {row.detail}
                  </Text>
                </View>
              </View>
            ))}

            <Text style={{ ...labelStyle, fontSize: 16, marginTop: spacing.lg }}>
              Consent
            </Text>
            {CONSENT_ITEMS.map((item, i) => (
              <TouchableOpacity
                key={i}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consent[i] }}
                accessibilityLabel={item}
                onPress={() =>
                  setConsent((prev) => {
                    const next = [...prev];
                    next[i] = !next[i];
                    return next;
                  })
                }
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  backgroundColor: surfaceBg,
                  borderWidth: 1,
                  borderColor,
                  borderRadius: radii.md,
                  padding: spacing.md,
                  marginBottom: spacing.sm,
                }}
              >
                <Ionicons
                  name={consent[i] ? "checkbox" : "square-outline"}
                  size={20}
                  color={consent[i] ? colors.primary : textSecondary}
                />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "Jakarta-Regular",
                    fontSize: 13,
                    color: textPrimary,
                    marginLeft: spacing.md,
                    lineHeight: 19,
                  }}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
            <Text style={{ ...secondaryLabelStyle, marginTop: spacing.md }}>
              After submission, an admin reviews your documents and activates
              your account manually — usually 1–2 business days.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Footer navigation */}
      <View
        style={{
          flexDirection: "row",
          gap: spacing.md,
          padding: spacing.lg,
          borderTopWidth: 1,
          borderTopColor: borderColor,
          backgroundColor: bg,
        }}
      >
        {step > 1 && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Previous step"
            onPress={goBack}
            style={{
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.xl,
              borderRadius: radii.pill,
              borderWidth: 1.5,
              borderColor,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 15,
                color: textSecondary,
              }}
            >
              Back
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={
            step === 7 ? "Submit onboarding" : "Continue to next step"
          }
          onPress={goNext}
          disabled={!canContinue(step) || stepSubmitting || finishing}
          style={{
            flex: 1,
            paddingVertical: spacing.md,
            borderRadius: radii.pill,
            backgroundColor:
              canContinue(step) && !stepSubmitting && !finishing
                ? colors.primary
                : isDark
                  ? colors.textDisabledDark
                  : colors.textDisabledLight,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {stepSubmitting || finishing ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 15,
                color: colors.white,
              }}
            >
              {step === 7 ? "Submit" : "Continue"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <OptionPickerModal
        visible={pickerModal === "brand"}
        title="Select brand"
        selectedValue={brand}
        options={[
          ...brands.map((b) => ({ value: b, label: b })),
          { value: OTHERS, label: "Others" },
        ]}
        onSelect={(v) => {
          setBrand(v);
          setModel(null);
          setModelText("");
        }}
        onClose={() => setPickerModal(null)}
      />
      <OptionPickerModal
        visible={pickerModal === "model"}
        title="Select model"
        selectedValue={model}
        options={[
          ...modelOptions.map((m) => ({ value: m, label: m })),
          { value: OTHERS, label: "Others" },
        ]}
        onSelect={(v) => setModel(v)}
        onClose={() => setPickerModal(null)}
      />
      <OptionPickerModal
        visible={pickerModal === "year"}
        title="BRTA Registration Year"
        selectedValue={regYear != null ? String(regYear) : null}
        options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
        onSelect={(v) => setRegYear(parseInt(v, 10))}
        onClose={() => setPickerModal(null)}
      />
    </SafeAreaView>
  );
}
