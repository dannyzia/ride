import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator, Image } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { AdminModal } from "@/components/admin/AdminModal";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface PendingDoc {
  id: string;
  driver_id: string;
  doc_type: string;
  status: string;
  storage_url: string;
  driver_name: string;
  created_at: string;
}

export default function DocumentApproval() {
  const toast = useAdminToast();
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<PendingDoc | null>(null);
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<{ documents: PendingDoc[] }>("/api/admin/documents/pending");
    if (res.data) setDocs(res.data.documents ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const viewDoc = async (doc: PendingDoc) => {
    setSelectedDoc(doc);
    setPresignedUrl(null);
    setModalVisible(true);
    const res = await adminFetch<{ url: string }>(`/api/admin/document/${doc.id}/presigned-url`);
    if (res.data?.url) setPresignedUrl(res.data.url);
  };

  const approveDoc = async (docId: string) => {
    const res = await adminFetch<{ success: boolean }>("/api/admin/documents/approve", {
      method: "POST", body: JSON.stringify({ document_id: docId }), headers: { "Content-Type": "application/json" },
    });
    if (res.data?.success) {
      toast.show("Document approved", "success");
      setDocs(docs.filter((d) => d.id !== docId));
      setModalVisible(false);
    } else {
      toast.show(res.error ?? "Approval failed", "error");
    }
  };

  const rejectDoc = async (docId: string) => {
    const res = await adminFetch<{ success: boolean }>("/api/admin/documents/reject", {
      method: "POST", body: JSON.stringify({ document_id: docId, reason: "Rejected by admin" }), headers: { "Content-Type": "application/json" },
    });
    if (res.data?.success) {
      toast.show("Document rejected", "success");
      setDocs(docs.filter((d) => d.id !== docId));
      setModalVisible(false);
    } else {
      toast.show(res.error ?? "Rejection failed", "error");
    }
  };

  const columns: AdminColumn<PendingDoc>[] = [
    { key: "created_at", header: "Submitted", render: (r) => new Date(r.created_at).toLocaleDateString(), width: 100 },
    { key: "driver_name", header: "Driver", width: 150 },
    { key: "doc_type", header: "Type", width: 120 },
    { key: "id", header: "Actions", render: (r) => (
      <Pressable onPress={() => viewDoc(r)} style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.adminAccent, borderRadius: 6 }}>
        <Text style={{ color: "#000", fontFamily: "Jakarta-Bold", fontSize: 11 }}>Review</Text>
      </Pressable>
    ), width: 80 },
  ];

  return (
    <AdminShell title="Document Approval" subtitle="Review pending driver documents">
      {loading ? (
        <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} />
      ) : (
        <AdminTable columns={columns} rows={docs} rowKey={(r) => r.id} />
      )}

      <AdminModal visible={modalVisible} title={`${selectedDoc?.doc_type ?? ""} — ${selectedDoc?.driver_name ?? ""}`} onClose={() => setModalVisible(false)}>
        {presignedUrl ? (
          <>
            <Image source={{ uri: presignedUrl }} style={{ width: "100%", height: 300, borderRadius: 8, marginBottom: 12 }} resizeMode="contain" />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable onPress={() => approveDoc(selectedDoc!.id)}
                style={{ flex: 1, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 8, alignItems: "center" }}>
                <Text style={{ color: "#000", fontFamily: "Jakarta-Bold" }}>Approve</Text>
              </Pressable>
              <Pressable onPress={() => rejectDoc(selectedDoc!.id)}
                style={{ flex: 1, paddingVertical: 12, backgroundColor: colors.danger, borderRadius: 8, alignItems: "center" }}>
                <Text style={{ color: "#FFF", fontFamily: "Jakarta-Bold" }}>Reject</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.adminAccent} />
        )}
      </AdminModal>
    </AdminShell>
  );
}
