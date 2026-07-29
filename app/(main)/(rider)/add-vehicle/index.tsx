import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";

export default function AddVehicle() {
  const [vehicleModel, setVehicleModel] = useState("");
  const [registrationPlate, setRegistrationPlate] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [numberOfSeats, setNumberOfSeats] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showTypePicker, setShowTypePicker] = useState(false);

  const formatLabel = (key: string) =>
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const handleSave = async () => {
    if (!vehicleModel.trim()) { setError("Vehicle model is required"); return; }
    if (!registrationPlate.trim()) { setError("Registration number is required"); return; }
    if (!vehicleType) { setError("Select a vehicle type"); return; }
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/vehicles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          vehicle_model: vehicleModel.trim(),
          registration_plate: registrationPlate.trim().toUpperCase(),
          vehicle_type: vehicleType,
          number_of_seats: numberOfSeats ? parseInt(numberOfSeats, 10) : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to add vehicle");
        return;
      }
      Alert.alert("Added", "Vehicle registered successfully.", [
        { text: "OK", onPress: () => router.replace("/(main)/(rider)/vehicle-management") },
      ]);
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Add vehicle failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Add Vehicle</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24, gap: 16 }}>
        <View>
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Vehicle Model</Text>
          <TextInput
            className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark"
            placeholder="e.g. Toyota Axio 2019"
            placeholderTextColor="#9CA3AF"
            value={vehicleModel}
            onChangeText={setVehicleModel}
          />
        </View>
        <View>
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Registration Number</Text>
          <TextInput
            className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark"
            placeholder="e.g. DHAKA-METRO-KA-1234"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="characters"
            value={registrationPlate}
            onChangeText={setRegistrationPlate}
          />
        </View>
        <View>
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Vehicle Type</Text>
          <TouchableOpacity
            className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px]"
            onPress={() => setShowTypePicker(!showTypePicker)}
          >
            <Text className="text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">
              {vehicleType ? formatLabel(vehicleType) : "Select vehicle type..."}
            </Text>
          </TouchableOpacity>
          {showTypePicker && (
            <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] mt-2 overflow-hidden">
              {VEHICLE_TYPES.map((vt) => (
                <TouchableOpacity
                  key={vt.key}
                  className={`px-[16px] py-[12px] border-b border-goBorderLight dark:border-goBorderDark ${vehicleType === vt.key ? "bg-goAccentLight dark:bg-goPrimary/20" : ""}`}
                  onPress={() => { setVehicleType(vt.key); setShowTypePicker(false); }}
                >
                  <Text className={`text-[15px] font-Jakarta ${vehicleType === vt.key ? "text-goPrimary font-JakartaBold" : "text-goTextPrimaryLight dark:text-goTextPrimaryDark"}`}>
                    {vt.display_en}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        <View>
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Number of Seats (optional)</Text>
          <TextInput
            className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark"
            placeholder="e.g. 4"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            value={numberOfSeats}
            onChangeText={setNumberOfSeats}
          />
        </View>
        {error ? <Text className="text-[14px] font-Jakarta text-goDanger">{error}</Text> : null}
        <TouchableOpacity
          className={`rounded-full w-full py-[16px] items-center ${loading ? "bg-goBorderDark" : "bg-goPrimary"}`}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator size={20} color="#FFFFFF" /> : <Text className="text-[18px] font-JakartaBold text-goWhite">Save Vehicle</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}