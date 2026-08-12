import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useAppearance } from "@/lib/useAppearance";
import { useCustomer } from "@/store";

interface ServiceItem {
  key: string;
  label: string;
  subtitle: string;
  icon: any;
  color: string;
}

const SERVICES: ServiceItem[] = [
  {
    key: "bike",
    label: "Bike",
    subtitle: "Fast & affordable",
    icon: "bicycle",
    color: "#0CC25F",
  },
  {
    key: "cng",
    label: "CNG",
    subtitle: "Auto-rickshaw",
    icon: "car-sport",
    color: "#0286FF",
  },
  {
    key: "car",
    label: "Car",
    subtitle: "Comfortable ride",
    icon: "car",
    color: "#F59E0B",
  },
  {
    key: "large_car",
    label: "Large Cars",
    subtitle: "Groups & luggage",
    icon: "bus",
    color: "#6366F1",
  },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 17) return "Good Afternoon";
  if (hour >= 17 && hour < 21) return "Good Evening";
  return "Good Night";
}

export default function ServicesHub() {
  const { theme } = useAppearance();
  const { userAddress } = useCustomer();
  const [greeting, setGreeting] = useState("Good Morning");

  const isDark = theme === "dark" || theme === "system";
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;

  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  const handleSelect = (serviceKey: string) => {
    router.push({
      pathname: "/(main)/(customer)/(tabs)/home",
      params: { service: serviceKey },
    });
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      {/* Header */}
      <View className="px-6 pt-4 pb-2">
        <Text
          className="text-[28px] font-JakartaBold"
          style={{ color: textPrimary }}
        >
          {greeting}
        </Text>
        <View className="flex-row items-center mt-1">
          <Ionicons name="location" size={16} color={colors.primary} />
          <Text
            className="text-sm font-Jakarta ml-1"
            style={{ color: textSecondary }}
          >
            {userAddress || "📍 Current Location"}
          </Text>
        </View>
      </View>

      {/* Services Grid */}
      <ScrollView className="flex-1 px-6 pt-6">
        <Text
          className="text-lg font-JakartaSemiBold mb-4"
          style={{ color: textPrimary }}
        >
          What service do you need?
        </Text>

        <View className="flex-row flex-wrap gap-3">
          {SERVICES.map((service) => (
            <TouchableOpacity
              key={service.key}
              className="rounded-2xl p-5 items-center"
              style={{
                width: "48%",
                backgroundColor: surfaceBg,
              }}
              onPress={() => handleSelect(service.key)}
              activeOpacity={0.8}
            >
              <View
                className="w-14 h-14 rounded-full items-center justify-center mb-3"
                style={{ backgroundColor: service.color + "18" }}
              >
                <Ionicons
                  name={service.icon}
                  size={28}
                  color={service.color}
                />
              </View>
              <Text
                className="text-base font-JakartaBold"
                style={{ color: textPrimary }}
              >
                {service.label}
              </Text>
              <Text
                className="text-xs font-Jakarta mt-1 text-center"
                style={{ color: textSecondary }}
              >
                {service.subtitle}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Spacer for future services */}
        <View className="h-20" />
      </ScrollView>
    </SafeAreaView>
  );
}
