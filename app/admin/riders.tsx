import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator, TextInput } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { AdminModal } from "@/components/admin/AdminModal";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { formatBdt, takaToPaisa } from "@/lib/money";
import { colors } from "@/theme/goRide";

interface Rider {
  id: string; name: string; phone: string; email: string | null;
  account_status: string; total_rides: number; total_spent_bdt: number;
  fraud_score: number; last_ride_at: string | null; created_at: string;
}

export default function AdminRiders() {
  const toast = useAdminToast();
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [refundTarget, setRefundTarget] = useState<Rider | null>(null);
  const [refundTaka, setRefundTaka] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchRiders = useCallback(async () => {
    setLoading(true);
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    const res = await adminFetch<{ riders: Rider[] }>(`/api/admin/riders${params}`);
    if (res.error) toast.show(res.message ?? res.error, "error");
    else setRiders(res.data?.riders ?? []);
    setLoading(false);
  }, [search, toast]);

  useEffect(() => { void fetchRiders(); }, [fetchRiders]);

  const setSuspended = async (rider: Rider, suspended: boolean) => {
    setBusyId(rider.id);
    const res = await adminFetch(`/api/admin/riders/${rider.id}/suspend`, {
      method: "POST",
      body: JSON.stringify({
        account_status: suspended ? "suspended" : "active",
        reason: suspended ? "Suspended from admin panel" : undefined,
      }),
    });
    if (res.error) toast.show(res.message ?? res.error, "error");
    else {
      toast.show(suspended ? `${rider.name} suspended` : `${rider.name} restored`, "success");
      void fetchRiders();
    }
    setBusyId(null);
  };

  const submitRefund = async () => {
    if (!refundTarget) return;
    const amount = takaToPaisa(refundTaka);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.show("Refund amount must be a positive number", "error");
      return;
    }
    if (!refundReason.trim()) {
      toast.show("A reason is required", "error");
      return;
    }
    setBusyId(refundTarget.id);
    const res = await adminFetch(`/api/admin/riders/${refundTarget.id}/refund`, {
      method: "POST",
      body: JSON.stringify({ amount_bdt: amount, reason: refundReason.trim() }),
    });
    if (res.error) toast.show(res.message ?? res.error, "error");
    else {
      toast.show(`Refunded ${formatBdt(amount)} to ${refundTarget.name}`, "success");
      setRefundTarget(null);
      setRefundTaka("");
      setRefundReason("");
      void fetchRiders();
    }
    setBusyId(null);
  };

  const columns: AdminColumn<Rider>[] = [
    { key: "name", header: "Name", width: 150 },
    { key: "phone", header: "Phone", width: 120 },
    { key: "total_rides", header: "Rides", width: 60 },
    { key: "total_spent_bdt", header: "Spent", render: (r) => formatBdt(r.total_spent_bdt ?? 0), width: 100 },
    { key: "account_status", header: "Status", width: 90 },
    { key: "created_at", header: "Joined", render: (r) => new Date(r.created_at).toLocaleDateString(), width: 100 },
    {
      key: "actions",
      header: "Actions",
      width: 170,
      render: (r) => (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          {busyId === r.id ? (
            <ActivityIndicator size="small" color={colors.adminAccent} />
          ) : (
            <>
              {r.account_status === "active" || r.account_status === "suspended" ? (
                <Pressable
                  onPress={() => void setSuspended(r, r.account_status !== "suspended")}
                 
               testID="admin.riders.set-suspended">
                <Text style={{
                  color: r.account_status === "suspended" ? colors.primary : colors.danger,
                  fontFamily: "Jakarta-Bold",
                  fontSize: 11,
                }}>
                  {r.account_status === "suspended" ? "Restore" : "Suspend"}
                </Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setRefundTarget(r)} testID="admin.riders.set-refund-target">
                <Text style={{ color: colors.primary, fontFamily: "Jakarta-Bold", fontSize: 11 }}>Refund</Text>
              </Pressable>
            </>
          )}
        </View>
      ),
    },
  ];

  return (
    <AdminShell title="Rider Management" subtitle="View and manage rider accounts">
      <View style={{ flexDirection: "row", marginBottom: 12 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name..."
          placeholderTextColor={colors.textSecondaryDark}
          style={{
            flex: 1,
            backgroundColor: colors.darkSecondary,
            color: colors.textPrimaryDark,
            borderRadius: 8,
            padding: 10,
            fontFamily: "Jakarta-Regular",
            fontSize: 14,
          }}
         
         testID="admin.riders.set-search"/>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} />
      ) : (
        <AdminTable columns={columns} rows={riders} rowKey={(r) => r.id} emptyMessage="No riders found" />
      )}

      <AdminModal
        visible={refundTarget !== null}
        title={`Refund ${refundTarget?.name ?? ""}`}
        onClose={() => setRefundTarget(null)}
      >
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>
            Amount (BDT) — credited to the rider wallet
          </Text>
          <TextInput
            value={refundTaka}
            onChangeText={setRefundTaka}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textSecondaryDark}
            style={{ backgroundColor: colors.darkSecondary, color: colors.textPrimaryDark, borderRadius: 8, padding: 10, fontFamily: "Jakarta-Regular", fontSize: 14 }}
           
           testID="admin.riders.set-refund-taka"/>
          <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>
            Reason (required, audited)
          </Text>
          <TextInput
            value={refundReason}
            onChangeText={setRefundReason}
            placeholder="Why is this refund being issued?"
            placeholderTextColor={colors.textSecondaryDark}
            style={{ backgroundColor: colors.darkSecondary, color: colors.textPrimaryDark, borderRadius: 8, padding: 10, fontFamily: "Jakarta-Regular", fontSize: 14 }}
           
           testID="admin.riders.set-refund-reason"/>
          <Pressable
            onPress={() => void submitRefund()}
            style={{ paddingVertical: 12, backgroundColor: colors.adminAccent, borderRadius: 8, alignItems: "center" }}
           
           testID="admin.riders.submit-refund">
            <Text style={{ color: "#000", fontFamily: "Jakarta-Bold", fontSize: 14 }}>Issue Refund</Text>
          </Pressable>
        </View>
      </AdminModal>
    </AdminShell>
  );
}
