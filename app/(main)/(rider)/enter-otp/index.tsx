import { colors, spacing } from "@/theme/goRide";
import { View, Text } from "react-native";
import React, { useEffect, useState } from "react";
import CustomButton from "@/components/CustomButton";
import { useRideOfferStore, useWSStore } from "@/store";
import { router } from "expo-router";
import { OtpInput } from "react-native-otp-entry";

const EnterOtp = () => {
  const [pinInput, setPinInput] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const { ws } = useWSStore();
  const { activeRideId } = useRideOfferStore();

  // The server is the source of truth for the Ride Pin (rides.start_pin).
  // We send what the driver typed and react to the server's verdict — the
  // driver app never holds the correct PIN itself.
  useEffect(() => {
    if (!ws) return;
    const onMessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data);
        if (!activeRideId || msg.ride_id !== activeRideId) return;
        if (msg.type === "ride:started") {
          setVerifying(false);
          router.replace("/(main)/(rider)/finish-ride");
        } else if (msg.type === "ride:start_failed") {
          setVerifying(false);
          setError("Incorrect Ride Pin. Ask your rider and try again.");
          setPinInput("");
        }
      } catch {
        // ignore non-JSON messages
      }
    };
    ws.addEventListener("message", onMessage);
    return () => ws.removeEventListener("message", onMessage);
  }, [ws, activeRideId]);

  const handleVerify = () => {
    if (verifying) return;
    setError("");
    if (pinInput.length !== 4 || !activeRideId) {
      setError("Please enter the 4-digit Ride Pin.");
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError("Not connected to server. Please try again.");
      return;
    }
    setVerifying(true);
    ws.send(
      JSON.stringify({
        type: "ride",
        action: "start",
        ride_id: activeRideId,
        pin: pinInput,
      }),
    );
  };

  return (
    <View className="flex-1 justify-center items-center px-6 bg-white">
      <Text className="text-2xl font-bold text-black mb-4">Ride Pin</Text>
      <Text className="text-gray-600 text-center mb-8">
        Enter the 4-digit Ride Pin your rider gave you to start the ride.
      </Text>

      {/* <TextInput
                value={riderOTP}
                onChangeText={setRiderOTP}
                keyboardType="number-pad"
                maxLength={6}
                className="w-full border border-gray-300 rounded-lg text-center py-3 text-lg tracking-widest mb-6"
                placeholder="Enter OTP"
            /> */}
      <OtpInput
        numberOfDigits={4}
        onTextChange={setPinInput}
        focusColor="black"
        placeholder="*"
        type="numeric"
        theme={{
          containerStyle: {
            width: "100%",
            justifyContent: "space-between",
            flexDirection: "row",
            marginBottom: spacing["2xl"],
          },
          pinCodeContainerStyle: {
            borderWidth: 1,
            borderColor: colors.textDisabledLight, // Tailwind: border-gray-300
            borderRadius: 8,
            paddingVertical: 12,
            width: 60,
            height: 60,
            justifyContent: "center",
            alignItems: "center",
          },
          pinCodeTextStyle: {
            fontSize: 18,
            textAlign: "center",
            letterSpacing: 6,
          },
          focusStickStyle: {
            backgroundColor: "black",
            width: 2,
            height: 24,
          },
          focusedPinCodeContainerStyle: {
            borderColor: "black",
          },
          filledPinCodeContainerStyle: {
            borderColor: colors.gray600, // Tailwind: border-gray-600
          },
          disabledPinCodeContainerStyle: {
            backgroundColor: colors.gray200, // Tailwind: bg-gray-200
          },
          placeholderTextStyle: {
            color: colors.textSecondaryDark, // Tailwind: text-gray-400
          },
        }}
      />

      {error && (
        <View className="items-center justify-center">
          <Text className="font-Jakarta text-lg text-red-600">{error}</Text>
        </View>
      )}

      <CustomButton
        title={verifying ? "Starting..." : "Start Ride"}
        onPress={handleVerify}
        bgVariant="primary"
        textVariant="primary"
        className="w-full"
      />
    </View>
  );
};

export default EnterOtp;
