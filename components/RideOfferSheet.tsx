import { View, Text, TouchableOpacity, Animated } from "react-native";
import { useRef, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { useWSStore } from "@/store";
import { showToast } from "@/components/Toast";
import { logger } from "@/lib/logger";
import { colors, spacing, radii } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import CountdownRing from "./CountdownRing";
import SlideButton from "@/components/SlideButton";

const FETCH_ERROR_MESSAGES: Record<string, string> = {
  offer_expired: "Offer expired",
  deduction_failed: "Call could not be deducted — try again",
  no_subscription: "No active call package",
};

export default function RideOfferSheet() {
  const { activeOffer, setActiveOffer } = useDriverFlowStore();
  const ws = useWSStore((s) => s.ws);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const acceptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // H-2: a live handle to an in-flight accept handshake so handleReject can
  // tear it down. Previously Accept armed a message listener + 3s timeout that
  // only unmount/offer-change could clear — declining within the window left a
  // late fetch:confirmed free to send offer:accept for a ride just declined.
  const acceptHandshakeRef = useRef<(() => void) | null>(null);
  const isDark = useIsDark();

  // Cancel any in-flight accept handshake when the sheet unmounts or the
  // offer changes (offer:lost / offer expired) so the blind-accept timer can
  // never fire for a dead offer.
  useEffect(() => {
    return () => {
      if (acceptTimeoutRef.current) {
        clearTimeout(acceptTimeoutRef.current);
        acceptTimeoutRef.current = null;
      }
      acceptHandshakeRef.current = null;
    };
    // fadeAnim is a stable useRef value; include it to satisfy exhaustive-deps.
  }, [fadeAnim]);

  useEffect(() => {
    if (!activeOffer) return;

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
      showToast("Not connected — cannot accept", "error");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const rideId = activeOffer.ride_id;
    // K-1: the accept handshake was dead — nothing ever sent fetch:confirm,
    // so the server never emitted fetch:confirmed and every Accept fell
    // through to the 3s timeout. Fire it here (the maestro driver-core flow
    // documents Accept as the trigger: "sends fetch:confirm then
    // offer:accept"), then wait for the server's deduction confirmation.
    ws.send(JSON.stringify({ type: "fetch:confirm", ride_id: rideId }));
    // Exactly-once handshake guard (C1): the 3s fallback previously fired
    // offer:accept UNCONDITIONALLY — double-sending after a fast
    // fetch:confirmed (which made the server refund the accepted driver's
    // call deduction) and even sending it after fetch:error (matching a ride
    // without a deduction). Only a fetch:confirmed reply may commit.
    const state = { resolved: false };

    const finish = (accepted: boolean) => {
      if (state.resolved) return;
      state.resolved = true;
      if (acceptTimeoutRef.current) {
        clearTimeout(acceptTimeoutRef.current);
        acceptTimeoutRef.current = null;
      }
      ws.removeEventListener("message", onMessage);
      acceptHandshakeRef.current = null;
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setActiveOffer(null);
      });
      // No toast here — callers (fetch:error, timeout) already surfaced the
      // specific reason before calling finish(false); finish was previously
      // double-toasting on top of them.
    };

    const onMessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.ride_id !== rideId) return;
        if (msg.type === "fetch:confirmed") {
          // The server deducted the call — commit exactly once.
          ws.send(JSON.stringify({ type: "offer:accept", ride_id: rideId }));
          finish(true);
        } else if (msg.type === "fetch:error") {
          logger.warn("[RideOfferSheet] fetch:confirm failed", {
            rideId,
            error: msg.reason ?? msg.error,
          });
          showToast(
            FETCH_ERROR_MESSAGES[msg.reason ?? msg.error] ??
              "Ride could not be confirmed",
            "error",
          );
          finish(false);
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.addEventListener("message", onMessage);
    // H-2: expose the teardown so a Decline tap can abort the handshake.
    acceptHandshakeRef.current = () => finish(false);

    // Fallback if fetch:confirmed never arrives (lost message, dead socket).
    // Deliberately does NOT send offer:accept — the server only deducts on
    // fetch:confirm, so a blind accept would match without a deduction.
    acceptTimeoutRef.current = setTimeout(() => {
      if (state.resolved) return;
      logger.warn("[RideOfferSheet] fetch:confirm timed out", { rideId });
      showToast("Could not confirm the ride — please try again", "error");
      finish(false);
    }, 3000);
  };

  const handleReject = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // H-2: abort any in-flight accept handshake first — a late
    // fetch:confirmed must not send offer:accept for a ride just declined.
    if (acceptHandshakeRef.current) {
      acceptHandshakeRef.current();
      acceptHandshakeRef.current = null;
    }
    if (ws?.readyState === WebSocket.OPEN) {
      sendWS("offer:reject", { reason: "driver_declined" });
    } else {
      logger.warn("[RideOfferSheet] WS not open, cannot send offer:reject");
      showToast("Not connected — try again", "error");
    }
    setActiveOffer(null);
  };

  // M-5/M-B: the payload may arrive without a fare_breakdown (home
  // null-guards it; this sheet didn't, rendering ৳NaN), and the card must show
  // driver_fare_bdt (= total + preference surcharge) per 06-API.md — not the
  // raw fare_breakdown.total_bdt.
  const fareTotalBdt =
    activeOffer.driver_fare_bdt != null
      ? activeOffer.driver_fare_bdt
      : activeOffer.fare_breakdown?.total_bdt;
  const fareTk = fareTotalBdt != null ? (fareTotalBdt / 100).toFixed(2) : "—";
  const pickupDist = activeOffer.pickup_distance_km;
  const pickupEta = activeOffer.pickup_eta_minutes;
  const riderRating = activeOffer.rider_rating;
  const isScheduled = activeOffer.is_scheduled;
  const preferences = activeOffer.preference_ids || [];

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  return (
    <Animated.View
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: surfaceBg,
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
            expiresInMs={activeOffer.expires_in_ms}
            onExpire={() => setActiveOffer(null)}
            size={48}
          />
          <View>
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 17,
                color: textPrimary,
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
                    fontFamily: "Jakarta-Bold",
                    fontSize: 10,
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
              fontFamily: "Jakarta-Bold",
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
              fontFamily: "Jakarta-SemiBold",
              fontSize: 15,
              color: textPrimary,
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
          <Ionicons name="star" size={12} color={colors.amber} />
              <Text
                style={{
                  fontFamily: "Jakarta-SemiBold",
                  fontSize: 12,
                  color: textSecondary,
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
              fontFamily: "Jakarta-Bold",
              fontSize: 22,
              color: textPrimary,
            }}
          >
            ৳{fareTk}
          </Text>
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 12,
              color: textSecondary,
            }}
          >
            {activeOffer.distance_km != null ? `${activeOffer.distance_km} km` : ""}
          </Text>
        </View>
      </View>

      {/* Upfront tip badge (Pattern A inline styles — no NativeWind, no emoji) */}
      {activeOffer.upfront_tip_bdt > 0 ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.xs,
            backgroundColor: colors.primaryLight,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs + 2,
            marginBottom: spacing.md,
            alignSelf: "flex-start",
          }}
        >
          <Ionicons name="cash-outline" size={14} color={colors.primary} />
          <Text
            style={{
              fontFamily: "Jakarta-Bold",
              fontSize: 13,
              color: colors.primary,
            }}
          >
            +৳{((activeOffer.upfront_tip_bdt / 100).toFixed(2))} tip
          </Text>
        </View>
      ) : null}

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
                  fontFamily: "Jakarta-SemiBold",
                  fontSize: 11,
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="location-outline" size={12} color={textSecondary} />
                <Text
                  style={{
                    fontFamily: "Jakarta-Regular",
                    fontSize: 12,
                    color: textSecondary,
                  }}
                >
                  {pickupDist.toFixed(1)} km away
                </Text>
              </View>
            </View>
          )}
          {pickupEta > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="time-outline" size={12} color={textSecondary} />
                <Text
                  style={{
                    fontFamily: "Jakarta-Regular",
                    fontSize: 12,
                    color: textSecondary,
                  }}
                >
                  ~{pickupEta} min to pickup
                </Text>
              </View>
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
              fontFamily: "Jakarta-Regular",
              fontSize: 14,
              color: textPrimary,
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
              fontFamily: "Jakarta-Regular",
              fontSize: 14,
              color: textPrimary,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {activeOffer.dropoff?.address || "Dropoff location"}
          </Text>
        </View>
      </View>

      {/* Action: slide to accept + decline tap (≥56dp touch target) */}
      <SlideButton
        title="Slide to Accept"
        onComplete={handleAccept}
        bgColor={colors.primary}
        textColor={colors.white}
      />
      <TouchableOpacity
        onPress={handleReject}
        style={{
          backgroundColor: "transparent",
          borderWidth: 1.5,
          borderColor: borderColor,
          borderRadius: radii.pill,
          paddingVertical: spacing.md,
          minHeight: 56,
          justifyContent: "center",
          alignItems: "center",
          marginTop: spacing.md,
        }}
      >
        <Text
          style={{
            fontFamily: "Jakarta-Bold",
            fontSize: 15,
            color: textSecondary,
          }}
        >
          Decline
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
