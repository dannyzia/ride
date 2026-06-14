// F15-UI-13 Monitoring & Disputes
// Three tabs: Dispatch Log (per-ride offer history), Ride Chat (message
// history), Driver Economics (cost-per-ride and negative earners).
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";

type Tab = "dispatch" | "chat" | "economics";

// ---------- Dispatch log shapes ----------
interface CallLedgerEvent {
  event_type: string;
  delta: number | string | null;
  balance_after: number | string | null;
  reason: string | null;
  created_at: string;
}

interface DispatchOfferRow {
  id: string;
  driver_id: string;
  driver_name: string | null;
  batch_index: number;
  sent_at: string;
  fetch_confirmed_at: string | null;
  responded_at: string | null;
  outcome: string | null;
  rejection_reason: string | null;
  filtered_reason: string | null;
  call_ledger_event: CallLedgerEvent | null;
}

interface DispatchLogResponse {
  ride_id: string;
  offers: DispatchOfferRow[];
  total_offers: number;
  accepted_by: string | null;
}

// ---------- Chat shapes ----------
interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string | null;
  sender_role: string;
  content: string;
  created_at: string;
}

interface ChatResponse {
  ride_id: string;
  ride_status: string;
  ride_created_at: string;
  rider: { name: string | null; phone: string | null } | null;
  driver: { id: string; name: string | null; phone: string | null } | null;
  messages: ChatMessage[];
  message_count: number;
}

// ---------- Economics shapes ----------
interface DriverEconRow {
  driver_id: string;
  driver_name: string | null;
  vehicle_type: string;
  status: string;
  subscription_cost_bdt: number | null;
  completed_rides_count: number;
  cost_per_ride_bdt: number | null;
  calls_remaining: number | null;
  subscription_expires_at: string | null;
  is_negative_earner: boolean;
}

interface EconResponse {
  drivers: DriverEconRow[];
  total: number;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "dispatch", label: "Dispatch Log" },
  { key: "chat", label: "Ride Chat" },
  { key: "economics", label: "Driver Economics" },
];

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatPaisa(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `৳${(Number(value) / 100).toFixed(2)}`;
}

function labelForVehicle(key: string): string {
  return VEHICLE_TYPES.find((v) => v.key === key)?.display_en ?? key;
}

function outcomeColor(outcome: string | null): string {
  switch (outcome) {
    case "accepted":
      return colors.primary;
    case "rejected":
      return colors.danger;
    case "expired":
      return colors.amber;
    case "delivered":
      return colors.adminAccent;
    case "timeout":
      return colors.amber;
    default:
      return colors.grayMedium;
  }
}

export default function MonitoringScreen() {
  const toast = useAdminToast();
  const [tab, setTab] = useState<Tab>("dispatch");

  // Dispatch log state
  const [rideIdInput, setRideIdInput] = useState("");
  const [dispatchLog, setDispatchLog] = useState<DispatchLogResponse | null>(
    null,
  );
  const [dispatchLoading, setDispatchLoading] = useState(false);

  // Chat state
  const [chatRideId, setChatRideId] = useState("");
  const [chat, setChat] = useState<ChatResponse | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  // Economics state
  const [econ, setEcon] = useState<DriverEconRow[]>([]);
  const [econLoading, setEconLoading] = useState(false);

  const fetchDispatchLog = useCallback(
    async (rideId: string) => {
      if (!rideId.trim()) {
        toast.show("Enter a ride ID", "warning");
        return;
      }
      setDispatchLoading(true);
      const {
        data,
        error,
        message,
        status: httpStatus,
      } = await adminFetch<DispatchLogResponse>(
        `/api/admin/dispatch-log/${encodeURIComponent(rideId.trim())}`,
        { method: "GET" },
      );
      setDispatchLoading(false);
      if (error || !data) {
        setDispatchLog(null);
        toast.show(
          httpStatus === 0
            ? "Network error"
            : message || error || "Lookup failed",
          "error",
        );
        return;
      }
      setDispatchLog(data);
      toast.show(
        `${data.total_offers} offer(s) · ${
          data.accepted_by ? "accepted" : "no acceptance"
        }`,
        "info",
      );
    },
    [toast],
  );

  const fetchChat = useCallback(
    async (rideId: string) => {
      if (!rideId.trim()) {
        toast.show("Enter a ride ID", "warning");
        return;
      }
      setChatLoading(true);
      const {
        data,
        error,
        message,
        status: httpStatus,
      } = await adminFetch<ChatResponse>(
        `/api/admin/ride/${encodeURIComponent(rideId.trim())}/chat`,
        { method: "GET" },
      );
      setChatLoading(false);
      if (error || !data) {
        setChat(null);
        toast.show(
          httpStatus === 0
            ? "Network error"
            : message || error || "Lookup failed",
          "error",
        );
        return;
      }
      setChat(data);
      toast.show(`${data.message_count} message(s)`, "info");
    },
    [toast],
  );

  const fetchEcon = useCallback(async () => {
    setEconLoading(true);
    const {
      data,
      error,
      status: httpStatus,
    } = await adminFetch<EconResponse>("/api/admin/driver-economics", {
      method: "GET",
    });
    setEconLoading(false);
    if (error || !data) {
      setEcon([]);
      if (httpStatus !== 0) {
        toast.show(`Failed to load economics: ${error ?? "unknown"}`, "error");
      }
      return;
    }
    setEcon(data.drivers);
  }, [toast]);

  // Auto-fetch economics on tab visit (only once per mount is fine; refetch on tab switch)
  useEffect(() => {
    if (tab === "economics" && econ.length === 0 && !econLoading) {
      fetchEcon();
    }
  }, [tab, econ.length, econLoading, fetchEcon]);

  const dispatchColumns: AdminColumn<DispatchOfferRow>[] = [
    {
      key: "driver_name",
      header: "Driver",
      width: 180,
      render: (row) => (
        <Text style={styles.cellPrimary}>
          {row.driver_name ?? row.driver_id.slice(0, 8)}
        </Text>
      ),
    },
    {
      key: "batch_index",
      header: "Batch",
      width: 70,
      render: (row) => <Text style={styles.cellText}>#{row.batch_index}</Text>,
    },
    {
      key: "sent_at",
      header: "Sent",
      width: 170,
      render: (row) => (
        <Text style={styles.cellText}>{formatDateTime(row.sent_at)}</Text>
      ),
    },
    {
      key: "fetch_confirmed_at",
      header: "Fetched",
      width: 170,
      render: (row) => (
        <Text style={styles.cellText}>
          {formatDateTime(row.fetch_confirmed_at)}
        </Text>
      ),
    },
    {
      key: "responded_at",
      header: "Responded",
      width: 170,
      render: (row) => (
        <Text style={styles.cellText}>{formatDateTime(row.responded_at)}</Text>
      ),
    },
    {
      key: "outcome",
      header: "Outcome",
      width: 120,
      render: (row) => (
        <View style={{ gap: 4 }}>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: outcomeColor(row.outcome) + "22",
              },
            ]}
          >
            <Text
              style={[styles.badgeText, { color: outcomeColor(row.outcome) }]}
            >
              {row.outcome ?? "—"}
            </Text>
          </View>
          {row.rejection_reason ? (
            <Text style={styles.subText} numberOfLines={2}>
              {row.rejection_reason}
            </Text>
          ) : null}
          {row.filtered_reason ? (
            <Text
              style={[styles.subText, { color: colors.amber }]}
              numberOfLines={2}
            >
              filtered: {row.filtered_reason}
            </Text>
          ) : null}
        </View>
      ),
    },
    {
      key: "call_ledger_event",
      header: "Ledger Event",
      width: 180,
      render: (row) => {
        const ev = row.call_ledger_event;
        if (!ev) return <Text style={styles.cellText}>—</Text>;
        return (
          <View style={{ gap: 2 }}>
            <Text style={styles.cellPrimary}>{ev.event_type}</Text>
            <Text style={styles.subText}>
              Δ {typeof ev.delta === "number" ? ev.delta : (ev.delta ?? "—")}
              {ev.balance_after !== null && ev.balance_after !== undefined
                ? ` · bal ${ev.balance_after}`
                : ""}
            </Text>
            <Text style={styles.subText}>{formatDateTime(ev.created_at)}</Text>
          </View>
        );
      },
    },
  ];

  // Median cost/ride for the "expensive" highlight (optional polish).
  const medianCost = computeMedian(
    econ
      .map((e) => e.cost_per_ride_bdt)
      .filter((v): v is number => v !== null && v > 0),
  );

  const econColumns: AdminColumn<DriverEconRow>[] = [
    {
      key: "driver_name",
      header: "Driver",
      width: 200,
      render: (row) => (
        <View style={{ gap: 2 }}>
          <Text style={styles.cellPrimary}>
            {row.driver_name ?? row.driver_id.slice(0, 8)}
          </Text>
          {row.is_negative_earner ? (
            <Text style={[styles.subText, { color: colors.danger }]}>
              negative earner
            </Text>
          ) : null}
        </View>
      ),
    },
    {
      key: "vehicle_type",
      header: "Vehicle",
      width: 140,
      render: (row) => (
        <Text style={styles.cellText}>{labelForVehicle(row.vehicle_type)}</Text>
      ),
    },
    {
      key: "completed_rides_count",
      header: "Rides",
      width: 90,
      sortable: true,
      render: (row) => (
        <Text style={styles.cellText}>{row.completed_rides_count}</Text>
      ),
    },
    {
      key: "cost_per_ride_bdt",
      header: "Cost / Ride",
      width: 110,
      sortable: true,
      render: (row) => {
        const expensive =
          row.cost_per_ride_bdt !== null &&
          medianCost !== null &&
          row.cost_per_ride_bdt > medianCost * 2;
        return (
          <Text
            style={[
              styles.cellText,
              expensive && {
                color: colors.danger,
                fontFamily: "Jakarta-SemiBold",
              },
            ]}
          >
            {formatPaisa(row.cost_per_ride_bdt)}
          </Text>
        );
      },
    },
    {
      key: "calls_remaining",
      header: "Calls Left",
      width: 110,
      sortable: true,
      render: (row) => (
        <Text style={styles.cellText}>{row.calls_remaining ?? "—"}</Text>
      ),
    },
    {
      key: "subscription_cost_bdt",
      header: "Sub. Cost",
      width: 120,
      render: (row) => (
        <Text style={styles.cellText}>
          {formatPaisa(row.subscription_cost_bdt)}
        </Text>
      ),
    },
    {
      key: "subscription_expires_at",
      header: "Expires",
      width: 170,
      render: (row) => (
        <Text style={styles.cellText}>
          {formatDateTime(row.subscription_expires_at)}
        </Text>
      ),
    },
  ];

  return (
    <AdminShell
      title="Monitoring & Disputes"
      subtitle="Dispatch forensics, ride chat history, driver economics"
      actions={
        tab === "economics" ? (
          <Pressable style={styles.refreshBtn} onPress={fetchEcon}>
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </Pressable>
        ) : null
      }
    >
      <View style={styles.tabsRow}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tabChip, active && styles.tabChipActive]}
            >
              <Text
                style={[styles.tabChipText, active && styles.tabChipTextActive]}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === "dispatch" ? (
        <View style={{ gap: 14 }}>
          <View style={styles.searchRow}>
            <TextInput
              value={rideIdInput}
              onChangeText={setRideIdInput}
              placeholder="Ride UUID"
              placeholderTextColor={colors.textDisabledDark}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.searchBtn, dispatchLoading && styles.btnDisabled]}
              onPress={() => fetchDispatchLog(rideIdInput)}
              disabled={dispatchLoading}
            >
              {dispatchLoading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.searchBtnText}>Lookup</Text>
              )}
            </Pressable>
          </View>

          {dispatchLog ? (
            <View style={{ gap: 10 }}>
              <View style={styles.summaryBar}>
                <SummaryItem
                  label="Ride"
                  value={dispatchLog.ride_id.slice(0, 8) + "…"}
                />
                <SummaryItem
                  label="Offers"
                  value={String(dispatchLog.total_offers)}
                />
                <SummaryItem
                  label="Accepted"
                  value={
                    dispatchLog.accepted_by
                      ? dispatchLog.accepted_by.slice(0, 8) + "…"
                      : "no"
                  }
                  valueColor={
                    dispatchLog.accepted_by
                      ? colors.primary
                      : colors.textSecondaryDark
                  }
                />
              </View>

              <AdminTable
                columns={dispatchColumns}
                rows={dispatchLog.offers}
                rowKey={(row) => row.id}
                loading={dispatchLoading}
                emptyMessage="No dispatch offers for this ride"
                pagination={null}
              />
            </View>
          ) : dispatchLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.adminAccent} />
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={styles.hintText}>
                Enter a ride UUID to view its dispatch offer log.
              </Text>
            </View>
          )}
        </View>
      ) : null}

      {tab === "chat" ? (
        <View style={{ gap: 14 }}>
          <View style={styles.searchRow}>
            <TextInput
              value={chatRideId}
              onChangeText={setChatRideId}
              placeholder="Ride UUID"
              placeholderTextColor={colors.textDisabledDark}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.searchBtn, chatLoading && styles.btnDisabled]}
              onPress={() => fetchChat(chatRideId)}
              disabled={chatLoading}
            >
              {chatLoading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.searchBtnText}>Lookup</Text>
              )}
            </Pressable>
          </View>

          {chat ? (
            <View style={{ gap: 12 }}>
              <View style={styles.summaryBar}>
                <SummaryItem
                  label="Ride"
                  value={chat.ride_id.slice(0, 8) + "…"}
                />
                <SummaryItem label="Status" value={chat.ride_status} />
                <SummaryItem label="Rider" value={chat.rider?.name ?? "—"} />
                <SummaryItem label="Driver" value={chat.driver?.name ?? "—"} />
                <SummaryItem
                  label="Messages"
                  value={String(chat.message_count)}
                />
              </View>

              {chat.messages.length === 0 ? (
                <View style={styles.center}>
                  <Text style={styles.hintText}>
                    No messages in this ride conversation.
                  </Text>
                </View>
              ) : (
                <ScrollView style={styles.chatScroll}>
                  <View style={styles.chatList}>
                    {chat.messages.map((m) => (
                      <View
                        key={m.id}
                        style={[
                          styles.msgBubble,
                          m.sender_role === "support" ||
                          m.sender_role === "admin"
                            ? styles.msgBubbleAccent
                            : styles.msgBubblePlain,
                        ]}
                      >
                        <View style={styles.msgHeader}>
                          <Text style={styles.msgName}>
                            {m.sender_name ?? m.sender_id.slice(0, 8)}
                          </Text>
                          <View
                            style={[
                              styles.roleBadge,
                              {
                                backgroundColor:
                                  roleColor(m.sender_role) + "22",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.roleBadgeText,
                                { color: roleColor(m.sender_role) },
                              ]}
                            >
                              {m.sender_role}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.msgContent}>{m.content}</Text>
                        <Text style={styles.msgTime}>
                          {formatDateTime(m.created_at)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          ) : chatLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.adminAccent} />
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={styles.hintText}>
                Enter a ride UUID to view its chat history.
              </Text>
            </View>
          )}
        </View>
      ) : null}

      {tab === "economics" ? (
        <AdminTable
          columns={eColumns(econColumns)}
          rows={econ}
          rowKey={(row) => row.driver_id}
          loading={econLoading}
          emptyMessage="No active/temporary drivers"
          pagination={null}
        />
      ) : null}
    </AdminShell>
  );
}

// Wrapper to satisfy TS generic inference without changing the columns array.
function eColumns<T>(cols: AdminColumn<T>[]): AdminColumn<T>[] {
  return cols;
}

function SummaryItem({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          valueColor ? { color: valueColor } : undefined,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function roleColor(role: string): string {
  switch (role) {
    case "rider":
      return colors.adminAccent;
    case "driver":
      return colors.primary;
    case "support":
    case "admin":
      return colors.amber;
    default:
      return colors.grayMedium;
  }
}

const styles = StyleSheet.create({
  tabsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2A2D35",
    backgroundColor: colors.darkSecondary,
  },
  tabChipActive: {
    backgroundColor: colors.adminAccent,
    borderColor: colors.adminAccent,
  },
  tabChipText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  tabChipTextActive: {
    color: colors.white,
  },
  searchRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
  },
  searchInput: {
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
  searchBtn: {
    backgroundColor: colors.adminAccent,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  summaryBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    backgroundColor: colors.darkSecondary,
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 10,
    padding: 12,
  },
  summaryItem: {
    gap: 2,
  },
  summaryLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summaryValue: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  cellPrimary: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  cellText: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  subText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  center: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  hintText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  refreshBtn: {
    backgroundColor: colors.adminAccent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  chatScroll: {
    maxHeight: 560,
    backgroundColor: colors.darkSecondary,
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 12,
  },
  chatList: {
    padding: 14,
    gap: 10,
  },
  msgBubble: {
    borderRadius: 10,
    padding: 12,
    gap: 4,
    maxWidth: "85%",
  },
  msgBubblePlain: {
    backgroundColor: "#181A20",
    alignSelf: "flex-start",
  },
  msgBubbleAccent: {
    backgroundColor: "rgba(100,181,246,0.10)",
    alignSelf: "flex-end",
  },
  msgHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  msgName: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  roleBadgeText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  msgContent: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 2,
  },
  msgTime: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 10,
  },
});
