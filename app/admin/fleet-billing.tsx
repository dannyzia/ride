/**
 * Admin Fleet Billing History — list billing transactions per fleet.
 * Uses AdminShell + AdminTable + adminFetch pattern.
 */
import { useState, useEffect, useCallback } from "react";
import { Text } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

// ── Types ─────────────────────────────────────────────────────────────────

interface BillingRow {
  id: string;
  fleet_id: string;
  fleet_name: string;
  subscription_id: string | null;
  transaction_type: string;
  amount_bdt: number;
  currency: string;
  status: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatPaisa(p: number): string {
  return `৳${(p / 100).toLocaleString("en-BD")}`;
}

// ── Main screen ───────────────────────────────────────────────────────────

export default function AdminFleetBilling() {
  const [transactions, setTransactions] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<{
      transactions: BillingRow[];
      total: number;
    }>(`/api/admin/fleet-billing?page=${page}&limit=${PAGE_SIZE}`);
    if (res.data) {
      setTransactions(res.data.transactions ?? []);
      setTotal(res.data.total ?? 0);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns: AdminColumn<BillingRow>[] = [
    {
      key: "fleet_name",
      header: "Fleet",
      width: 160,
      sortable: true,
      render: (r) => (
        <Text
          style={{
            color: colors.textPrimaryDark,
            fontFamily: "Jakarta-SemiBold",
            fontSize: 13,
          }}
        >
          {r.fleet_name}
        </Text>
      ),
    },
    {
      key: "transaction_type",
      header: "Type",
      width: 120,
      sortable: true,
      render: (r) => (
        <Text
          style={{
            color: colors.textPrimaryDark,
            fontFamily: "Jakarta-Regular",
            fontSize: 12,
          }}
        >
          {r.transaction_type}
        </Text>
      ),
    },
    {
      key: "amount_bdt",
      header: "Amount",
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
          {formatPaisa(r.amount_bdt)}
        </Text>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 90,
      sortable: true,
      render: (r) => {
        const color =
          r.status === "completed"
            ? "#0CC25F"
            : r.status === "pending"
              ? "#F59E0B"
              : r.status === "failed"
                ? "#E31D1C"
                : colors.textSecondaryDark;
        return (
          <Text style={{ color, fontFamily: "Jakarta-SemiBold", fontSize: 12 }}>
            {r.status}
          </Text>
        );
      },
    },
    {
      key: "created_at",
      header: "Date",
      width: 120,
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
  ];

  return (
    <AdminShell
      title="Fleet Billing"
      subtitle="View fleet subscription billing history"
    >
      <Text
        style={{
          color: colors.textSecondaryDark,
          fontFamily: "Jakarta-Regular",
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        {total} transaction{total !== 1 ? "s" : ""}
      </Text>

      <AdminTable
        columns={columns}
        rows={transactions}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="No billing transactions yet"
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
