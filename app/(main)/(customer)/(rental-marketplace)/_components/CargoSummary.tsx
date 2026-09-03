/**
 * Reusable cargo summary card (Phase 5) — renders cargo tags, weight/volume,
 * description, rental option chips and the requested-vehicle badge whenever
 * cargo data is present. Returns null when there is nothing to show.
 * Hosted on the customer bid feed today; ready for history/detail screens
 * when those lanes land (briefing A7 / ruling V4).
 */
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { describeVehicleType } from "../_truckCatalog";

interface CargoSummaryProps {
  cargoTags?: string[] | null;
  cargoWeightKg?: number | null;
  cargoVolumeM3?: string | number | null;
  cargoDescription?: string | null;
  rentalOptionsCsv?: string | null;
  requestedVehicleType?: string | null;
}

export default function CargoSummary({
  cargoTags,
  cargoWeightKg,
  cargoVolumeM3,
  cargoDescription,
  rentalOptionsCsv,
  requestedVehicleType,
}: CargoSummaryProps) {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const tags = (cargoTags ?? []).filter(Boolean);
  const optionChips = (rentalOptionsCsv ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const weight = typeof cargoWeightKg === "number" && cargoWeightKg > 0 ? cargoWeightKg : null;
  const volumeRaw =
    cargoVolumeM3 == null ? null : typeof cargoVolumeM3 === "number" ? cargoVolumeM3 : parseFloat(cargoVolumeM3);
  const volume = volumeRaw != null && Number.isFinite(volumeRaw) && volumeRaw > 0 ? volumeRaw : null;

  if (tags.length === 0 && optionChips.length === 0 && !weight && !volume && !cargoDescription) {
    return null;
  }

  const measureParts: string[] = [];
  if (weight != null) measureParts.push(`≈ ${weight.toLocaleString()} kg`);
  if (volume != null) measureParts.push(`≈ ${volume} m³`);

  return (
    <View
      style={{
        backgroundColor: surfaceBg,
        borderWidth: 1,
        borderColor,
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
      }}
      accessibilityLabel="Cargo summary"
    >
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <Ionicons name="cube-outline" size={16} color={colors.primary} />
        <Text
          style={{
            fontSize: 14,
            fontFamily: "JakartaSemiBold",
            color: textPrimary,
            marginLeft: 6,
            flex: 1,
          }}
        >
          Cargo
        </Text>
        {requestedVehicleType ? (
          <View
            style={{
              backgroundColor: colors.primary + "1A",
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
            accessibilityLabel={`Requested vehicle: ${describeVehicleType(requestedVehicleType)}`}
          >
            <Text style={{ fontSize: 11, fontFamily: "JakartaSemiBold", color: colors.primary }}>
              {describeVehicleType(requestedVehicleType)}
            </Text>
          </View>
        ) : null}
      </View>

      {tags.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: optionChips.length > 0 ? 6 : 0 }}>
          {tags.map((tag) => (
            <View
              key={tag}
              style={{
                backgroundColor: textSecondary + "1A",
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 3,
                marginRight: 6,
                marginBottom: 6,
              }}
            >
              <Text style={{ fontSize: 11, fontFamily: "JakartaMedium", color: textPrimary }}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {optionChips.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {optionChips.map((opt) => (
            <View
              key={opt}
              style={{
                backgroundColor: colors.amber + "1A",
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 3,
                marginRight: 6,
                marginBottom: 6,
              }}
            >
              <Text style={{ fontSize: 11, fontFamily: "JakartaMedium", color: textPrimary }}>{opt}</Text>
            </View>
          ))}
        </View>
      )}

      {measureParts.length > 0 && (
        <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 4 }}>
          {measureParts.join("  ·  ")}
        </Text>
      )}

      {cargoDescription ? (
        <Text
          style={{
            fontSize: 13,
            fontFamily: "Jakarta",
            color: textPrimary,
            marginTop: 6,
          }}
        >
          {cargoDescription}
        </Text>
      ) : null}
    </View>
  );
}
