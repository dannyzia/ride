import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { AdminModal } from "@/components/admin/AdminModal";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface Ticket {
  id: string;
  user_id: string;
  assigned_to: string | null;
  category: string;
  subject: string | null;
  status: string;
  priority: string;
  created_at: string;
  user_name: string | null;
  user_phone: string | null;
}

interface TicketReply {
  id: string;
  author_id: string;
  is_internal: boolean;
  message: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  open: colors.amber,
  in_progress: colors.adminAccent,
  resolved: colors.primary,
  closed: colors.grayMedium,
};

export default function AdminSupport() {
  const toast = useAdminToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<TicketReply[]>([]);
  const [replyText, setReplyText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [assignInput, setAssignInput] = useState("");

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    const params = statusFilter ? `?status=${statusFilter}` : "";
    const res = await adminFetch<{ tickets: Ticket[] }>(`/api/admin/tickets${params}`);
    if (res.data) setTickets(res.data.tickets ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const openTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setReplies([]);
    setReplyText("");
    setAssignInput("");
    setModalVisible(true);
    const res = await adminFetch<{ replies: TicketReply[] }>(`/api/admin/tickets/${ticket.id}/replies`);
    if (res.data) setReplies(res.data.replies ?? []);
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedTicket || sending) return;
    setSending(true);
    const res = await adminFetch<{ success: boolean }>(`/api/admin/tickets/${selectedTicket.id}/reply`, {
      method: "POST",
      body: JSON.stringify({ message: replyText.trim(), is_internal: isInternal }),
      headers: { "Content-Type": "application/json" },
    });
    if (res.data?.success) {
      toast.show("Reply sent", "success");
      setReplyText("");
      setReplies([...replies, { id: "new", author_id: "", is_internal: isInternal, message: replyText.trim(), created_at: new Date().toISOString() }]);
    } else {
      toast.show(res.error ?? "Failed to send reply", "error");
    }
    setSending(false);
  };

  const columns: AdminColumn<Ticket>[] = [
    { key: "created_at", header: "Date", render: (r) => new Date(r.created_at).toLocaleDateString(), width: 100 },
    { key: "subject", header: "Subject", render: (r) => (r.subject ?? r.category).slice(0, 40), width: 200 },
    { key: "user_name", header: "User", render: (r) => `${r.user_name ?? "—"} (${r.user_phone ?? ""})`, width: 150 },
    { key: "status", header: "Status", render: (r) => (
      <Text style={{ color: STATUS_COLORS[r.status] ?? colors.textSecondaryDark, fontFamily: "Jakarta-Bold", fontSize: 12 }}>{r.status}</Text>
    ), width: 90 },
    { key: "priority", header: "Priority", render: (r) => (
      <Text style={{ color: r.priority === "high" || r.priority === "urgent" ? colors.danger : colors.textSecondaryDark, fontFamily: "Jakarta-Bold", fontSize: 12 }}>{r.priority}</Text>
    ), width: 80 },
  ];

  return (
    <AdminShell title="Support Tickets" subtitle="Manage rider & driver support requests">
      <View style={{ flexDirection: "row", marginBottom: 12, gap: 8 }}>
        {["", "open", "in_progress", "resolved", "closed"].map((s) => (
          <Pressable key={s} onPress={() => setStatusFilter(s)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: statusFilter === s ? colors.adminAccent : colors.darkSecondary }}>
            <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 12 }}>{s || "All"}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} />
      ) : (
        <AdminTable columns={columns} rows={tickets} rowKey={(r) => r.id} onRowPress={(r) => openTicket(r)} />
      )}

      <AdminModal visible={modalVisible} title={`Ticket: ${selectedTicket?.subject ?? selectedTicket?.category ?? ""}`} onClose={() => setModalVisible(false)}>
        <ScrollView style={{ maxHeight: 400 }}>
          <View style={{ marginBottom: 12, padding: 12, backgroundColor: colors.darkSecondary, borderRadius: 8 }}>
            <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>
              From: {selectedTicket?.user_name ?? "Unknown"} ({selectedTicket?.user_phone ?? "—"})
              {"\n"}Category: {selectedTicket?.category}
              {"\n"}Status: {selectedTicket?.status}
              {"\n"}Assigned: {selectedTicket?.assigned_to ?? "—"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
              <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11 }}>Assign:</Text>
              <TextInput
                style={{ flex: 1, backgroundColor: colors.darkSecondary, color: colors.textPrimaryDark, borderRadius: 6, padding: 8, fontFamily: "Jakarta-Regular", fontSize: 11 }}
                placeholder="Enter admin user UUID"
                placeholderTextColor={colors.textSecondaryDark}
                value={assignInput}
                onChangeText={setAssignInput}
              />
              <Pressable
                onPress={async () => {
                  const trimmed = assignInput.trim();
                  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                  if (!uuidRegex.test(trimmed)) { toast.show("Please enter a valid UUID", "error"); return; }
                  const res = await adminFetch<{ success: boolean }>(`/api/admin/tickets/${selectedTicket!.id}/assign`, {
                    method: "POST", body: JSON.stringify({ assigned_to: trimmed }), headers: { "Content-Type": "application/json" },
                  });
                  if (res.data?.success) { toast.show("Ticket assigned", "success"); setAssignInput(""); openTicket(selectedTicket!); }
                  else { toast.show(res.error ?? "Failed to assign", "error"); }
                }}
                style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.adminAccent, borderRadius: 6 }}
              >
                <Text style={{ color: "#000", fontFamily: "Jakarta-Bold", fontSize: 11 }}>Assign</Text>
              </Pressable>
            </View>
          </View>
          {replies.map((r) => (
            <View key={r.id} style={{ padding: 10, backgroundColor: r.is_internal ? "#2A1F1F" : colors.darkSecondary, borderRadius: 8, marginBottom: 8 }}>
              <Text style={{ color: r.is_internal ? colors.amber : colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11 }}>
                {r.is_internal ? "[INTERNAL] " : ""}{new Date(r.created_at).toLocaleString()}
              </Text>
              <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 13, marginTop: 4 }}>{r.message}</Text>
            </View>
          ))}
          <View style={{ marginTop: 12 }}>
            <TextInput style={{ backgroundColor: colors.darkSecondary, color: colors.textPrimaryDark, borderRadius: 8, padding: 10, minHeight: 80, fontFamily: "Jakarta-Regular", fontSize: 13, textAlignVertical: "top" }}
              value={replyText} onChangeText={setReplyText} placeholder="Type a reply..." placeholderTextColor={colors.textSecondaryDark} multiline />
            <View style={{ flexDirection: "row", marginTop: 8, alignItems: "center", gap: 12 }}>
              <Pressable onPress={() => setIsInternal(!isInternal)}
                style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: isInternal ? colors.amber : colors.darkSecondary }}>
                <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 11 }}>{isInternal ? "Internal" : "External"}</Text>
              </Pressable>
              <Pressable onPress={sendReply} disabled={sending || !replyText.trim()}
                style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.adminAccent, opacity: sending ? 0.6 : 1 }}>
                <Text style={{ color: "#000", fontFamily: "Jakarta-Bold", fontSize: 13 }}>{sending ? "Sending..." : "Send"}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </AdminModal>
    </AdminShell>
  );
}
