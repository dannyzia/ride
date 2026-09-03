import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";
import {
  BODY_TYPE_GROUPS,
  BODY_TYPE_DISPLAY,
  type VehicleTypeEnum,
  type BodyTypeEnum,
  getVehicleType,
} from "@/lib/vehicleTypes";



class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
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
      typeof data.message === "string" ? data.message : `Request failed (${res.status})`,
    );
  }
  return res;
}

// ── Retry-with-backoff helpers ──────────────────────────────────────────────
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

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

interface VehicleModelRow {
  id: string;
  brand: string;
  model: string;
  year_start: number | null;
  year_end: number | null;
  default_vehicle_type: string | null;
}

const OTHERS = "__others__";
const CURRENT_YEAR = new Date().getFullYear();
const YEARS: number[] = Array.from({ length: CURRENT_YEAR - 1980 + 1 }, (_, i) => CURRENT_YEAR - i);

interface PickerOption { value: string; label: string; }

function OptionPickerModal({ visible, title, options, selectedValue, onSelect, onClose }: {
  visible: boolean; title: string; options: PickerOption[];
  selectedValue: string | null; onSelect: (value: string) => void; onClose: () => void;
}) {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close picker" style={{ flex: 1 }} onPress={onClose} />
        <View style={{ maxHeight: "60%", backgroundColor: surfaceBg, borderTopLeftRadius: radii["2xl"], borderTopRightRadius: radii["2xl"], padding: spacing.lg, paddingBottom: spacing["2xl"] }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
            <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 17, color: textPrimary }}>{title}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close picker" onPress={onClose}>
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
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radii.md, backgroundColor: selected ? colors.primary + "1A" : "transparent" }}
                  onPress={() => { onSelect(item.value); onClose(); }}
                >
                  <Text style={{ fontFamily: selected ? "Jakarta-SemiBold" : "Jakarta-Regular", fontSize: 15, color: selected ? colors.primary : textPrimary }}>{item.label}</Text>
                  {selected && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: borderColor }} />}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── §12.2: Body type picker modal ───────────────────────────────────────
function BodyTypePickerModal({ visible, selectedValue, onSelect, onClose }: {
  visible: boolean; selectedValue: BodyTypeEnum | null;
  onSelect: (value: BodyTypeEnum) => void; onClose: () => void;
}) {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
        <TouchableOpacity style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} />
        <View style={{ maxHeight: "70%", backgroundColor: surfaceBg, borderTopLeftRadius: radii["2xl"], borderTopRightRadius: radii["2xl"], padding: spacing.lg, paddingBottom: spacing["2xl"] }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
            <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 17, color: textPrimary }}>Select Body Type</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={onClose}>
              <Ionicons name="close" size={22} color={textSecondary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={BODY_TYPE_GROUPS}
            keyExtractor={(g) => g.group}
            renderItem={({ item: group }) => (
              <View style={{ marginBottom: spacing.sm }}>
                <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 13, color: textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs, marginLeft: spacing.xs }}>{group.group}</Text>
                {group.items.map((item) => {
                  const selected = item.value === selectedValue;
                  return (
                    <TouchableOpacity key={item.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`${item.en} \u2014 ${item.bn}`}
                      onPress={() => { onSelect(item.value); onClose(); }}
                      style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radii.md, backgroundColor: selected ? colors.primary + "1A" : "transparent" }}
                    >
                      <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={22} color={selected ? colors.primary : textSecondary} />
                      <View style={{ marginLeft: spacing.md, flex: 1 }}>
                        <Text style={{ fontFamily: selected ? "Jakarta-SemiBold" : "Jakarta-Regular", fontSize: 15, color: selected ? colors.primary : textPrimary }}>{item.en}</Text>
                        <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary }}>{item.bn}</Text>
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
function ClassificationModal({ result, brand, model, onNavigate }: {
  result: { outcome: "classified"; suggested_vehicle_type: string } | { outcome: "manual_review" };
  brand: string; model: string; onNavigate: () => void;
}) {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const isClassified = result.outcome === "classified";
  const typeName = isClassified ? getVehicleType(result.suggested_vehicle_type as VehicleTypeEnum).display_en : null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
        <View style={{ width: "90%", maxWidth: 400, backgroundColor: surfaceBg, borderRadius: 16, padding: 24, alignItems: "center" }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: isClassified ? colors.primary + "1A" : colors.info + "1A", alignItems: "center", justifyContent: "center", marginBottom: spacing.lg }}>
            <Ionicons name={isClassified ? "checkmark" : "time"} size={40} color={isClassified ? colors.primary : colors.info} />
          </View>
          <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 20, color: textPrimary, textAlign: "center" }}>
            {isClassified ? "Vehicle Classified" : "Submitted for Review"}
          </Text>
          <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 14, color: textSecondary, textAlign: "center", marginTop: spacing.sm, lineHeight: 20 }}>
            {isClassified ? `Your ${brand} ${model} has been classified as` : "Your vehicle details have been submitted successfully."}
          </Text>
          {isClassified && typeName && (
            <View style={{ marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.primary + "1A" }}>
              <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 16, color: colors.primary }}>{typeName}</Text>
            </View>
          )}
          <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: textSecondary, textAlign: "center", marginTop: spacing.md, lineHeight: 18 }}>
            {isClassified ? "An admin may review and adjust this during document verification." : "Our team will review it and update you soon."}
            {!isClassified && (
              <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary, textAlign: "center", marginTop: 2 }}>
                {"আমাদের টিম শীঘ্রই এটি পর্যালোচনা করে আপনাকে জানাবে।"}
              </Text>
            )}
          </Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Continue" onPress={onNavigate}
            style={{ marginTop: spacing.xl, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.pill, backgroundColor: colors.primary, minHeight: 56, justifyContent: "center", alignItems: "center", width: "100%" }}>
            <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 15, color: colors.white }}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// R1: Manual review required — submission failed, vehicle needs human review
function ManualReviewRequiredModal({ visible, onDismiss }: {
  visible: boolean; onDismiss: () => void;
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
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="OK" onPress={onDismiss}
            style={{ marginTop: spacing.xl, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.pill, backgroundColor: colors.primary, minHeight: 56, justifyContent: "center", alignItems: "center", width: "100%" }}>
            <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 15, color: colors.white }}>{"OK"} / {"ঠিক আছে"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ClassificationErrorModal({ visible, onRetry, onBack }: {
  visible: boolean; onRetry: () => void; onBack: () => void;
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

export default function AddVehicle() {
  const { t } = useTranslation();  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  // §12.2: body_type + engine_cc replace vehicle_type selector
  const [bodyType, setBodyType] = useState<BodyTypeEnum | null>(null);
  const [engineCc, setEngineCc] = useState("");
  const [seats, setSeats] = useState("");
  const [bodyTypeModalVisible, setBodyTypeModalVisible] = useState(false);
  const [classificationResult, setClassificationResult] = useState<
    { outcome: "classified"; suggested_vehicle_type: string } | { outcome: "manual_review" } | null
  >(null);
  const [classError, setClassError] = useState(false);
  const [manualReviewRequired, setManualReviewRequired] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [models, setModels] = useState<VehicleModelRow[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [brand, setBrand] = useState<string | null>(null);
  const [brandText, setBrandText] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [modelText, setModelText] = useState("");
  const [regYear, setRegYear] = useState<number | null>(null);
  const [plate, setPlate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pickerModal, setPickerModal] = useState<"brand" | "model" | "year" | null>(null);

  const resolvedBrand = brand === OTHERS ? brandText.trim() : brand;
  const resolvedModel = model === OTHERS ? modelText.trim() : model;

  const brands = useMemo(() => Array.from(new Set(models.map((m) => m.brand))).sort(), [models]);
  const modelOptions = useMemo(() => {
    if (!brand || brand === OTHERS) return [];
    return Array.from(new Set(models.filter((m) => m.brand === brand).map((m) => m.model))).sort();
  }, [models, brand]);

  // Load all vehicle models (no type filter — server classifies)
  const loadVehicleModels = async () => {
    setModelsLoading(true);
    try {
      const res = await apiFetch("/api/driver/vehicle-models");
      const data = await res.json();
      setModels(data.models ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : "Failed to load vehicle models");
    } finally {
      setModelsLoading(false);
    }
  };

  const selectBodyType = (bt: BodyTypeEnum) => {
    setBodyType(bt);
    setBodyTypeModalVisible(false);
    if (models.length === 0) void loadVehicleModels();
  };

  // §12.2: validation — body_type + engine_cc required
  const parsedSeats = seats.length > 0 ? parseInt(seats, 10) : 0;
  const seatsValid = parsedSeats >= 1 && parsedSeats <= 20;
  const formValid =
    bodyType != null &&
    engineCc.length > 0 && parseInt(engineCc, 10) > 0 &&
    seatsValid &&
    !!resolvedBrand && resolvedBrand.length > 0 &&
    !!resolvedModel && resolvedModel.length > 0 &&
    regYear != null &&
    plate.trim().length > 0;

  const handleSave = async (attempt = 0) => {
    if (!formValid || saving) return;
    setSaving(true);
    if (attempt === 0) {
      setError("");
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
      setRetrying(false);
      setRetryAttempt(0);
      if (data.classification) {
        setClassificationResult(data.classification);
      } else {
        Alert.alert(
          data.model_created ? "Added \u2014 Pending Model Review" : "Added",
          data.model_created
            ? "Vehicle registered successfully. The new brand/model you entered was submitted for admin review before other drivers can see it."
            : "Vehicle registered successfully.",
          [{ text: "OK", onPress: () => router.replace("/(main)/(rider)/vehicle-management") }],
        );
      }
    } catch (err) {
      setClassificationResult(null);
      // R1: branch on manual_review_required — distinct modal, never retry
      if (err instanceof ApiError && err.code === "manual_review_required") {
        setRetrying(false);
        setRetryAttempt(0);
        setManualReviewRequired(true);
        setError("");
        logger.error("[add-vehicle] save failed", { error: String(err) });
        return;
      }
      // Retry with exponential backoff if error is retryable and attempts remain
      if (isRetryableError(err) && attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS_MS[attempt];
        setRetryAttempt(attempt + 1);
        setRetrying(true);
        logger.info("[add-vehicle] retrying save", { attempt: attempt + 1, delayMs: delay });
        await sleep(delay);
        setRetrying(false);
        await handleSave(attempt + 1);
        return;
      }
      // All retries exhausted or non-retryable error
      setRetrying(false);
      setRetryAttempt(0);
      setClassError(true);
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : "Failed to add vehicle");
      logger.error("[add-vehicle] save failed", { error: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { borderWidth: 1, borderColor, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontFamily: "Jakarta-Regular", fontSize: 15, color: textPrimary };
  const labelStyle = { fontFamily: "Jakarta-SemiBold", fontSize: 14, color: textPrimary, marginBottom: spacing.sm };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: borderColor }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: spacing.xs }}>
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontFamily: "Jakarta-Bold", fontSize: 17, color: textPrimary }}>Add Vehicle</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing["4xl"] }} keyboardShouldPersistTaps="handled">
        {/* 1. Body Type (§12.2: first field) */}
        <Text style={{ ...labelStyle, fontSize: 16 }}>Body Type</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Select body type"
          style={{ ...inputStyle, flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56 }}
          onPress={() => setBodyTypeModalVisible(true)}>
          <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 15, color: bodyType ? textPrimary : textSecondary }}>
            {bodyType ? BODY_TYPE_DISPLAY[bodyType].en : "Select body type"}
          </Text>
          <Ionicons name="chevron-down" size={18} color={textSecondary} />
        </TouchableOpacity>

        {/* 2–4: Brand → Model → Year */}
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

        {modelsLoading && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: spacing.md }} />}

        {/* 5. Engine CC (§12.2) */}
        {bodyType != null && !modelsLoading && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={labelStyle}>Engine CC (BRTA Recorded)</Text>
            <TextInput accessibilityLabel="Engine CC" style={{ ...inputStyle, minHeight: 56 }}
              placeholder="e.g., 996" placeholderTextColor={textSecondary}
              keyboardType="numeric" maxLength={5}
              value={engineCc} onChangeText={(t) => setEngineCc(t.replace(/[^0-9]/g, ""))} />
            <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary, marginTop: spacing.xs }}>
              From your BRTA registration document
            </Text>
          </View>
        )}

        {/* 6. Registered Seats (H1: restored per §10.1) */}
        {bodyType != null && !modelsLoading && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={labelStyle}>Registered Seats</Text>
            <TextInput accessibilityLabel="Number of seats" style={{ ...inputStyle, minHeight: 56, borderColor: seats.length > 0 && !seatsValid ? colors.danger : borderColor }}
              placeholder="e.g., 4" placeholderTextColor={textSecondary}
              keyboardType="numeric" maxLength={2}
              value={seats} onChangeText={(t) => setSeats(t.replace(/[^0-9]/g, ""))} />
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
            <Text style={labelStyle}>Registration Plate</Text>
            <TextInput accessibilityLabel="Registration plate number" style={inputStyle}
              placeholder="e.g. DHAKA-METRO-KA-1234" placeholderTextColor={textSecondary}
              autoCapitalize="characters" value={plate} onChangeText={setPlate} />
          </View>
        )}

        {/* 8. Auto-classification info card (§12.2) */}
        {bodyType != null && (
          <View style={{ marginTop: spacing.xl, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.info + "40", backgroundColor: colors.info + "0D", flexDirection: "row", gap: spacing.md }}>
            <Ionicons name="information-circle" size={22} color={colors.info} />
            <Text style={{ flex: 1, fontFamily: "Jakarta-Regular", fontSize: 13, color: textSecondary, lineHeight: 18 }}>
              {"We'll classify your vehicle automatically based on engine size, body type, and seats."}
              {"\n"}{"ইঞ্জিনের আয়তন, বডি টাইপ এবং আসন সংখ্যার ভিত্তিতে আমরা স্বয়ংক্রিয়ভাবে শ্রেণীবদ্ধ করব।"}
            </Text>
          </View>
        )}

        {error.length > 0 && (
          <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 14, color: colors.danger, marginTop: spacing.lg }}>{error}</Text>
        )}

        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Save vehicle"
          onPress={() => void handleSave()} disabled={!formValid || saving}
          style={{ marginTop: spacing.xl, paddingVertical: spacing.md, borderRadius: radii.pill, backgroundColor: formValid && !saving ? colors.primary : isDark ? colors.textDisabledDark : colors.textDisabledLight, alignItems: "center", minHeight: 56, justifyContent: "center" }}>
          {saving ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 15, color: colors.white }}>Save Vehicle</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* §12.2: Body type picker */}
      <BodyTypePickerModal visible={bodyTypeModalVisible} selectedValue={bodyType} onSelect={selectBodyType} onClose={() => setBodyTypeModalVisible(false)} />

      {/* Existing pickers */}
      <OptionPickerModal visible={pickerModal === "brand"} title="Select brand" selectedValue={brand}
        options={[...brands.map((b) => ({ value: b, label: b })), { value: OTHERS, label: "Others" }]}
        onSelect={(v) => { setBrand(v); setModel(null); setModelText(""); }} onClose={() => setPickerModal(null)} />
      <OptionPickerModal visible={pickerModal === "model"} title="Select model" selectedValue={model}
        options={[...modelOptions.map((m) => ({ value: m, label: m })), { value: OTHERS, label: "Others" }]}
        onSelect={(v) => setModel(v)} onClose={() => setPickerModal(null)} />
      <OptionPickerModal visible={pickerModal === "year"} title="BRTA Registration Year"
        selectedValue={regYear != null ? String(regYear) : null}
        options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
        onSelect={(v) => setRegYear(parseInt(v, 10))} onClose={() => setPickerModal(null)} />

      {/* §12.3: Classification outcome modals */}
      {classificationResult && (
        <ClassificationModal
          result={classificationResult}
          brand={resolvedBrand ?? ""}
          model={resolvedModel ?? ""}
          onNavigate={() => { setClassificationResult(null); router.replace("/(main)/(rider)/vehicle-management"); }}
        />
      )}
      <ClassificationErrorModal visible={classError} onRetry={() => { setClassError(false); void handleSave(0); }} onBack={() => setClassError(false)} />
      <ManualReviewRequiredModal visible={manualReviewRequired} onDismiss={() => { setManualReviewRequired(false); router.replace("/(main)/(rider)/vehicle-management"); }} />

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

      {/* Dark mode toggle */}
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
