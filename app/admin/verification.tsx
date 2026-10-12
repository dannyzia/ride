/**
 * Admin Verification — §7 queue for the three verification-gated launch roles
 * (Shop Owner, Fleet Owner, Delivery Man), modelled on the driver-documents
 * queue. Approve makes the role live; Reject stores the reason, which the
 * applicant sees in-app and can resubmit against (R6).
 *
 * Route: /admin/verification
 * RBAC: the list is admin.read; approve/reject are marketplace.write
 * (owner/admin only — ops_manager and moderator are read-only here, §7 A2).
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, ActivityIndicator, Pressable, TextInput, Alert, Linking } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

type Kind = "shop" | "fleet" | "delivery_man";

interface VerificationDoc {
  label: string;
  url: string | null;
}

interface PendingRow {
  id: string;
  applicant: { user_id: string; name: string; phone: string | null };
  status: string;
  label: string;
  documents: VerificationDoc[];
  created_at: string;
}

// F-30 structured rejection: the code pins the failure class, `field` names
// the document/field that failed, `example` shows an acceptable document —
// the applicant resubmits against exactly these (F-03).
const REJECT_CODES: { code: string; label: string }[] = [
  { code: "unreadable", label: "Unreadable" },
  { code: "expired", label: "Expired" },
  { code: "mismatch", label: "Info mismatch" },
  { code: "incomplete", label: "Incomplete" },
  { code: "wrong_document", label: "Wrong document" },
];

const KINDS: { key: Kind; label: string }[] = [
  { key: "shop", label: "Shops" },
  { key: "fleet", label: "Fleets" },
  { key: "delivery_man", label: "Delivery Men" },
];

export default function AdminVerification() {
  const [kind, setKind] = useState<Kind>("shop");
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectCode, setRejectCode] = useState("");
  const [rejectField, setRejectField] = useState("");
  const [rejectExample, setRejectExample] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const resetRejectForm = () => {
    setRejectingId(null);
    setRejectReason("");
    setRejectCode("");
    setRejectField("");
    setRejectExample("");
    setRejectNote("");
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<{ pending: PendingRow[] }>(
      `/api/admin/verification/pending?kind=${kind}`,
    );
    setRows(res.data?.pending ?? []);
    setLoading(false);
  }, [kind]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const handleApprove = (row: PendingRow) => {
    Alert.alert(
      "Approve",
      `Approve "${row.applicant.name}"? They go live immediately.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          onPress: async () => {
            setBusyId(row.id);
            const res = await adminFetch(`/api/admin/verification/${kind}/${row.id}/approve`, {
              method: "POST",
            });
            setBusyId(null);
            if (res.error) {
              Alert.alert("Error", res.message ?? res.error);
            } else {
              removeRow(row.id);
            }
          },
        },
      ],
    );
  };

  const submitReject = async (row: PendingRow) => {
    const reason = rejectReason.trim();
    const field = rejectField.trim();
    const example = rejectExample.trim();
    if (reason.length < 5 || !rejectCode || field.length < 2 || example.length < 5) {
      Alert.alert(
        "Structured reason required",
        "Pick a code and fill the failed field + an example of an acceptable document — the applicant resubmits against exactly these.",
      );
      return;
    }
    setBusyId(row.id);
    const res = await adminFetch(`/api/admin/verification/${kind}/${row.id}/reject`, {
      method: "POST",
      body: JSON.stringify({
        reason,
        code: rejectCode,
        field,
        example,
        internal_note: rejectNote.trim() || undefined,
      }),
    });
    setBusyId(null);
    if (res.error) {
      Alert.alert("Error", res.message ?? res.error);
    } else {
      resetRejectForm();
      removeRow(row.id);
    }
  };

  return (
    <AdminShell title="Verification">
      <View testID="admin.verification.kind-tabs" style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        {KINDS.map((k) => (
          <Pressable
            key={k.key}
            onPress={() => setKind(k.key)}
           
            style={{
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 16,
              backgroundColor: kind === k.key ? colors.adminAccent : "#1E293B",
            }}
           testID="admin.verification.set-kind">
            <Text style={{ color: kind === k.key ? "#0F172A" : "#94A3B8", fontSize: 13, fontWeight: "600" }}>
              {k.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.adminAccent} />
      ) : rows.length === 0 ? (
        <Text style={{ color: "#94A3B8" }}>Nothing pending.</Text>
      ) : (
        rows.map((row) => (
          <View
            key={row.id}
            testID="admin.verification.row-item"
            style={{
              backgroundColor: "#0F172A",
              borderRadius: 10,
              padding: 14,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: "#1E293B",
            }}
          >
            <Text style={{ color: "#E2E8F0", fontSize: 15, fontWeight: "700" }}>
              {row.applicant.name}
              {row.applicant.phone ? ` · ${row.applicant.phone}` : ""}
            </Text>
            <Text style={{ color: "#94A3B8", fontSize: 13, marginTop: 4 }}>{row.label}</Text>

            <View style={{ marginTop: 8, gap: 4 }}>
              {row.documents.map((doc) => (
                <Pressable
                  key={doc.label}
                 
                  disabled={!doc.url}
                  onPress={() => doc.url && Linking.openURL(doc.url)}
                 testID="admin.verification.el-1">
                  <Text style={{ color: doc.url ? "#38BDF8" : "#475569", fontSize: 13 }}>
                    {doc.label}: {doc.url ? "open" : "not provided"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ color: "#64748B", fontSize: 12, marginTop: 8 }}>
              Submitted {new Date(row.created_at).toLocaleString()}
            </Text>

            {rejectingId === row.id ? (
              <View style={{ marginTop: 10, gap: 8 }}>
                <TextInput
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  placeholder="Reason shown to the applicant"
                  placeholderTextColor="#64748B"
                  multiline
                 
                  style={{
                    borderWidth: 1,
                    borderColor: "#334155",
                    borderRadius: 8,
                    padding: 10,
                    color: "#E2E8F0",
                    minHeight: 60,
                  }}
                 testID="admin.verification.set-reject-reason"/>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  {REJECT_CODES.map((c) => (
                    <Pressable
                      key={c.code}
                      onPress={() => setRejectCode(c.code)}
                      style={{
                        borderRadius: 14,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        backgroundColor: rejectCode === c.code ? "#DC2626" : "#1E293B",
                      }}
                     testID="admin.verification.set-reject-code">
                      <Text style={{ color: rejectCode === c.code ? "#FFF" : "#94A3B8", fontSize: 12 }}>
                        {c.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={rejectField}
                  onChangeText={setRejectField}
                  placeholder="Failed field (e.g. Trade license — expiry date)"
                  placeholderTextColor="#64748B"
                  style={{ borderWidth: 1, borderColor: "#334155", borderRadius: 8, padding: 10, color: "#E2E8F0" }}
                 testID="admin.verification.set-reject-field"/>
                <TextInput
                  value={rejectExample}
                  onChangeText={setRejectExample}
                  placeholder="Example of an acceptable document"
                  placeholderTextColor="#64748B"
                  multiline
                  style={{ borderWidth: 1, borderColor: "#334155", borderRadius: 8, padding: 10, color: "#E2E8F0", minHeight: 44 }}
                 testID="admin.verification.set-reject-example"/>
                <TextInput
                  value={rejectNote}
                  onChangeText={setRejectNote}
                  placeholder="Internal note (admin-only, never shown to applicant)"
                  placeholderTextColor="#64748B"
                  style={{ borderWidth: 1, borderColor: "#334155", borderRadius: 8, padding: 10, color: "#94A3B8" }}
                 testID="admin.verification.set-reject-note"/>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => submitReject(row)}
                   
                    style={{ backgroundColor: "#DC2626", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 }}
                   testID="admin.verification.submit-reject">
                    <Text style={{ color: "#FFF", fontWeight: "600" }}>
                      {busyId === row.id ? "Rejecting…" : "Confirm reject"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={resetRejectForm}
                   
                    style={{ backgroundColor: "#1E293B", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 }}
                   testID="admin.verification.reset-reject-form">
                    <Text style={{ color: "#CBD5E1" }}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Pressable
                  onPress={() => handleApprove(row)}
                  disabled={busyId === row.id}
                 
                  style={{ backgroundColor: colors.adminAccent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 }}
                 testID="admin.verification.handle-approve">
                  <Text style={{ color: "#0F172A", fontWeight: "700" }}>
                    {busyId === row.id ? "Working…" : "Approve"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setRejectingId(row.id)}
                 
                  style={{ backgroundColor: "#1E293B", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 }}
                 testID="admin.verification.set-rejecting-id">
                  <Text style={{ color: "#FCA5A5" }}>Reject</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))
      )}
    </AdminShell>
  );
}
