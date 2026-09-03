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
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import DocumentUploadCard from "@/components/DocumentUploadCard";
import {
  BODY_TYPE_GROUPS,
  BODY_TYPE_DISPLAY,
  type VehicleTypeEnum,
  type BodyTypeEnum,
  getVehicleType,
} from "@/lib/vehicleTypes";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { useTranslation } from "react-i18next";



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

// ── Retry-with-backoff helpers ──────────────────────────────────────────────
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

/** Errors safe to retry (network/timeout/5xx). Business-logic 4xx are not. */
function isRetryableError(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (["not_authenticated", "manual_review_required", "forbidden", "unauthorized"].includes(err.code)) return false;
    if (err.code.startsWith("http_5") || err.code === "http_429") return true;
    return false;
  }
  if (err instanceof TypeError) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// ── §12.2: Body type picker (grouped radio rows) ────────────────────────
function BodyTypePickerModal({
  visible,
  selectedValue,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedValue: BodyTypeEnum | null;
  onSelect: (value: BodyTypeEnum) => void;
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
        <TouchableOpacity style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} />
        <View
          style={{
            maxHeight: "70%",
            backgroundColor: surfaceBg,
            borderTopLeftRadius: radii["2xl"],
            borderTopRightRadius: radii["2xl"],
            padding: spacing.lg,
            paddingBottom: spacing["2xl"],
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
            <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 17, color: textPrimary }}>
              Select Body Type
            </Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={onClose}>
              <Ionicons name="close" size={22} color={textSecondary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={BODY_TYPE_GROUPS}
            keyExtractor={(g) => g.group}
            renderItem={({ item: group }) => (
              <View style={{ marginBottom: spacing.sm }}>
                <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 13, color: textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs, marginLeft: spacing.xs }}>
                  {group.group}
                </Text>
                {group.items.map((item) => {
                  const selected = item.value === selectedValue;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`${item.en} — ${item.bn}`}
                      onPress={() => { onSelect(item.value); onClose(); }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: spacing.md,
                        paddingHorizontal: spacing.sm,
                        borderRadius: radii.md,
                        backgroundColor: selected ? colors.primary + "1A" : "transparent",
                      }}
                    >
                      <Ionicons
                        name={selected ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                        color={selected ? colors.primary : textSecondary}
                      />
                      <View style={{ marginLeft: spacing.md, flex: 1 }}>
                        <Text style={{ fontFamily: selected ? "Jakarta-SemiBold" : "Jakarta-Regular", fontSize: 15, color: selected ? colors.primary : textPrimary }}>
                          {item.en}
                        </Text>
                        <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary }}>
                          {item.bn}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── §12.3: Classification outcome modals ────────────────────────────────
function ClassificationModal({
  result,
  brand,
  model,
  onDismiss,
  onRetry,
}: {
  result: { outcome: "classified"; suggested_vehicle_type: string } | { outcome: "manual_review" };
  brand: string;
  model: string;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const isClassified = result.outcome === "classified";
  const typeName = isClassified
    ? getVehicleType(result.suggested_vehicle_type as VehicleTypeEnum).display_en
    : null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
        <View
          style={{
            width: "90%",
            maxWidth: 400,
            backgroundColor: surfaceBg,
            borderRadius: 16,
            padding: 24,
            alignItems: "center",
          }}
        >
          {/* Icon circle */}
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: isClassified ? colors.primary + "1A" : colors.info + "1A",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing.lg,
            }}
          >
            <Ionicons
              name={isClassified ? "checkmark" : "time"}
              size={40}
              color={isClassified ? colors.primary : colors.info}
            />
          </View>

          <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 20, color: textPrimary, textAlign: "center" }}>
            {isClassified ? "Vehicle Classified" : "Submitted for Review"}
          </Text>

          <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 14, color: textSecondary, textAlign: "center", marginTop: spacing.sm, lineHeight: 20 }}>
            {isClassified
              ? `Your ${brand} ${model} has been classified as`
              : "Your vehicle details have been submitted successfully."}
          </Text>

          {isClassified && typeName && (
            <View
              style={{
                marginTop: spacing.md,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                borderRadius: radii.pill,
                backgroundColor: colors.primary + "1A",
              }}
            >
              <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 16, color: colors.primary }}>
                {typeName}
              </Text>
            </View>
          )}

          <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: textSecondary, textAlign: "center", marginTop: spacing.md, lineHeight: 18 }}>
            {isClassified
              ? "An admin may review and adjust this during document verification."
              : "Our team will review it and update you soon."}
          </Text>
          {!isClassified && (
            <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary, textAlign: "center", marginTop: 2 }}>
              {"আমাদের টিম শীঘ্রই এটি পর্যালোচনা করে আপনাকে জানাবে।"}
            </Text>
          )}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Continue"
            onPress={onDismiss}
            style={{
              marginTop: spacing.xl,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.xl,
              borderRadius: radii.pill,
              backgroundColor: colors.primary,
              minHeight: 56,
              justifyContent: "center",
              alignItems: "center",
              width: "100%",
            }}
          >
            <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 15, color: colors.white }}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// R1: Manual review required — submission failed, vehicle needs human review
function ManualReviewRequiredModal({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
        <View style={{ width: "90%", maxWidth: 400, backgroundColor: surfaceBg, borderRadius: 16, padding: 24, alignItems: "center" }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.info + "1A", alignItems: "center", justifyContent: "center", marginBottom: spacing.lg }}>
            <Ionicons name="time" size={40} color={colors.info} />
          </View>
          <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 20, color: textPrimary, textAlign: "center" }}>Vehicle Needs Review</Text>
          <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: textSecondary, textAlign: "center", marginTop: 2 }}>যাচাই প্রয়োজন</Text>
          <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 14, color: textSecondary, textAlign: "center", marginTop: spacing.sm, lineHeight: 20 }}>
            {"Your vehicle details were submitted for review. Our team will contact you to complete your registration."}
            {"\n"}
            {"আপনার গাড়ির তথ্য পর্যালোচনার জন্য জমা দেওয়া হয়েছে। নিবন্ধন সম্পন্ন করতে আমাদের টিম আপনার সাথে যোগাযোগ করবে।"}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="OK"
            onPress={onDismiss}
            style={{ marginTop: spacing.xl, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.pill, backgroundColor: colors.primary, minHeight: 56, justifyContent: "center", alignItems: "center", width: "100%" }}
          >
            <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 15, color: colors.white }}>{"OK"} / {"ঠিক আছে"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ClassificationErrorModal({
  visible,
  onRetry,
  onBack,
}: {
  visible: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
        <View style={{ width: "90%", maxWidth: 400, backgroundColor: surfaceBg, borderRadius: 16, padding: 24, alignItems: "center" }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.danger + "1A", alignItems: "center", justifyContent: "center", marginBottom: spacing.lg }}>
            <Ionicons name="close" size={40} color={colors.danger} />
          </View>
          <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 20, color: textPrimary, textAlign: "center" }}>Could Not Classify</Text>
          <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 14, color: textSecondary, textAlign: "center", marginTop: spacing.sm, lineHeight: 20 }}>
            Please check your internet connection and try again.
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xl, width: "100%" }}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Form" onPress={onBack}
              style={{ flex: 1, paddingVertical: spacing.md, borderRadius: radii.pill, borderWidth: 1.5, borderColor: textSecondary, minHeight: 56, justifyContent: "center", alignItems: "center" }}>
              <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 15, color: textSecondary }}>Back to Form</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry" onPress={onRetry}
              style={{ flex: 1, paddingVertical: spacing.md, borderRadius: radii.pill, backgroundColor: colors.primary, minHeight: 56, justifyContent: "center", alignItems: "center" }}>
              <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 15, color: colors.white }}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function OnboardingWizard() {
  const { t } = useTranslation();  const isDark = useIsDark();
  const { setTheme } = useAppearance();
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

  // Step 2 — vehicle (§12.2: body_type + engine_cc replace vehicle_type selector)
  const [bodyType, setBodyType] = useState<BodyTypeEnum | null>(null);
  const [engineCc, setEngineCc] = useState("");
  const [seats, setSeats] = useState("");
  const [bodyTypeModalVisible, setBodyTypeModalVisible] = useState(false);
  const [models, setModels] = useState<VehicleModelRow[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [classificationResult, setClassificationResult] = useState<
    { outcome: "classified"; suggested_vehicle_type: string } | { outcome: "manual_review" } | null
  >(null);
  const [classError, setClassError] = useState(false);
  const [manualReviewRequired, setManualReviewRequired] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
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
    body_type: bodyType,
    engine_cc: engineCc,
    plate: plate.trim().toUpperCase(),
  });

  const profileKey = JSON.stringify({ name: name.trim(), photo: photoUrl ?? photoLocalUri });

  const step1Valid = name.trim().length > 0;
  // §12.2: validation requires body_type + engine_cc instead of vehicleType
  // H1: seats required (1–20 per §10.5)
  const parsedSeats = seats.length > 0 ? parseInt(seats, 10) : 0;
  const seatsValid = parsedSeats >= 1 && parsedSeats <= 20;
  const step2Valid =
    bodyType != null &&
    engineCc.length > 0 && parseInt(engineCc, 10) > 0 &&
    seatsValid &&
    !!resolvedBrand && resolvedBrand.length > 0 &&
    !!resolvedModel && resolvedModel.length > 0 &&
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
      case 1: return step1Valid;
      case 2: return step2Valid;
      case 3: return step3Valid;
      case 4: return step4Valid;
      case 5: return step5Valid;
      case 6: return step6Valid;
      case 7: return step7Valid;
      default: return false;
    }
  };

  // §12.2: load vehicle models when body type is first picked
  const loadVehicleModels = async () => {
    setBrand(null);
    setBrandText("");
    setModel(null);
    setModelText("");
    setModelsLoading(true);
    try {
      const res = await apiFetch("/api/driver/vehicle-models");
      const data = await res.json();
      setModels(data.models ?? []);
    } catch (err) {
      alertApiError("Failed to load vehicle models", err);
    } finally {
      setModelsLoading(false);
    }
  };

  const selectBodyType = (bt: BodyTypeEnum) => {
    setBodyType(bt);
    setBodyTypeModalVisible(false);
    if (models.length === 0) {
      void loadVehicleModels();
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

  // §12.3: submit vehicle with classification fields — with retry-with-backoff
  const submitVehicle = async (attempt = 0) => {
    if (savedVehicleKey === vehiclePayloadKey) {
      setStep(3);
      return;
    }
    setStepSubmitting(true);
    if (attempt === 0) {
      setClassificationResult(null);
      setClassError(false);
      setRetryAttempt(0);
    }
    try {
      const res = await apiFetch("/api/driver/vehicles", {
        method: "POST",
        body: JSON.stringify({
          brand: resolvedBrand,
          model: resolvedModel,
          registration_year: regYear,
          registration_plate: plate.trim(),
          engine_cc: parseInt(engineCc, 10) || null,
          body_type: bodyType,
          number_of_seats: parsedSeats || 4,
        }),
      });
      const data = await res.json();
      setVehicleId(data.vehicle?.id ?? null);
      setSavedVehicleKey(vehiclePayloadKey);
      setRetrying(false);
      setRetryAttempt(0);
      // §12.3: show classification outcome as same-screen modal
      if (data.classification) {
        setClassificationResult(data.classification);
      } else {
        // Legacy response — proceed normally
        if (data.model_created) {
          Alert.alert(
            "Pending Admin Review",
            "The brand/model you entered is new. It has been submitted for admin review and will be visible to other drivers once approved.",
          );
        }
        setStep(3);
      }
    } catch (err) {
      setClassificationResult(null);
      // R1: branch on manual_review_required — distinct modal, never retry
      if (err instanceof ApiError && err.code === "manual_review_required") {
        setRetrying(false);
        setRetryAttempt(0);
        setManualReviewRequired(true);
        logger.error("[onboarding] vehicle submit failed", { error: String(err) });
        return;
      }
      // Retry with exponential backoff if error is retryable and attempts remain
      if (isRetryableError(err) && attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS_MS[attempt];
        setRetryAttempt(attempt + 1);
        setRetrying(true);
        logger.info("[onboarding] retrying vehicle submit", { attempt: attempt + 1, delayMs: delay });
        await sleep(delay);
        setRetrying(false);
        await submitVehicle(attempt + 1);
        return;
      }
      // All retries exhausted or non-retryable error
      setRetrying(false);
      setRetryAttempt(0);
      setClassError(true);
      logger.error("[onboarding] vehicle submit failed", { error: String(err) });
    } finally {
      setStepSubmitting(false);
    }
  };

  const dismissClassification = () => {
    setClassificationResult(null);
    setStep(3);
  };

  const retryClassification = () => {
    setClassError(false);
    void submitVehicle(0);
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
      await apiFetch("/api/driver/documents", {
        method: "POST",
        body: JSON.stringify({
          documents: finalDocs,
          consent_accepted: true,
          consent_version: "v1",
        }),
      });
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
      case 1: void submitProfile(); break;
      case 2:
        if (vehicleSkipped && !step2Valid) { setStep(3); break; }
        void submitVehicle();
        break;
      case 3: void submitVehicleDocs(); break;
      case 4: setStep(5); break;
      case 5: setStep(6); break;
      case 6: void submitPayout(); break;
      case 7: void finishOnboarding(); break;
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
    { label: "Profile", detail: name.trim() || "\u2014", done: step1Valid },
    {
      label: "Vehicle",
      detail: vehicleId != null
        ? `${resolvedBrand ?? ""} ${resolvedModel ?? ""} \u00b7 ${plate.trim().toUpperCase()}`
        : "Existing vehicle on file",
      done: true,
    },
    { label: "Vehicle documents", detail: `${VEHICLE_DOC_FIELDS.filter((f) => vehicleDocs[f.key]).length}/${VEHICLE_DOC_FIELDS.length} uploaded`, done: step3Valid },
    { label: "Driver documents", detail: `${DRIVER_DOC_FIELDS.filter((f) => driverDocs[f.key]).length}/${DRIVER_DOC_FIELDS.length} uploaded`, done: step4Valid },
    { label: "Rideshare experience", detail: legacyAnswer === "yes" ? `${Object.keys(legacyDocs).length} screenshot(s) \u2014 optional` : "Skipped", done: true },
    { label: "Payout method", detail: bkashValid ? `bKash ${bkash}` : "\u2014", done: bkashValid },
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
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={isDark ? "Switch to light theme" : "Switch to dark theme"}
          onPress={() => setTheme(isDark ? "light" : "dark")}
          style={{ width: 32, height: 32, borderRadius: radii.md, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          {STEP_TITLES.map((_, i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: radii.pill, backgroundColor: i < step ? colors.primary : borderColor }} />
          ))}
        </View>
        <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 12, color: textSecondary, marginTop: spacing.sm }}>
          {`Step ${step} of 7 \u2014 ${STEP_TITLES[step - 1]}`}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing["4xl"] }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step 1: Profile ──────────────────────────────────────────── */}
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
            <Text style={{ ...labelStyle, fontSize: 16, marginTop: spacing.xl }}>Profile photo</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Pick profile photo from gallery"
                onPress={pickProfilePhoto}
                style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: surfaceBg, borderWidth: 1, borderColor, alignItems: "center", justifyContent: "center", overflow: "hidden" }}
              >
                {photoLocalUri || photoUrl ? (
                  <Image source={{ uri: photoLocalUri ?? photoUrl ?? undefined }} style={{ width: 96, height: 96, borderRadius: 48 }} resizeMode="cover" />
                ) : (
                  <Ionicons name="person" size={36} color={textSecondary} />
                )}
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Pick profile photo from gallery" onPress={pickProfilePhoto} style={{ marginLeft: spacing.lg }}>
                <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: colors.primary }}>Choose from gallery</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Step 2: Vehicle (§12.2: body_type + engine_cc) ────────────── */}
        {step === 2 && (
          <View>
            {/* 1. Body Type (§12.2: first field — frames the mental model) */}
            <Text style={{ ...labelStyle, fontSize: 16 }}>Body Type</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Select body type"
              style={{ ...inputStyle, flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56 }}
              onPress={() => setBodyTypeModalVisible(true)}
            >
              <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 15, color: bodyType ? textPrimary : textSecondary }}>
                {bodyType ? BODY_TYPE_DISPLAY[bodyType].en : "Select body type"}
              </Text>
              <Ionicons name="chevron-down" size={18} color={textSecondary} />
            </TouchableOpacity>

            {/* 2–4: Brand → Model → Year (existing cluster) */}
            {bodyType != null && !modelsLoading && (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={labelStyle}>Brand</Text>
                {brand === OTHERS ? (
                  <View>
                    <TextInput accessibilityLabel="Vehicle brand" style={inputStyle} placeholder="Enter brand (e.g. Toyota)" placeholderTextColor={textSecondary} value={brandText} onChangeText={setBrandText} autoCapitalize="words" />
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose brand from list instead" onPress={() => setBrand(null)} style={{ marginTop: spacing.sm }}>
                      <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 13, color: colors.primary }}>Choose from list instead</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Select vehicle brand" style={{ ...inputStyle, justifyContent: "center" }} onPress={() => setPickerModal("brand")}>
                    <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 15, color: brand ? textPrimary : textSecondary }}>{brand ?? "Select brand"}</Text>
                  </TouchableOpacity>
                )}

                {brand != null && (
                  <View style={{ marginTop: spacing.lg }}>
                    <Text style={labelStyle}>Model</Text>
                    {model === OTHERS || brand === OTHERS ? (
                      <View>
                        <TextInput accessibilityLabel="Vehicle model" style={inputStyle} placeholder="Enter model (e.g. Premio)" placeholderTextColor={textSecondary} value={modelText} onChangeText={setModelText} autoCapitalize="words" />
                        {brand !== OTHERS && (
                          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose model from list instead" onPress={() => setModel(null)} style={{ marginTop: spacing.sm }}>
                            <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 13, color: colors.primary }}>Choose from list instead</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Select vehicle model" style={{ ...inputStyle, justifyContent: "center" }} onPress={() => setPickerModal("model")}>
                        <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 15, color: model ? textPrimary : textSecondary }}>{model ?? "Select model"}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {(brand === OTHERS || model === OTHERS) && (
                  <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: colors.amber, marginTop: spacing.sm }}>
                    New brand/model entries are reviewed by an admin before other drivers can see them.
                  </Text>
                )}

                <Text style={{ ...labelStyle, marginTop: spacing.lg }}>BRTA Registration Year</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Select BRTA registration year" style={{ ...inputStyle, justifyContent: "center" }} onPress={() => setPickerModal("year")}>
                  <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 15, color: regYear != null ? textPrimary : textSecondary }}>
                    {regYear != null ? String(regYear) : "Select year"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {modelsLoading && (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: spacing.md }} />
            )}

            {/* 5. Engine CC (§12.2) */}
            {bodyType != null && !modelsLoading && (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={labelStyle}>Engine CC (BRTA Recorded)</Text>
                <TextInput
                  accessibilityLabel="Engine CC"
                  style={{ ...inputStyle, minHeight: 56 }}
                  placeholder="e.g., 996"
                  placeholderTextColor={textSecondary}
                  keyboardType="numeric"
                  maxLength={5}
                  value={engineCc}
                  onChangeText={(t) => setEngineCc(t.replace(/[^0-9]/g, ""))}
                />
                <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary, marginTop: spacing.xs }}>
                  From your BRTA registration document
                </Text>
              </View>
            )}

            {/* 6. Registered Seats (H1: restored per §10.1) */}
            {bodyType != null && !modelsLoading && (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={labelStyle}>Registered Seats</Text>
                <TextInput
                  accessibilityLabel="Number of seats"
                  style={{ ...inputStyle, minHeight: 56, borderColor: seats.length > 0 && !seatsValid ? colors.danger : borderColor }}
                  placeholder="e.g., 4"
                  placeholderTextColor={textSecondary}
                  keyboardType="numeric"
                  maxLength={2}
                  value={seats}
                  onChangeText={(t) => setSeats(t.replace(/[^0-9]/g, ""))}
                />
                {seats.length > 0 && !seatsValid && (
                  <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: colors.danger, marginTop: spacing.xs }}>
                    {parsedSeats <= 0 ? "Must have at least 1 seat" : "Please check seat count"}
                  </Text>
                )}
              </View>
            )}

            {/* 7. Registration Plate */}
            {bodyType != null && !modelsLoading && (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={{ ...labelStyle, marginTop: spacing.lg }}>Registration Plate</Text>
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

            {/* 8. Auto-classification info card (§12.2) */}
            {bodyType != null && (
              <View
                style={{
                  marginTop: spacing.xl,
                  padding: spacing.md,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: colors.info + "40",
                  backgroundColor: colors.info + "0D",
                  flexDirection: "row",
                  gap: spacing.md,
                }}
              >
                <Ionicons name="information-circle" size={22} color={colors.info} />
                <Text style={{ flex: 1, fontFamily: "Jakarta-Regular", fontSize: 13, color: textSecondary, lineHeight: 18 }}>
                  {"We'll classify your vehicle automatically based on engine size, body type, and seats."}
                  {"\n"}
                  {"ইঞ্জিনের আয়তন, বডি টাইপ এবং আসন সংখ্যার ভিত্তিতে আমরা স্বয়ংক্রিয়ভাবে শ্রেণীবদ্ধ করব।"}
                </Text>
              </View>
            )}

            {me?.vehicle_id != null && !vehicleSkipped && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Skip vehicle step, use existing vehicle"
                onPress={skipVehicleStep}
                style={{ marginTop: spacing.xl, alignSelf: "center" }}
              >
                <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: colors.primary }}>
                  Skip \u2014 I already have a vehicle on file
                </Text>
              </TouchableOpacity>
            )}
            {vehicleSkipped && (
              <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: textSecondary, marginTop: spacing.lg, textAlign: "center" }}>
                Skipped \u2014 your existing vehicle on file will be used.
              </Text>
            )}
          </View>
        )}

        {/* ── Step 3: Vehicle Documents ────────────────────────────────── */}
        {step === 3 && (
          <View>
            <Text style={secondaryLabelStyle}>Upload your vehicle documents. All are required.</Text>
            {VEHICLE_DOC_FIELDS.map((f) => (
              <DocumentUploadCard key={f.key} docType={f.key} label={f.label} onUploadComplete={(_path, url) => setVehicleDocs((prev) => ({ ...prev, [f.key]: url }))} />
            ))}
          </View>
        )}

        {/* ── Step 4: Driver Documents ─────────────────────────────────── */}
        {step === 4 && (
          <View>
            <Text style={secondaryLabelStyle}>Upload your personal documents. All are required.</Text>
            {DRIVER_DOC_FIELDS.map((f) => (
              <DocumentUploadCard key={f.key} docType={f.key} label={f.label} onUploadComplete={(_path, url) => setDriverDocs((prev) => ({ ...prev, [f.key]: url }))} />
            ))}
          </View>
        )}

        {/* ── Step 5: Rideshare Experience ─────────────────────────────── */}
        {step === 5 && (
          <View>
            <Text style={{ ...labelStyle, fontSize: 16 }}>Have you driven with Uber, Pathao, Obhai or Indrive?</Text>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              {(["yes", "no"] as const).map((ans) => {
                const selected = legacyAnswer === ans;
                return (
                  <TouchableOpacity key={ans} accessibilityRole="button" accessibilityLabel={ans === "yes" ? "Yes" : "No"} onPress={() => setLegacyAnswer(ans)} style={{ flex: 1, paddingVertical: spacing.md, borderRadius: radii.md, borderWidth: 1.5, borderColor: selected ? colors.primary : borderColor, backgroundColor: selected ? colors.primary + "1A" : "transparent", alignItems: "center" }}>
                    <Text style={{ fontFamily: selected ? "Jakarta-SemiBold" : "Jakarta-Regular", fontSize: 15, color: selected ? colors.primary : textPrimary }}>{ans === "yes" ? "Yes" : "No"}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {legacyAnswer === "yes" && (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={secondaryLabelStyle}>Optional \u2014 helps us verify your experience. None of these are required.</Text>
                {LEGACY_DOC_FIELDS.map((f) => (
                  <DocumentUploadCard key={f.key} docType={f.key} label={f.label} onUploadComplete={(_path, url) => setLegacyDocs((prev) => ({ ...prev, [f.key]: url }))} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Step 6: Payout ───────────────────────────────────────────── */}
        {step === 6 && (
          <View>
            <Text style={{ ...labelStyle, fontSize: 16 }}>bKash account number</Text>
            <TextInput
              accessibilityLabel="bKash account number"
              style={{ ...inputStyle, borderColor: bkashTouched && !bkashValid ? colors.danger : borderColor }}
              placeholder="01XXXXXXXXX"
              placeholderTextColor={textSecondary}
              keyboardType="phone-pad"
              maxLength={11}
              value={bkash}
              onChangeText={(t) => { setBkash(t.replace(/[^0-9]/g, "")); setBkashTouched(true); }}
            />
            {bkashTouched && !bkashValid && (
              <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: colors.danger, marginTop: spacing.xs }}>
                Enter a valid bKash number (11 digits starting with 01)
              </Text>
            )}
            <Text style={{ ...secondaryLabelStyle, marginTop: spacing.md }}>Your ride earnings are paid out to this bKash account.</Text>
          </View>
        )}

        {/* ── Step 7: Review & Consent ─────────────────────────────────── */}
        {step === 7 && (
          <View>
            <Text style={{ ...labelStyle, fontSize: 16 }}>Review</Text>
            {checklistRows.map((row) => (
              <View key={row.label} style={{ flexDirection: "row", alignItems: "center", backgroundColor: surfaceBg, borderWidth: 1, borderColor, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm }}>
                <Ionicons name={row.done ? "checkmark-circle" : "ellipse-outline"} size={22} color={row.done ? colors.success : colors.gray600} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: textPrimary }}>{row.label}</Text>
                  <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: textSecondary, marginTop: 2 }} numberOfLines={1}>{row.detail}</Text>
                </View>
              </View>
            ))}

            <Text style={{ ...labelStyle, fontSize: 16, marginTop: spacing.lg }}>Consent</Text>
            {CONSENT_ITEMS.map((item, i) => (
              <TouchableOpacity
                key={i}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consent[i] }}
                accessibilityLabel={item}
                onPress={() => setConsent((prev) => { const next = [...prev]; next[i] = !next[i]; return next; })}
                style={{ flexDirection: "row", alignItems: "flex-start", backgroundColor: surfaceBg, borderWidth: 1, borderColor, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm }}
              >
                <Ionicons name={consent[i] ? "checkbox" : "square-outline"} size={20} color={consent[i] ? colors.primary : textSecondary} />
                <Text style={{ flex: 1, fontFamily: "Jakarta-Regular", fontSize: 13, color: textPrimary, marginLeft: spacing.md, lineHeight: 19 }}>{item}</Text>
              </TouchableOpacity>
            ))}
            <Text style={{ ...secondaryLabelStyle, marginTop: spacing.md }}>
              After submission, an admin reviews your documents and activates your account manually \u2014 usually 1\u20132 business days.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Footer navigation */}
      <View style={{ flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderTopWidth: 1, borderTopColor: borderColor, backgroundColor: bg }}>
        {step > 1 && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous step" onPress={goBack} style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.pill, borderWidth: 1.5, borderColor, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 15, color: textSecondary }}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={step === 7 ? "Submit onboarding" : "Continue to next step"}
          onPress={goNext}
          disabled={!canContinue(step) || stepSubmitting || finishing}
          style={{ flex: 1, paddingVertical: spacing.md, borderRadius: radii.pill, backgroundColor: canContinue(step) && !stepSubmitting && !finishing ? colors.primary : isDark ? colors.textDisabledDark : colors.textDisabledLight, alignItems: "center", justifyContent: "center", minHeight: 56 }}
        >
          {stepSubmitting || finishing ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 15, color: colors.white }}>{step === 7 ? "Submit" : "Continue"}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* §12.2: Body type picker modal */}
      <BodyTypePickerModal
        visible={bodyTypeModalVisible}
        selectedValue={bodyType}
        onSelect={selectBodyType}
        onClose={() => setBodyTypeModalVisible(false)}
      />

      {/* Existing pickers */}
      <OptionPickerModal
        visible={pickerModal === "brand"}
        title="Select brand"
        selectedValue={brand}
        options={[...brands.map((b) => ({ value: b, label: b })), { value: OTHERS, label: "Others" }]}
        onSelect={(v) => { setBrand(v); setModel(null); setModelText(""); }}
        onClose={() => setPickerModal(null)}
      />
      <OptionPickerModal
        visible={pickerModal === "model"}
        title="Select model"
        selectedValue={model}
        options={[...modelOptions.map((m) => ({ value: m, label: m })), { value: OTHERS, label: "Others" }]}
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

      {/* §12.3: Classification outcome modals */}
      {classificationResult && (
        <ClassificationModal
          result={classificationResult}
          brand={resolvedBrand ?? ""}
          model={resolvedModel ?? ""}
          onDismiss={dismissClassification}
          onRetry={retryClassification}
        />
      )}
      <ClassificationErrorModal
        visible={classError}
        onRetry={retryClassification}
        onBack={() => { setClassError(false); }}
      />
      <ManualReviewRequiredModal
        visible={manualReviewRequired}
        onDismiss={() => { setManualReviewRequired(false); /* stay on vehicle step — form preserved */ }}
      />

      {/* Retry-in-progress overlay — form state is preserved */}
      {retrying && (
        <Modal visible transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" }}>
            <View style={{ width: 260, backgroundColor: surfaceBg, borderRadius: 16, padding: 28, alignItems: "center" }}>
              <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: spacing.md }} />
              <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 16, color: textPrimary, textAlign: "center" }}>
                Retrying… ({retryAttempt}/{MAX_RETRIES})
              </Text>
              <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: textSecondary, textAlign: "center", marginTop: spacing.xs }}>
                Please wait
              </Text>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}
