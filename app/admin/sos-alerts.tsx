import { useState, useEffect, useCallback, useRef } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
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
}

export default function SOSAlertsScreen() {
  const toast = useAdminToast();
  const [alerts, setAlerts] = useState<SOSAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<{ alerts: SOSAlert[] }>("/api/admin/sos-alerts");
    if (res.data) setAlerts(res.data.alerts ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  // F-15: live SOS stream. The initial HTTP fetch above still provides
  // history; this subscription only prepends NEW alerts as they arrive.
  const toastRef = useRef(toast);
  toastRef.current = toast;
  useEffect(() => {
    const unsubscribe = ensureAdminSocket((alert) => {
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
        };
        return [incoming, ...prev];
      });
      toastRef.current.show("New SOS alert", "error");
    });
    return unsubscribe;
  }, []);

  const ackAlert = async (alertId: string) => {
    const res = await adminFetch<{ success: boolean }>(`/api/admin/sos-alerts/${alertId}/ack`, {
      method: "POST", body: JSON.stringify({}), headers: { "Content-Type": "application/json" },
    });
    if (res.data?.success) { toast.show("Alert acknowledged", "success"); fetchAlerts(); }
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
      {loading ? (
        <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} />
      ) : (
        <AdminTable columns={columns} rows={alerts} rowKey={(r) => r.id} />
      )}
    </AdminShell>
  );
}
