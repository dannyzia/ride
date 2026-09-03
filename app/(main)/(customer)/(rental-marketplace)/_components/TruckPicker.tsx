/**
 * Bangladesh-tradition truck picker — use-case tabs (Pickup / Freight /
 * Heavy Goods / Trailer / Van) with dimension × tonnage × open/covered
 * variant rows, mirroring the approved reference UX (briefing V1/V2/V3).
 * Display-only: every row maps onto a rental_vehicle_type enum value.
 */
import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { TRUCK_TABS, type TruckVariant } from "../_truckCatalog";

interface TruckPickerProps {
  selectedKey: string | null;
  onSelect: (variant: TruckVariant) => void;
}

export default function TruckPicker({ selectedKey, onSelect }: TruckPickerProps) {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const initialTabId =
    TRUCK_TABS.find((t) => t.variants.some((v) => v.key === selectedKey))?.id ??
    TRUCK_TABS[0].id;
  const [activeTabId, setActiveTabId] = useState<string>(initialTabId);
  const activeTab = TRUCK_TABS.find((t) => t.id === activeTabId) ?? TRUCK_TABS[0];

  return (
    <View>
      {/* Use-case tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel="Truck categories"
      >
        {TRUCK_TABS.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTabId(tab.id)}
              accessibilityRole="tab"
              accessibilityLabel={`${tab.labelEn} (${tab.labelBn})`}
              accessibilityState={{ selected: active }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                marginRight: 8,
                borderBottomWidth: 2,
                borderBottomColor: active ? colors.primary : "transparent",
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: active ? "JakartaSemiBold" : "JakartaMedium",
                  color: active ? colors.primary : textSecondary,
                }}
              >
                {tab.labelEn}{" "}
                <Text style={{ fontSize: 12, opacity: 0.7 }}>{tab.labelBn}</Text>
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Variant rows */}
      {activeTab.variants.map((variant) => {
        const selected = variant.key === selectedKey;
        return (
          <TouchableOpacity
            key={variant.key}
            onPress={() => onSelect(variant)}
            accessibilityRole="button"
            accessibilityLabel={`${variant.titleEn}, ${variant.cargoHint}`}
            accessibilityState={{ selected }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 14,
              marginBottom: 10,
              backgroundColor: surfaceBg,
              borderWidth: 2,
              borderColor: selected ? colors.primary : borderColor,
              borderRadius: 14,
            }}
          >
            {/* Tonnage badge */}
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: (selected ? colors.primary : textSecondary) + "1A",
                marginRight: 12,
              }}
            >
              <Ionicons
                name={variant.vehicleType === "trailer" ? "git-branch-outline" : "cube-outline"}
                size={22}
                color={selected ? colors.primary : textSecondary}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: "JakartaSemiBold",
                  color: selected ? colors.primary : textPrimary,
                }}
              >
                {variant.titleEn}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: "Jakarta",
                  color: textSecondary,
                  marginTop: 2,
                }}
              >
                {variant.titleBn} · {variant.cargoHint}
              </Text>
            </View>

            <Ionicons
              name={selected ? "checkmark-circle" : "ellipse-outline"}
              size={22}
              color={selected ? colors.primary : textSecondary}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
