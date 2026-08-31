/**
 * Admin Fleet Management — list, search, filter, approve/suspend fleets.
 * Uses AdminShell + AdminTable + adminFetch pattern.
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, ActivityIndicator, Pressable, Alert } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

// ── Types ─────────────────────────────────────────────────────────────────

interface FleetRow {
  id: string;
  name: string;
  fleet_type: "NATIVE" | "EXTERNAL" | "HYBRID";
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "BLOCKED" | "CLOSED";
  owner_user_id: string;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  subscription_status: string | null;
  created_at: string;
  vehicle_count: number;
  driver_count: number;
  member_count: number;
}

// ── Status badge ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#0CC25F",
  PENDING: "#F59E0B",
  SUSPENDED: "#F97316",
  BLOCKED: "#E31D1C",
  CLOSED: "#6B7280",
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#6B7280";
  return (
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
          backgroundColor: color,
        }}
      />
      <Text
        style={{
          color,
          fontFamily: "Jakarta-SemiBold",
          fontSize: 11,
        }}
      >
        {status}
      </Text>
    </View>
  );
}

// ── Action buttons ────────────────────────────────────────────────────────

function FleetActions({
  fleet,
  onStatusChange,
}: {
  fleet: FleetRow;
  onStatusChange: (fleetId: string, newStatus: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const changeStatus = async (newStatus: string) => {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/fleets/${fleet.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.error) {
        Alert.alert("Error", res.message ?? res.error);
      } else {
        onStatusChange(fleet.id, newStatus);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <ActivityIndicator size="small" color={colors.adminAccent} />;
  }

  const actions: { label: string; color: string; target: string }[] = [];

  if (fleet.status === "PENDING") {
    actions.push({ label: "Approve", color: "#0CC25F", target: "ACTIVE" });
  }
  if (fleet.status === "ACTIVE") {
    actions.push({ label: "Suspend", color: "#F97316", target: "SUSPENDED" });
  }
  if (fleet.status === "SUSPENDED") {
    actions.push({ label: "Reactivate", color: "#0CC25F", target: "ACTIVE" });
    actions.push({ label: "Block", color: "#E31D1C", target: "BLOCKED" });
  }
  if (fleet.status === "BLOCKED") {
    actions.push({ label: "Unblock", color: "#0CC25F", target: "ACTIVE" });
  }
  if (fleet.status !== "CLOSED") {
    actions.push({ label: "Close", color: "#6B7280", target: "CLOSED" });
  }

  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {actions.map((a) => (
        <Pressable
          key={a.target}
          onPress={() => {
            Alert.alert(
              `Change Status`,
              `Set "${fleet.name}" to ${a.target}?`,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: a.label,
                  style: a.target === "CLOSED" ? "destructive" : "default",
                  onPress: () => changeStatus(a.target),
                },
              ],
            );
          }}
          style={{
            backgroundColor: `${a.color}20`,
            borderWidth: 1,
            borderColor: `${a.color}40`,
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Text
            style={{
              color: a.color,
              fontFamily: "Jakarta-SemiBold",
              fontSize: 11,
            }}
          >
            {a.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────

export default function AdminFleets() {
  const [fleets, setFleets] = useState<FleetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  const fetchFleets = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));

    const res = await adminFetch<{
      fleets: FleetRow[];
      total: number;
    }>(`/api/admin/fleets?${params.toString()}`);
    if (res.data) {
      setFleets(res.data.fleets ?? []);
      setTotal(res.data.total ?? 0);
    }
    setLoading(false);
  }, [search, statusFilter, page]);

  useEffect(() => {
    fetchFleets();
  }, [fetchFleets]);

  const handleStatusChange = (fleetId: string, newStatus: string) => {
    setFleets((prev) =>
      prev.map((f) =>
        f.id === fleetId ? { ...f, status: newStatus as FleetRow["status"] } : f,
      ),
    );
  };

  const columns: AdminColumn<FleetRow>[] = [
    {
      key: "name",
      header: "Fleet",
      width: 200,
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
          {r.business_name && (
            <Text
              style={{
                color: colors.textSecondaryDark,
                fontFamily: "Jakarta-Regular",
                fontSize: 11,
                marginTop: 2,
              }}
            >
              {r.business_name}
            </Text>
          )}
        </View>
      ),
    },
    {
      key: "fleet_type",
      header: "Type",
      width: 80,
      sortable: true,
    },
    {
      key: "status",
      header: "Status",
      width: 100,
      sortable: true,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "vehicle_count",
      header: "Vehicles",
      width: 70,
      sortable: true,
    },
    {
      key: "driver_count",
      header: "Drivers",
      width: 70,
      sortable: true,
    },
    {
      key: "member_count",
      header: "Staff",
      width: 60,
      sortable: true,
    },
    {
      key: "subscription_status",
      header: "Subscription",
      width: 100,
      render: (r) => (
        <Text
          style={{
            color: colors.textSecondaryDark,
            fontFamily: "Jakarta-Regular",
            fontSize: 12,
          }}
        >
          {r.subscription_status ?? "None"}
        </Text>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      width: 100,
      sortable: true,
      render: (r) => (
        <Text
          style={{
            color: colors.textSecondaryDark,
            fontFamily: "Jakarta-Regular",
            fontSize: 12,
          }}
        >
          {new Date(r.created_at).toLocaleDateString()}
        </Text>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: 200,
      render: (r) => (
        <FleetActions fleet={r} onStatusChange={handleStatusChange} />
      ),
    },
  ];

  return (
    <AdminShell title="Fleet Management" subtitle="View and manage all fleets">
      {/* Search + filter bar */}
      <View
        style={{
          flexDirection: "row",
          marginBottom: 12,
          gap: 8,
          alignItems: "center",
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.darkSecondary,
            borderRadius: 8,
            padding: 8,
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearch(e.target.value)
            }
            style={{
              background: "transparent",
              color: colors.textPrimaryDark,
              border: "none",
              outline: "none",
              width: "100%",
              fontFamily: "Jakarta-Regular",
              fontSize: 14,
            }}
            placeholder="Search by name..."
          />
        </View>

        {/* Status filter pills */}
        {(["", "PENDING", "ACTIVE", "SUSPENDED", "BLOCKED", "CLOSED"] as const).map(
          (s) => (
            <Pressable
              key={s}
              onPress={() => {
                setStatusFilter(s);
                setPage(1);
              }}
              style={{
                backgroundColor:
                  statusFilter === s
                    ? colors.adminAccent
                    : colors.darkSecondary,
                borderRadius: 6,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor:
                  statusFilter === s ? colors.adminAccent : "#2A2D35",
              }}
            >
              <Text
                style={{
                  color:
                    statusFilter === s
                      ? colors.darkSurface
                      : colors.textSecondaryDark,
                  fontFamily:
                    statusFilter === s ? "Jakarta-SemiBold" : "Jakarta-Regular",
                  fontSize: 11,
                }}
              >
                {s || "All"}
              </Text>
            </Pressable>
          ),
        )}
      </View>

      {/* Fleet count */}
      <Text
        style={{
          color: colors.textSecondaryDark,
          fontFamily: "Jakarta-Regular",
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        {total} fleet{total !== 1 ? "s" : ""} total
      </Text>

      {/* Table */}
      <AdminTable
        columns={columns}
        rows={fleets}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="No fleets found"
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: setPage,
        }}
      />
    </AdminShell>
  );
}
