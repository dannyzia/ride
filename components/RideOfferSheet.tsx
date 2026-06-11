import { View, Text, TouchableOpacity, Animated } from "react-native";
import { useRef, useEffect } from "react";
import * as Haptics from "expo-haptics";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { useWSStore } from "@/store";
import { logger } from "@/lib/logger";
import { colors, spacing, radii } from "@/theme/goRide";
import CountdownRing from "./CountdownRing";

export default function RideOfferSheet() {
  const { activeOffer, setActiveOffer } = useDriverFlowStore();
  const ws = useWSStore((s) => s.ws);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!activeOffer) return;

    // Haptic + sound notification on offer arrival
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => {},
    );

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    return () => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    };
  }, [activeOffer]);

  if (!activeOffer) return null;

  const sendWS = (type: string, payload: Record<string, unknown>) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({ type, ride_id: activeOffer.ride_id, ...payload }),
      );
    } else {
      logger.warn("[RideOfferSheet] WS not open, cannot send", { type });
    }
  };

  const handleAccept = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !activeOffer) {
      logger.warn("[RideOfferSheet] WS not ready for accept");
      return;
    }

    // Haptic feedback on accept
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const rideId = activeOffer.ride_id;
    ws.send(JSON.stringify({ type: "fetch:confirm", ride_id: rideId }));

    // Wait for server ACK before sending offer:accept
    const onMessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.ride_id === rideId) {
          if (msg.type === "fetch:confirmed") {
            ws.send(JSON.stringify({ type: "offer:accept", ride_id: rideId }));
            ws.removeEventListener("message", onMessage);
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              setActiveOffer(null);
            });
          } else if (msg.type === "fetch:error") {
            ws.removeEventListener("message", onMessage);
            logger.warn("[RideOfferSheet] fetch:confirm failed", {
              rideId,
              error: msg.error,
            });
          }
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.addEventListener("message", onMessage);

    // Timeout fallback — if no ACK within 3s, still try offer:accept
    setTimeout(() => {
      ws.removeEventListener("message", onMessage);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "offer:accept", ride_id: rideId }));
      }
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setActiveOffer(null);
      });
    }, 3000);
  };

  const handleReject = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    sendWS("offer:reject", { reason: "driver_declined" });
    setActiveOffer(null);
  };

  const fareTk = (activeOffer.fare_breakdown?.total_bdt / 100).toFixed(0);
  const pickupDist = activeOffer.pickup_distance_km;
  const pickupEta = activeOffer.pickup_eta_minutes;
  const riderRating = activeOffer.rider_rating;
  const isScheduled = activeOffer.is_scheduled;
  const preferences = activeOffer.preference_ids || [];

  return (
    <Animated.View
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.surfaceElevatedDark,
        borderTopLeftRadius: radii["3xl"],
        borderTopRightRadius: radii["3xl"],
        padding: spacing.lg,
        paddingBottom: spacing["2xl"],
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 24,
        zIndex: 50,
        opacity: fadeAnim,
        transform: [
          {
            translateY: fadeAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [300, 0],
            }),
          },
        ],
      }}
    >
      {/* Top row: Countdown ring + Title + Scheduled badge */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: spacing.md,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <CountdownRing
            expiresAt={activeOffer.expires_at}
            onExpire={() => setActiveOffer(null)}
            size={48}
          />
          <View>
            <Text
              style={{
                fontFamily: "Urbanist",
                fontWeight: "700",
                fontSize: 17,
                color: colors.textPrimaryDark,
              }}
            >
              New Ride Offer
            </Text>
            {isScheduled && (
              <View
                style={{
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 2,
                  borderRadius: radii.xs,
                  backgroundColor: colors.info + "20",
                  alignSelf: "flex-start",
                  marginTop: 2,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Inter",
                    fontSize: 10,
                    fontWeight: "700",
                    color: colors.info,
                  }}
                >
                  SCHEDULED
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Rider info row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: spacing.md,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.primary + "20",
            alignItems: "center",
            justifyContent: "center",
            marginRight: spacing.sm,
          }}
        >
          <Text
            style={{
              fontFamily: "Urbanist",
              fontWeight: "700",
              fontSize: 16,
              color: colors.primary,
            }}
          >
            {activeOffer.rider_first_name?.charAt(0).toUpperCase() || "R"}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "Urbanist",
              fontWeight: "600",
              fontSize: 15,
              color: colors.textPrimaryDark,
            }}
          >
            {activeOffer.rider_first_name || "Rider"}
          </Text>
          {riderRating != null && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 2,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter",
                  fontSize: 12,
                  color: colors.amber,
                }}
              >
                ★
              </Text>
              <Text
                style={{
                  fontFamily: "Inter",
                  fontSize: 12,
                  fontWeight: "600",
                  color: colors.textSecondaryDark,
                  marginLeft: 2,
                }}
              >
                {riderRating.toFixed(1)}
              </Text>
            </View>
          )}
        </View>
        {/* Fare */}
        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={{
              fontFamily: "Urbanist",
              fontWeight: "700",
              fontSize: 22,
              color: colors.textPrimaryDark,
            }}
          >
            ৳{fareTk}
          </Text>
          <Text
            style={{
              fontFamily: "Inter",
              fontSize: 12,
              color: colors.textSecondaryDark,
            }}
          >
            {activeOffer.distance_km} km
          </Text>
        </View>
      </View>

      {/* Preference chips */}
      {preferences.length > 0 && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 4,
            marginBottom: spacing.md,
          }}
        >
          {preferences.map((prefId: string) => (
            <View
              key={prefId}
              style={{
                paddingHorizontal: spacing.sm,
                paddingVertical: 4,
                borderRadius: radii.pill,
                backgroundColor: colors.primaryLight,
                borderWidth: 1,
                borderColor: colors.primary + "30",
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter",
                  fontSize: 11,
                  fontWeight: "600",
                  color: colors.primary,
                }}
              >
                {prefId}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Pickup distance / ETA row */}
      {(pickupDist > 0 || pickupEta > 0) && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            marginBottom: spacing.md,
            paddingHorizontal: spacing.sm,
          }}
        >
          {pickupDist > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={{
                  fontFamily: "Inter",
                  fontSize: 12,
                  color: colors.textSecondaryDark,
                }}
              >
                📍 {pickupDist.toFixed(1)} km away
              </Text>
            </View>
          )}
          {pickupEta > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={{
                  fontFamily: "Inter",
                  fontSize: 12,
                  color: colors.textSecondaryDark,
                }}
              >
                ⏱ ~{pickupEta} min to pickup
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Pickup / Dropoff */}
      <View style={{ marginBottom: spacing.lg }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: spacing.sm,
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.primary,
              marginRight: spacing.md,
            }}
          />
          <Text
            style={{
              fontFamily: "Inter",
              fontSize: 14,
              color: colors.textPrimaryDark,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {activeOffer.pickup?.address || "Pickup location"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.danger,
              marginRight: spacing.md,
            }}
          />
          <Text
            style={{
              fontFamily: "Inter",
              fontSize: 14,
              color: colors.textPrimaryDark,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {activeOffer.dropoff?.address || "Dropoff location"}
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <TouchableOpacity
          onPress={handleReject}
          style={{
            flex: 1,
            backgroundColor: "transparent",
            borderWidth: 1.5,
            borderColor: colors.borderDark,
            borderRadius: radii.pill,
            paddingVertical: spacing.md,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Urbanist",
              fontWeight: "700",
              fontSize: 15,
              color: colors.textSecondaryDark,
            }}
          >
            Decline
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleAccept}
          style={{
            flex: 1,
            backgroundColor: colors.primary,
            borderRadius: radii.pill,
            paddingVertical: spacing.md,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Urbanist",
              fontWeight: "700",
              fontSize: 15,
              color: colors.white,
            }}
          >
            Accept
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
