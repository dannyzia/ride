/**
 * Admin Fleet Plan Management — list, create, edit, toggle active.
 * Uses AdminShell + AdminTable + adminFetch pattern.
 */
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  Alert,
} from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

// ── Types ─────────────────────────────────────────────────────────────────

interface PlanRow {
  id: string;
  name: string;
  description: string | null;
  billing_period: string;
  price_bdt: number;
  vehicle_limit: number | null;
  driver_limit: number | null;
  api_limit: number | null;
  active: boolean;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatPaisa(p: number): string {
  return `৳${(p / 100).toLocaleString("en-BD")}`;
}

function periodLabel(p: string): string {
  return p === "WEEKLY" ? "/wk" : p === "MONTHLY" ? "/mo" : "/yr";
}

// ── Create/Edit form ──────────────────────────────────────────────────────

function PlanForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: PlanRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [billingPeriod, setBillingPeriod] = useState(
    initial?.billing_period ?? "MONTHLY",
  );
  const [priceBdt, setPriceBdt] = useState(
    initial ? String(initial.price_bdt / 100) : "",
  );
  const [vehicleLimit, setVehicleLimit] = useState(
    initial?.vehicle_limit?.toString() ?? "",
  );
  const [driverLimit, setDriverLimit] = useState(
    initial?.driver_limit?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);

  const isEdit = !!initial;

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Plan name is required");
      return;
    }
    const priceNum = parseFloat(priceBdt);
    if (isNaN(priceNum) || priceNum < 0) {
      Alert.alert("Error", "Price must be a non-negative number");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        billing_period: billingPeriod,
        price_bdt: Math.round(priceNum * 100), // taka → paisa
        vehicle_limit: vehicleLimit ? parseInt(vehicleLimit) : null,
        driver_limit: driverLimit ? parseInt(driverLimit) : null,
      };

      if (isEdit) {
        const res = await adminFetch(`/api/admin/fleet-plans`, {
          method: "PATCH",
          body: JSON.stringify({ id: initial.id, ...body }),
        });
        if (res.error) {
          Alert.alert("Error", res.message ?? res.error);
          return;
        }
      } else {
        const res = await adminFetch("/api/admin/fleet-plans", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (res.error) {
          Alert.alert("Error", res.message ?? res.error);
          return;
        }
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    backgroundColor: colors.darkSecondary,
    borderRadius: 8,
    padding: 10,
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular" as const,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#2A2D35",
    outlineStyle: "none" as const,
    width: "100%" as const,
  };

  return (
    <View
      style={{
        backgroundColor: colors.darkSurface,
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: "#2A2D35",
      }}
    >
      <Text
        style={{
          fontFamily: "Jakarta-Bold",
          fontSize: 16,
          color: colors.textPrimaryDark,
          marginBottom: 16,
        }}
      >
        {isEdit ? "Edit Plan" : "New Plan"}
      </Text>

      <Text
        style={{
          fontFamily: "Jakarta-SemiBold",
          fontSize: 12,
          color: colors.textSecondaryDark,
          marginBottom: 4,
        }}
      >
        Name
      </Text>
      <input
        value={name}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setName(e.target.value)
        }
        style={inputStyle}
        placeholder="e.g. Basic Fleet"
      />

      <Text
        style={{
          fontFamily: "Jakarta-SemiBold",
          fontSize: 12,
          color: colors.textSecondaryDark,
          marginBottom: 4,
          marginTop: 12,
        }}
      >
        Description
      </Text>
      <input
        value={description}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setDescription(e.target.value)
        }
        style={inputStyle}
        placeholder="Optional description"
      />

      <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "Jakarta-SemiBold",
              fontSize: 12,
              color: colors.textSecondaryDark,
              marginBottom: 4,
            }}
          >
            Price (BDT taka)
          </Text>
          <input
            type="number"
            value={priceBdt}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setPriceBdt(e.target.value)
            }
            style={inputStyle}
            placeholder="0"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "Jakarta-SemiBold",
              fontSize: 12,
              color: colors.textSecondaryDark,
              marginBottom: 4,
            }}
          >
            Billing Period
          </Text>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {(["WEEKLY", "MONTHLY", "YEARLY"] as const).map((p) => (
              <Pressable
                key={p}
                onPress={() => setBillingPeriod(p)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 6,
                  backgroundColor:
                    billingPeriod === p ? colors.adminAccent : colors.darkSecondary,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor:
                    billingPeriod === p ? colors.adminAccent : "#2A2D35",
                }}
              >
                <Text
                  style={{
                    color:
                      billingPeriod === p
                        ? colors.darkSurface
                        : colors.textSecondaryDark,
                    fontFamily: "Jakarta-SemiBold",
                    fontSize: 11,
                  }}
                >
                  {p.slice(0, 3)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "Jakarta-SemiBold",
              fontSize: 12,
              color: colors.textSecondaryDark,
              marginBottom: 4,
            }}
          >
            Vehicle Limit
          </Text>
          <input
            type="number"
            value={vehicleLimit}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setVehicleLimit(e.target.value)
            }
            style={inputStyle}
            placeholder="Unlimited"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "Jakarta-SemiBold",
              fontSize: 12,
              color: colors.textSecondaryDark,
              marginBottom: 4,
            }}
          >
            Driver Limit
          </Text>
          <input
            type="number"
            value={driverLimit}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setDriverLimit(e.target.value)
            }
            style={inputStyle}
            placeholder="Unlimited"
          />
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          gap: 8,
          marginTop: 16,
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={onClose}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: colors.darkSecondary,
          }}
        >
          <Text
            style={{
              color: colors.textSecondaryDark,
              fontFamily: "Jakarta-SemiBold",
              fontSize: 13,
            }}
          >
            Cancel
          </Text>
        </Pressable>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: colors.adminAccent,
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Text
            style={{
              color: colors.darkSurface,
              fontFamily: "Jakarta-SemiBold",
              fontSize: 13,
            }}
          >
            {saving ? "Saving..." : isEdit ? "Update" : "Create"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────

export default function AdminFleetPlans() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanRow | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<{ plans: PlanRow[] }>(
      "/api/admin/fleet-plans",
    );
    if (res.data) setPlans(res.data.plans ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const toggleActive = async (plan: PlanRow) => {
    const res = await adminFetch("/api/admin/fleet-plans", {
      method: "PATCH",
      body: JSON.stringify({ id: plan.id, active: !plan.active }),
    });
    if (!res.error) {
      setPlans((prev) =>
        prev.map((p) => (p.id === plan.id ? { ...p, active: !p.active } : p)),
      );
    }
  };

  const columns: AdminColumn<PlanRow>[] = [
    {
      key: "name",
      header: "Plan",
      width: 180,
      sortable: true,
      render: (r) => (
        <View>
          <Text
            style={{
              color: colors.textPrimaryDark,
              fontFamily: "Jakarta-SemiBold",
              fontSize: 13,
            }}
          >
            {r.name}
          </Text>
          {r.description && (
            <Text
              style={{
                color: colors.textSecondaryDark,
                fontFamily: "Jakarta-Regular",
                fontSize: 11,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {r.description}
            </Text>
          )}
        </View>
      ),
    },
    {
      key: "price_bdt",
      header: "Price",
      width: 100,
      sortable: true,
      render: (r) => (
        <Text
          style={{
            color: colors.primary,
            fontFamily: "Jakarta-Bold",
            fontSize: 14,
          }}
        >
          {formatPaisa(r.price_bdt)}
        </Text>
      ),
    },
    {
      key: "billing_period",
      header: "Period",
      width: 80,
      sortable: true,
      render: (r) => (
        <Text
          style={{
            color: colors.textPrimaryDark,
            fontFamily: "Jakarta-Regular",
            fontSize: 12,
          }}
        >
          {r.billing_period}
        </Text>
      ),
    },
    {
      key: "vehicle_limit",
      header: "Vehicles",
      width: 80,
      render: (r) => (
        <Text
          style={{
            color: colors.textPrimaryDark,
            fontFamily: "Jakarta-Regular",
            fontSize: 12,
          }}
        >
          {r.vehicle_limit ?? "∞"}
        </Text>
      ),
    },
    {
      key: "driver_limit",
      header: "Drivers",
      width: 80,
      render: (r) => (
        <Text
          style={{
            color: colors.textPrimaryDark,
            fontFamily: "Jakarta-Regular",
            fontSize: 12,
          }}
        >
          {r.driver_limit ?? "∞"}
        </Text>
      ),
    },
    {
      key: "active",
      header: "Status",
      width: 90,
      render: (r) => (
        <Pressable onPress={() => toggleActive(r)}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              alignSelf: "flex-start",
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: r.active ? "#0CC25F" : "#6B7280",
              }}
            />
            <Text
              style={{
                color: r.active ? "#0CC25F" : "#6B7280",
                fontFamily: "Jakarta-SemiBold",
                fontSize: 11,
              }}
            >
              {r.active ? "Active" : "Inactive"}
            </Text>
          </View>
        </Pressable>
      ),
    },
    {
      key: "actions",
      header: "",
      width: 80,
      render: (r) => (
        <Pressable
          onPress={() => {
            setEditingPlan(r);
            setShowForm(true);
          }}
          style={{
            backgroundColor: colors.darkSecondary,
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderWidth: 1,
            borderColor: "#2A2D35",
          }}
        >
          <Text
            style={{
              color: colors.adminAccent,
              fontFamily: "Jakarta-SemiBold",
              fontSize: 11,
            }}
          >
            Edit
          </Text>
        </Pressable>
      ),
    },
  ];

  return (
    <AdminShell
      title="Fleet Plans"
      subtitle="Manage fleet subscription plans"
      actions={
        !showForm ? (
          <Pressable
            onPress={() => {
              setEditingPlan(null);
              setShowForm(true);
            }}
            style={{
              backgroundColor: colors.adminAccent,
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}
          >
            <Text
              style={{
                color: colors.darkSurface,
                fontFamily: "Jakarta-SemiBold",
                fontSize: 13,
              }}
            >
              + New Plan
            </Text>
          </Pressable>
        ) : undefined
      }
    >
      {showForm && (
        <PlanForm
          initial={editingPlan}
          onClose={() => {
            setShowForm(false);
            setEditingPlan(null);
          }}
          onSaved={fetchPlans}
        />
      )}

      <Text
        style={{
          color: colors.textSecondaryDark,
          fontFamily: "Jakarta-Regular",
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        {plans.length} plan{plans.length !== 1 ? "s" : ""}
      </Text>

      <AdminTable
        columns={columns}
        rows={plans}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="No fleet plans yet — create one above"
      />
    </AdminShell>
  );
}
