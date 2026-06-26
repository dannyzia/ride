import { colors, spacing } from "@/theme/goRide";
import { View, Text } from "react-native";
import React, { useEffect, useState } from "react";
import CustomButton from "@/components/CustomButton";
import { useRideOfferStore, useWSStore } from "@/store";
import { router } from "expo-router";
import { OtpInput } from "react-native-otp-entry";
import { logger } from "@/lib/logger";

const WEBSOCKET_API_URL = process.env.EXPO_PUBLIC_WEB_SOCKET_SERVER_URL ?? "";

const EnterOtp = () => {
  const [riderOTP, setRiderOTP] = useState("");
  const [customerOTP, setCustomerOTP] = useState("");
  const { ws, setWebSocket } = useWSStore();
  const {
    activeRideId,
    giveRideDetails,
    changeStatus,
    removeRideOffer: _removeRideOffer,
  } = useRideOfferStore();
  const [error, setError] = useState("");

  logger.info(customerOTP);
  logger.info(customerOTP);

  useEffect(() => {
    let socket: WebSocket;

    // Either create a new one or use existing one
    if (!ws) {
      const newWs = new WebSocket(WEBSOCKET_API_URL);

      newWs.onopen = () => {
        logger.info("WebSocket connected");
      };

      newWs.onerror = (err) => {
        logger.info("WebSocket error:", err);
      };

      setWebSocket(newWs);
      socket = newWs;
    } else {
      socket = ws;
    }

    // Attach onmessage regardless
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      logger.info("message received");
      logger.info(message.otp);
      logger.info(message.otp);
      if (message.type === "OTP") {
        if (activeRideId === message.id) {
          setCustomerOTP(message.otp);
        }
      }
    };
  }, [ws]);

  logger.info("WebSocket instance in EnterOtp", ws);

  const handleVerify = () => {
    if (customerOTP && riderOTP && customerOTP === riderOTP && activeRideId) {
      const rideDetails = giveRideDetails(activeRideId);
      logger.info("ride details from enter otp page");
      logger.info(activeRideId);
      logger.info(rideDetails);
      if (rideDetails) {
        changeStatus(rideDetails?.id, "Start");
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "journeyBegins",
              role: "rider",
              id: rideDetails?.id,
              customer_id: rideDetails?.customer_id,
            }),
          );
        }
      } else {
        logger.info("ride details not found on page enter OTP");
      }
      router.replace("/(main)/(rider)/finish-ride");
    } else {
      setError("Please enter a valid OTP.");
    }
  };

  return (
    <View className="flex-1 justify-center items-center px-6 bg-white">
      <Text className="text-2xl font-bold text-black mb-4">Enter OTP</Text>
      <Text className="text-gray-600 text-center mb-8">
        Please enter the OTP provided by the customer to start the ride.
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
        onTextChange={setRiderOTP}
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
        title="Verify OTP"
        onPress={handleVerify}
        bgVariant="primary"
        textVariant="primary"
        className="w-full"
      />
    </View>
  );
};

export default EnterOtp;
