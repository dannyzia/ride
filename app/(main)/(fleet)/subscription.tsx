/**
 * F13 — Fleet Subscription Management.
 * Shows current plan, usage meters (vehicles/drivers), browse plans, switch.
 * Pattern A theming.
 */
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useFleetStore } from "@/store/useFleetStore";
import FleetScreen from "@/components/fleet/FleetScreen";
import { getAuthHeaders } from "@/lib/fleetAuth";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  description: string | null;
  billing_period: string;
  price_bdt: number;
  vehicle_limit: number | null;
  driver_limit: number | null;
  api_limit: number | null;
}

interface SubState {
  has_subscription: boolean;
  status: string;
  plan: Plan | null;
  subscription?: {
    id: string;
    status: string;
    started_at: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
  } | null;
}

interface LimitsData {
  plan_name: string | null;
  subscription_status: string;
  vehicles: { used: number; limit: number | null; at_limit: boolean };
  drivers: { used: number; limit: number | null; at_limit: boolean };
  api: { limit: number | null };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatPaisa(p: number): string {
  return `৳${(p / 100).toLocaleString("en-BD")}`;
}
function periodLabel(p: string): string {
  return p === "WEEKLY" ? "/week" : p === "MONTHLY" ? "/month" : p === "YEARLY" ? "/year" : "";
}
function formatDate(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString("en-BD", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "N/A";
}

// ── Component ─────────────────────────────────────────────────────────────

export default function FleetSubscription() {
  const isDark = useIsDark();
  const fleetId = useFleetStore((s) => s.activeFleetId);
  const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "";

  const [current, setCurrent] = useState<SubState | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [limits, setLimits] = useState<LimitsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [showPlans, setShowPlans] = useState(false);

  const textPrimary = isDark
    ? colors.textPrimaryDark
    : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const fetchData = useCallback(async () => {
    if (!fleetId) return;
    try {
      setLoading(true);
      const headers = (await getAuthHeaders()) ?? {};
      const [subRes, plansRes, limitsRes] = await Promise.all([
        fetch(
          `${serverUrl}/api/fleet/subscription?fleet_id=${fleetId}`,
          { headers },
        ),
        fetch(`${serverUrl}/api/fleet/plans`, { headers }),
        fetch(`${serverUrl}/api/fleet/limits?fleet_id=${fleetId}`, {
          headers,
        }),
      ]);
      if (subRes.ok) setCurrent(await subRes.json());
      if (plansRes.ok) setPlans((await plansRes.json()).plans ?? []);
      if (limitsRes.ok) setLimits(await limitsRes.json());
    } catch (err) {
      logger.error("[fleet-subscription] fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, [fleetId, serverUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubscribe = async (planId: string) => {
    if (!fleetId) return;
    try {
      setSubscribing(planId);
      const authHeaders = await getAuthHeaders();
      const res = await fetch(
        `${serverUrl}/api/fleet/plans?fleet_id=${fleetId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authHeaders ?? {}),
          },
          body: JSON.stringify({ plan_id: planId }),
        },
      );
      if (res.ok) {
        setShowPlans(false);
        Alert.alert("Success", "Plan updated successfully");
        await fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        Alert.alert("Error", data.message ?? "Failed to change plan");
      }
    } catch (err) {
      logger.error("[fleet-subscription] subscribe failed", err);
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setSubscribing(null);
    }
  };

  return (
    <FleetScreen
      title="Subscription"
      subtitle="Manage your fleet plan"
      onRefresh={fetchData}
      refreshing={loading}
    >
      {loading ? (
        <View style={{ alignItems: "center", paddingTop: 60 }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          {/* Current Plan Card */}
          {current?.has_subscription && current.plan ? (
            <View
              style={{
                backgroundColor: colors.primary,
                borderRadius: 16,
                padding: 20,
                marginBottom: 20,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                <Text
                  style={{
                    fontFamily: "Jakarta-SemiBold",
                    fontSize: 14,
                    color: "rgba(255,255,255,0.9)",
                    marginLeft: 8,
                  }}
                >
                  Current Plan
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: "Jakarta-Bold",
                  fontSize: 24,
                  color: "#FFFFFF",
                }}
              >
                {current.plan.name}
              </Text>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 14,
                  color: "rgba(255,255,255,0.8)",
                  marginTop: 4,
                }}
              >
                {formatPaisa(current.plan.price_bdt)}
                {periodLabel(current.plan.billing_period)}
              </Text>

              {/* Status + renewal */}
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: "rgba(255,255,255,0.2)",
                  marginTop: 16,
                  paddingTop: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Jakarta-Regular",
                      fontSize: 13,
                      color: "rgba(255,255,255,0.8)",
                    }}
                  >
                    Status
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Jakarta-SemiBold",
                      fontSize: 13,
                      color: "#FFFFFF",
                    }}
                  >
                    {current.status}
                  </Text>
                </View>
                {current.subscription?.current_period_end && (
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Jakarta-Regular",
                        fontSize: 13,
                        color: "rgba(255,255,255,0.8)",
                      }}
                    >
                      Renews
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Jakarta-SemiBold",
                        fontSize: 13,
                        color: "#FFFFFF",
                      }}
                    >
                      {formatDate(current.subscription.current_period_end)}
                    </Text>
                  </View>
                )}
                {current.subscription?.started_at && (
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginTop: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Jakarta-Regular",
                        fontSize: 13,
                        color: "rgba(255,255,255,0.8)",
                      }}
                    >
                      Started
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Jakarta-SemiBold",
                        fontSize: 13,
                        color: "#FFFFFF",
                      }}
                    >
                      {formatDate(current.subscription.started_at)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View
              style={{
                backgroundColor: surfaceBg,
                borderRadius: 16,
                padding: 20,
                marginBottom: 20,
                borderWidth: 1,
                borderColor,
                alignItems: "center",
              }}
            >
              <Ionicons name="card-outline" size={48} color={textSecondary} />
              <Text
                style={{
                  fontFamily: "Jakarta-Bold",
                  fontSize: 18,
                  color: textPrimary,
                  marginTop: 12,
                }}
              >
                No Active Plan
              </Text>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 13,
                  color: textSecondary,
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                Choose a subscription plan to unlock fleet features.
              </Text>
            </View>
          )}

          {/* Usage Meters */}
          {limits && (
            <View
              style={{
                backgroundColor: surfaceBg,
                borderRadius: 16,
                padding: 16,
                marginBottom: 20,
                borderWidth: 1,
                borderColor,
              }}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-Bold",
                  fontSize: 14,
                  color: textPrimary,
                  marginBottom: 12,
                }}
              >
                Usage
              </Text>
              <UsageRow
                label="Vehicles"
                used={limits.vehicles.used}
                limit={limits.vehicles.limit}
                atLimit={limits.vehicles.at_limit}
                isDark={isDark}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                borderColor={borderColor}
              />
              <UsageRow
                label="Drivers"
                used={limits.drivers.used}
                limit={limits.drivers.limit}
                atLimit={limits.drivers.at_limit}
                isDark={isDark}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                borderColor={borderColor}
              />
            </View>
          )}

          {/* Change Plan / Choose Plan button */}
          {!showPlans ? (
            <TouchableOpacity
              onPress={() => setShowPlans(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: current?.has_subscription
                  ? "transparent"
                  : colors.primary,
                borderRadius: 12,
                padding: 14,
                borderWidth: current?.has_subscription ? 1 : 0,
                borderColor: current?.has_subscription
                  ? colors.primary
                  : undefined,
              }}
            >
              <Ionicons
                name={
                  current?.has_subscription ? "swap-horizontal" : "add-circle"
                }
                size={20}
                color={
                  current?.has_subscription ? colors.primary : "#FFFFFF"
                }
              />
              <Text
                style={{
                  fontFamily: "Jakarta-SemiBold",
                  fontSize: 14,
                  color: current?.has_subscription ? colors.primary : "#FFFFFF",
                  marginLeft: 8,
                }}
              >
                {current?.has_subscription ? "Change Plan" : "Choose a Plan"}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <Text
                style={{
                  fontFamily: "Jakarta-Bold",
                  fontSize: 16,
                  color: textPrimary,
                  marginBottom: 12,
                }}
              >
                Available Plans
              </Text>
              {plans.map((plan) => {
                const isCurrent = current?.plan?.id === plan.id;
                const isLoading = subscribing === plan.id;
                return (
                  <TouchableOpacity
                    key={plan.id}
                    onPress={() => {
                      Alert.alert(
                        "Change Plan",
                        `Switch to "${plan.name}" (${formatPaisa(plan.price_bdt)}${periodLabel(plan.billing_period)})?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Confirm",
                            onPress: () => handleSubscribe(plan.id),
                          },
                        ],
                      );
                    }}
                    disabled={isLoading || isCurrent}
                    style={{
                      backgroundColor: surfaceBg,
                      borderRadius: 16,
                      padding: 16,
                      marginBottom: 12,
                      borderWidth: 2,
                      borderColor: isCurrent ? colors.primary : borderColor,
                      opacity: isLoading ? 0.6 : 1,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontFamily: "Jakarta-Bold",
                            fontSize: 18,
                            color: textPrimary,
                          }}
                        >
                          {plan.name}
                        </Text>
                        {plan.description && (
                          <Text
                            style={{
                              fontFamily: "Jakarta-Regular",
                              fontSize: 13,
                              color: textSecondary,
                              marginTop: 4,
                            }}
                          >
                            {plan.description}
                          </Text>
                        )}
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text
                          style={{
                            fontFamily: "Jakarta-Bold",
                            fontSize: 20,
                            color: colors.primary,
                          }}
                        >
                          {formatPaisa(plan.price_bdt)}
                        </Text>
                        <Text
                          style={{
                            fontFamily: "Jakarta-Regular",
                            fontSize: 12,
                            color: textSecondary,
                          }}
                        >
                          {periodLabel(plan.billing_period)}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 16,
                        marginTop: 12,
                        paddingTop: 12,
                        borderTopWidth: 1,
                        borderTopColor: borderColor,
                      }}
                    >
                      {plan.vehicle_limit && (
                        <Text
                          style={{
                            fontFamily: "Jakarta-Regular",
                            fontSize: 12,
                            color: textSecondary,
                          }}
                        >
                          {plan.vehicle_limit} vehicles
                        </Text>
                      )}
                      {plan.driver_limit && (
                        <Text
                          style={{
                            fontFamily: "Jakarta-Regular",
                            fontSize: 12,
                            color: textSecondary,
                          }}
                        >
                          {plan.driver_limit} drivers
                        </Text>
                      )}
                      {plan.api_limit && (
                        <Text
                          style={{
                            fontFamily: "Jakarta-Regular",
                            fontSize: 12,
                            color: textSecondary,
                          }}
                        >
                          {plan.api_limit} API calls
                        </Text>
                      )}
                    </View>
                    {isCurrent && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginTop: 10,
                        }}
                      >
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={colors.primary}
                        />
                        <Text
                          style={{
                            fontFamily: "Jakarta-SemiBold",
                            fontSize: 13,
                            color: colors.primary,
                            marginLeft: 6,
                          }}
                        >
                          Current Plan
                        </Text>
                      </View>
                    )}
                    {isLoading && (
                      <ActivityIndicator
                        size="small"
                        color={colors.primary}
                        style={{ marginTop: 8 }}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                onPress={() => setShowPlans(false)}
                style={{ padding: 16, alignItems: "center" }}
              >
                <Text
                  style={{
                    fontFamily: "Jakarta-Medium",
                    fontSize: 14,
                    color: textSecondary,
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </>
          )}
        </>
      )}
    </FleetScreen>
  );
}

// ── Usage Row ─────────────────────────────────────────────────────────────

function UsageRow({
  label,
  used,
  limit,
  atLimit,
  isDark,
  textPrimary,
  textSecondary,
  borderColor,
}: {
  label: string;
  used: number;
  limit: number | null;
  atLimit: boolean;
  isDark: boolean;
  textPrimary: string;
  textSecondary: string;
  borderColor: string;
}) {
  const pct = limit != null && limit > 0 ? Math.min(used / limit, 1) : null;
  const barColor = atLimit ? "#E31D1C" : pct != null && pct > 0.8 ? "#F59E0B" : colors.primary;

  return (
    <View style={{ marginBottom: 12 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <Text
          style={{
            fontFamily: "Jakarta-Medium",
            fontSize: 13,
            color: textPrimary,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontFamily: "Jakarta-SemiBold",
            fontSize: 13,
            color: atLimit ? "#E31D1C" : textPrimary,
          }}
        >
          {used}
          {limit != null ? ` / ${limit}` : ""}
          {atLimit ? " ⚠" : ""}
        </Text>
      </View>

      {/* Progress bar */}
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: isDark ? "#2A2D35" : "#F3F4F6",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: "100%",
            borderRadius: 3,
            backgroundColor: barColor,
            width: pct != null ? `${pct * 100}%` : "0%",
          }}
        />
      </View>

      {limit == null && (
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontSize: 11,
            color: textSecondary,
            marginTop: 2,
          }}
        >
          No limit
        </Text>
      )}
      {atLimit && (
        <Text
          style={{
            fontFamily: "Jakarta-Medium",
            fontSize: 11,
            color: "#E31D1C",
            marginTop: 2,
          }}
        >
          Limit reached — upgrade plan to add more
        </Text>
      )}
    </View>
  );
}
