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
import { useIsDark } from "@/lib/useAppearance";
import { VEHICLE_TYPES, type VehicleTypeEnum } from "@/lib/vehicleTypes";

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
const YEARS: number[] = Array.from(
  { length: CURRENT_YEAR - 1980 + 1 },
  (_, i) => CURRENT_YEAR - i,
);

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

export default function AddVehicle() {
  const isDark = useIsDark();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const [vehicleType, setVehicleType] = useState<VehicleTypeEnum | null>(null);
  const [models, setModels] = useState<VehicleModelRow[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [brand, setBrand] = useState<string | null>(null);
  const [brandText, setBrandText] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [modelText, setModelText] = useState("");
  const [regYear, setRegYear] = useState<number | null>(null);
  const [plate, setPlate] = useState("");
  const [seats, setSeats] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pickerModal, setPickerModal] = useState<"brand" | "model" | "year" | null>(
    null,
  );

  useEffect(() => {
    if (!vehicleType) return;
    let cancelled = false;
    setModelsLoading(true);
    (async () => {
      try {
        const res = await apiFetch(
          `/api/driver/vehicle-models?vehicle_type=${encodeURIComponent(vehicleType)}`,
        );
        const data = await res.json();
        if (!cancelled) setModels(data.models ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? `${err.code}: ${err.message}`
              : "Failed to load vehicle models",
          );
        }
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vehicleType]);

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

  const formValid =
    vehicleType != null &&
    !!resolvedBrand &&
    resolvedBrand.length > 0 &&
    !!resolvedModel &&
    resolvedModel.length > 0 &&
    regYear != null &&
    plate.trim().length > 0;

  const selectVehicleType = (vt: VehicleTypeEnum) => {
    setVehicleType(vt);
    setBrand(null);
    setBrandText("");
    setModel(null);
    setModelText("");
  };

  const handleSave = async () => {
    if (!formValid || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/api/driver/vehicles", {
        method: "POST",
        body: JSON.stringify({
          brand: resolvedBrand,
          model: resolvedModel,
          registration_year: regYear,
          vehicle_type: vehicleType,
          registration_plate: plate.trim(),
          number_of_seats: seats ? parseInt(seats, 10) : undefined,
        }),
      });
      const data = await res.json();
      Alert.alert(
        data.model_created ? "Added — Pending Model Review" : "Added",
        data.model_created
          ? "Vehicle registered successfully. The new brand/model you entered was submitted for admin review before other drivers can see it."
          : "Vehicle registered successfully.",
        [
          {
            text: "OK",
            onPress: () =>
              router.replace("/(main)/(rider)/vehicle-management"),
          },
        ],
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.code}: ${err.message}`
          : "Failed to add vehicle",
      );
      logger.error("[add-vehicle] save failed", { error: String(err) });
    } finally {
      setSaving(false);
    }
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
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
          onPress={() => router.back()}
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
          Add Vehicle
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: spacing["4xl"],
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={labelStyle}>Vehicle type</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {VEHICLE_TYPES.map((vt) => {
            const selected = vehicleType === vt.key;
            return (
              <TouchableOpacity
                key={vt.key}
                accessibilityRole="button"
                accessibilityLabel={vt.display_en}
                onPress={() => selectVehicleType(vt.key)}
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

            <Text style={{ ...labelStyle, marginTop: spacing.lg }}>
              Number of Seats (optional)
            </Text>
            <TextInput
              accessibilityLabel="Number of seats"
              style={inputStyle}
              placeholder="e.g. 4"
              placeholderTextColor={textSecondary}
              keyboardType="numeric"
              value={seats}
              onChangeText={(t) => setSeats(t.replace(/[^0-9]/g, ""))}
            />
          </View>
        )}

        {error.length > 0 && (
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 14,
              color: colors.danger,
              marginTop: spacing.lg,
            }}
          >
            {error}
          </Text>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Save vehicle"
          onPress={() => void handleSave()}
          disabled={!formValid || saving}
          style={{
            marginTop: spacing.xl,
            paddingVertical: spacing.md,
            borderRadius: radii.pill,
            backgroundColor:
              formValid && !saving
                ? colors.primary
                : isDark
                  ? colors.textDisabledDark
                  : colors.textDisabledLight,
            alignItems: "center",
          }}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 15,
                color: colors.white,
              }}
            >
              Save Vehicle
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

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
