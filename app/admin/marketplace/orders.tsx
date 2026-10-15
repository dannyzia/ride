/**
 * Admin — Marketplace Order Browser (plan 27 §7 A1).
 *
 * Read-across every shop order/booking with the filter set the sidebar ordered
 * (state, shop, customer, courier, date). The ONLY action is force-cancel — a
 * dispute-handling decision that requires a reason code, reverses money that
 * moved, notifies the customer with the reason, and writes audit_logs. There is
 * deliberately no live-order editing here.
 *
 * Route: /admin/marketplace/orders
 * RBAC: admin.read to list, marketplace.write (owner/admin) to force-cancel.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { AdminModal } from "@/components/admin/AdminModal";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface OrderRow {
  id: string;
  status: string;
  order_kind: string;
  fulfillment: string;
  category: string;
  shop_id: string;
  shop_name: string | null;
  rider_user_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  courier_user_id: string | null;
  subtotal_bdt: number;
  delivery_fee_bdt: number | null;
  total_bdt: number;
  cancel_reason: string | null;
  created_at: string;
  delivered_at: string | null;
}

// Mirrors FORCE_CANCEL_REASON_CODES in app/api/admin/marketplace/orders+api.ts —
// the vocabulary is the contract, so the labels stay here and the enum there.
const REASON_CODES: { code: string; label: string }[] = [
  { code: "customer_request", label: "Customer request" },
  { code: "shop_unable_to_fulfil", label: "Shop unable to fulfil" },
  { code: "stock_unavailable", label: "Stock unavailable" },
  { code: "dispute_resolved", label: "Dispute resolved" },
  { code: "fraud_suspected", label: "Fraud suspected" },
  { code: "payment_failure", label: "Payment failure" },
  { code: "duplicate_order", label: "Duplicate order" },
  { code: "other", label: "Other" },
];

const STATUSES = [
  "all",
  "pending",
  "accepted",
  "preparing",
  "dispatched",
  "courier_assigned",
  "picked_up",
  "delivered",
  "cancelled",
  "refunded",
];

function formatPaisa(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `৳${(Number(value) / 100).toFixed(2)}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function MarketplaceOrdersScreen() {
  const toast = useAdminToast();
  const [status, setStatus] = useState("all");
  const [shopId, setShopId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<OrderRow | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (shopId.trim()) params.set("shop_id", shopId.trim());
    if (customerId.trim()) params.set("customer_id", customerId.trim());
    const { data, error, message } = await adminFetch<{ orders: OrderRow[] }>(
      `/api/admin/marketplace/orders?${params.toString()}`,
    );
    setLoading(false);
    if (error || !data) {
      setRows([]);
      toast.show(message || error || "Failed to load orders", "error");
      return;
    }
    setRows(data.orders);
  }, [status, shopId, customerId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const closeModal = () => {
    setTarget(null);
    setReasonCode("");
    setReasonText("");
    setInternalNote("");
  };

  const submitForceCancel = async () => {
    if (!target) return;
    if (!reasonCode) {
      toast.show("A reason code is required to force-cancel", "warning");
      return;
    }
    setBusy(true);
    const { data, error, message } = await adminFetch<{ status: string; reversed_bdt: number }>(
      "/api/admin/marketplace/orders",
      {
        method: "POST",
        body: JSON.stringify({
          action: "force_cancel",
          order_id: target.id,
          reason_code: reasonCode,
          reason_text: reasonText.trim() || undefined,
          internal_note: internalNote.trim() || undefined,
        }),
      },
    );
    setBusy(false);
    if (error || !data) {
      toast.show(message || error || "Force-cancel failed", "error");
      return;
    }
    closeModal();
    load();
    toast.show(
      data.reversed_bdt
        ? `Order ${data.status} — reversed ${formatPaisa(data.reversed_bdt)}`
        : `Order ${data.status}`,
      "success",
    );
  };

  const columns: AdminColumn<OrderRow>[] = [
    {
      key: "shop_name",
      header: "Shop",
      width: 180,
      render: (row) => (
        <Text style={styles.cellPrimary}>{row.shop_name ?? row.shop_id.slice(0, 8)}</Text>
      ),
    },
    {
      key: "customer_name",
      header: "Customer",
      width: 180,
      render: (row) => (
        <Text style={styles.cellText}>
          {row.customer_name ?? row.rider_user_id.slice(0, 8)}
          {"\n"}
          <Text style={styles.subText}>{row.customer_phone ?? "—"}</Text>
        </Text>
      ),
    },
    {
      key: "courier_user_id",
      header: "Courier",
      width: 130,
      render: (row) => (
        <Text style={styles.cellText}>
          {row.courier_user_id ? row.courier_user_id.slice(0, 8) : "—"}
        </Text>
      ),
    },
    {
      key: "status",
      header: "State",
      width: 150,
      render: (row) => (
        <Text style={styles.cellPrimary}>
          {row.status}
          {"\n"}
          <Text style={styles.subText}>
            {row.order_kind} · {row.fulfillment}
          </Text>
        </Text>
      ),
    },
    {
      key: "total_bdt",
      header: "Total",
      width: 110,
      render: (row) => <Text style={styles.cellText}>{formatPaisa(row.total_bdt)}</Text>,
    },
    {
      key: "created_at",
      header: "Placed",
      width: 170,
      render: (row) => <Text style={styles.cellText}>{formatDateTime(row.created_at)}</Text>,
    },
    {
      key: "cancel_reason",
      header: "Reason",
      width: 200,
      render: (row) => (
        <Text style={styles.subText} numberOfLines={3}>
          {row.cancel_reason ?? "—"}
        </Text>
      ),
    },
    {
      key: "id",
      header: "Action",
      width: 140,
      render: (row) => {
        if (row.status === "cancelled" || row.status === "refunded") {
          return <Text style={styles.subText}>resolved</Text>;
        }
        return (
          <Pressable
            style={styles.btnDanger}
            onPress={() => setTarget(row)}
           
           testID="admin.marketplace.orders.set-target">
            <Text style={styles.btnText}>Force cancel</Text>
          </Pressable>
        );
      },
    },
  ];

  return (
    <AdminShell
      title="Order Browser"
      subtitle="Read-across every marketplace order; force-cancel is the only action"
    >
      <View style={styles.filters}>
        {STATUSES.map((s) => (
          <Pressable
            key={s}
            onPress={() => setStatus(s)}
            style={[styles.filterChip, s === status && styles.filterChipActive]}
           
           testID="admin.marketplace.orders.set-status">
            <Text style={[styles.filterText, s === status && styles.filterTextActive]}>
              {s.replace(/_/g, " ")}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.searchRow}>
        <TextInput
          value={shopId}
          onChangeText={setShopId}
          placeholder="Shop UUID"
          placeholderTextColor={colors.textDisabledDark}
          style={styles.input}
          autoCapitalize="none"
         
         testID="admin.marketplace.orders.set-shop-id"/>
        <TextInput
          value={customerId}
          onChangeText={setCustomerId}
          placeholder="Customer UUID"
          placeholderTextColor={colors.textDisabledDark}
          style={styles.input}
          autoCapitalize="none"
         
         testID="admin.marketplace.orders.set-customer-id"/>
      </View>

      <AdminTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        emptyMessage="No orders match these filters"
        pagination={null}
      />

      <AdminModal
        visible={target !== null}
        title="Force cancel order"
        onClose={closeModal}
        footer={
          <>
            <Pressable style={styles.btnGhost} onPress={closeModal} testID="admin.marketplace.orders.close-modal">
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.btnDanger} onPress={submitForceCancel} disabled={busy} testID="admin.marketplace.orders.submit-force-cancel">
              <Text style={styles.btnText}>{busy ? "Working…" : "Force cancel"}</Text>
            </Pressable>
          </>
        }
      >
        <Text style={styles.modalHint}>
          A reason code is required. Money that already moved is reversed in the shop ledger, the
          customer is notified with the reason, and the decision is audited.
        </Text>
        <Text style={styles.fieldLabel}>Reason code</Text>
        <View style={styles.filters}>
          {REASON_CODES.map((c) => (
            <Pressable
              key={c.code}
              onPress={() => setReasonCode(c.code)}
              style={[styles.filterChip, c.code === reasonCode && styles.filterChipActive]}
             
             testID="admin.marketplace.orders.set-reason-code">
              <Text style={[styles.filterText, c.code === reasonCode && styles.filterTextActive]}>
                {c.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Reason (customer-visible)</Text>
        <TextInput
          value={reasonText}
          onChangeText={setReasonText}
          placeholder="Optional detail shown with the reason code"
          placeholderTextColor={colors.textDisabledDark}
          style={styles.input}
         
         testID="admin.marketplace.orders.set-reason-text"/>
        <Text style={styles.fieldLabel}>Internal note (admin-only)</Text>
        <TextInput
          value={internalNote}
          onChangeText={setInternalNote}
          placeholder="Never shown to the customer"
          placeholderTextColor={colors.textDisabledDark}
          style={styles.input}
         
         testID="admin.marketplace.orders.set-internal-note"/>
      </AdminModal>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2A2D35",
    backgroundColor: colors.darkSecondary,
  },
  filterChipActive: { backgroundColor: colors.adminAccent, borderColor: colors.adminAccent },
  filterText: { color: colors.textSecondaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 12 },
  filterTextActive: { color: colors.white },
  searchRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  input: {
    flex: 1,
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
  },
  cellPrimary: { color: colors.textPrimaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 13 },
  cellText: { color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 13 },
  subText: { color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11 },
  modalHint: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    marginBottom: 6,
  },
  fieldLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 12,
    marginBottom: 6,
  },
  btnDanger: {
    backgroundColor: colors.danger,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  btnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnGhostText: { color: colors.textSecondaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 13 },
  btnText: { color: colors.white, fontFamily: "Jakarta-SemiBold", fontSize: 13 },
});
