import { useState, useEffect, useCallback, useRef } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { ensureAdminSocket } from "@/lib/adminSocket";
import { colors } from "@/theme/goRide";

interface SOSAlert {
  id: string;
  user_id: string;
  role: string;
  latitude: string;
  longitude: string;
  message: string | null;
  status: string;
  created_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

const PAGE_SIZE = 50;
const STATUS_OPTIONS = ["all", "open", "acknowledged", "resolved"] as const;

type StatusFilter = (typeof STATUS_OPTIONS)[number];

export default function SOSAlertsScreen() {
  const toast = useAdminToast();
  const [alerts, setAlerts] = useState<SOSAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const fetchAlerts = useCallback(async (p: number, status: StatusFilter) => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String((p - 1) * PAGE_SIZE),
    });
    if (status !== "all") params.set("status", status);
    const res = await adminFetch<{ alerts: SOSAlert[]; total: number }>(
      `/api/admin/sos-alerts?${params.toString()}`,
    );
    if (res.data) {
      setAlerts(res.data.alerts ?? []);
      setTotal(res.data.total ?? 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAlerts(page, statusFilter); }, [page, statusFilter, fetchAlerts]);

  // F-15: live SOS stream. The initial HTTP fetch above still provides
  // history; this subscription only prepends NEW alerts as they arrive
  // when viewing page 1 with no filter (so stale pages aren't polluted).
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const pageRef = useRef(page);
  pageRef.current = page;
  const filterRef = useRef(statusFilter);
  filterRef.current = statusFilter;
  useEffect(() => {
    const unsubscribe = ensureAdminSocket((alert) => {
      // Only prepend if on page 1 and showing all (most common live view)
      if (pageRef.current === 1 && filterRef.current === "all") {
        setAlerts((prev) => {
          if (prev.some((a) => a.id === alert.id)) return prev;
          const incoming: SOSAlert = {
            id: alert.id,
            user_id: alert.user_id,
            role: alert.role,
            latitude: alert.latitude,
            longitude: alert.longitude,
            message: alert.message,
            status: "open",
            created_at: alert.created_at,
            acknowledged_by: null,
            acknowledged_at: null,
          };
          return [incoming, ...prev];
        });
      }
      toastRef.current.show("New SOS alert", "error");
    });
    return unsubscribe;
  }, []);

  const ackAlert = async (alertId: string) => {
    const res = await adminFetch<{ success: boolean }>(`/api/admin/sos-alerts/${alertId}/ack`, {
      method: "POST", body: JSON.stringify({}), headers: { "Content-Type": "application/json" },
    });
    if (res.data?.success) { toast.show("Alert acknowledged", "success"); fetchAlerts(page, statusFilter); }
    else { toast.show(res.error ?? "Failed", "error"); }
  };

  const columns: AdminColumn<SOSAlert>[] = [
    { key: "created_at", header: "Time", render: (r) => new Date(r.created_at).toLocaleString(), width: 160 },
    { key: "user_id", header: "User", render: (r) => r.user_id.slice(0, 8), width: 100 },
    { key: "role", header: "Role", width: 60 },
    { key: "status", header: "Status", render: (r) => r.status ?? "open", width: 80 },
    { key: "message", header: "Message", render: (r) => r.message ?? "—", width: 180 },
    { key: "id", header: "", render: (r) => (
      r.status !== "acknowledged" ? (
        <Pressable onPress={() => ackAlert(r.id)} style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.danger, borderRadius: 6 }}>
          <Text style={{ color: "#FFF", fontFamily: "Jakarta-Bold", fontSize: 11 }}>Acknowledge</Text>
        </Pressable>
      ) : null
    ), width: 100 },
  ];

  return (
    <AdminShell title="SOS Alerts" subtitle="Emergency alerts from users">
      {/* Status filter */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 12,
          gap: 6,
          flexWrap: "wrap",
        }}
        accessibilityRole="tablist"
        accessibilityLabel="Filter alerts by status"
      >
        <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 13, marginRight: 4 }}>
          Status:
        </Text>
        {STATUS_OPTIONS.map((s) => {
          const active = statusFilter === s;
          const label = s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1);
          return (
            <Pressable
              key={s}
              onPress={() => { setStatusFilter(s); setPage(1); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Filter by ${label}`}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 6,
                backgroundColor: active ? colors.adminAccent : "#2A2D35",
              }}
            >
              <Text
                style={{
                  color: active ? colors.white : colors.textSecondaryDark,
                  fontFamily: "Jakarta-SemiBold",
                  fontSize: 12,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} />
      ) : (
        <AdminTable
          columns={columns}
          rows={alerts}
          rowKey={(r) => r.id}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total,
            onPageChange: setPage,
          }}
        />
      )}
    </AdminShell>
  );
}
