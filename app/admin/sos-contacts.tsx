import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface Contact {
  label: string;
  number: string;
}

export default function SOSContacts() {
  const toast = useAdminToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<{ contacts: Contact[] }>("/api/admin/sos-contacts");
    if (res.data?.contacts) setContacts(res.data.contacts);
    setLoading(false);
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const saveContacts = async (updated: Contact[]) => {
    const res = await adminFetch<{ success: boolean }>("/api/admin/sos-contacts", {
      method: "PATCH", body: JSON.stringify({ contacts: updated }), headers: { "Content-Type": "application/json" },
    });
    if (res.data?.success) {
      toast.show("Contacts saved", "success");
      setContacts(updated);
    } else {
      toast.show(res.error ?? "Failed to save", "error");
    }
  };

  const startEdit = (i: number) => {
    setEditIndex(i);
    setEditLabel(contacts[i].label);
    setEditNumber(contacts[i].number);
    setModalVisible(true);
  };

  const addNew = () => {
    setEditIndex(-1);
    setEditLabel("");
    setEditNumber("");
    setModalVisible(true);
  };

  const saveEdit = () => {
    if (!editLabel.trim() || !editNumber.trim()) return;
    const updated = [...contacts];
    if (editIndex !== null && editIndex >= 0 && editIndex < updated.length) {
      updated[editIndex] = { label: editLabel.trim(), number: editNumber.trim() };
    } else {
      updated.push({ label: editLabel.trim(), number: editNumber.trim() });
    }
    saveContacts(updated);
    setModalVisible(false);
  };

  const deleteContact = (i: number) => {
    saveContacts(contacts.filter((_, idx) => idx !== i));
  };

  return (
    <AdminShell title="SOS Contacts" subtitle="Emergency contact numbers shown in the driver app">
      {loading ? (
        <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} />
      ) : (
        <View style={{ gap: 8 }}>
          {contacts.map((c, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: colors.darkSecondary, borderRadius: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-Bold", fontSize: 14 }}>{c.label}</Text>
                <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>{c.number}</Text>
              </View>
              <Pressable onPress={() => startEdit(i)} style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.adminAccent, borderRadius: 6, marginRight: 8 }}>
                <Text style={{ color: "#000", fontFamily: "Jakarta-Bold", fontSize: 11 }}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => deleteContact(i)} style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.danger, borderRadius: 6 }}>
                <Text style={{ color: "#FFF", fontFamily: "Jakarta-Bold", fontSize: 11 }}>Delete</Text>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={addNew}
            style={{ padding: 12, backgroundColor: colors.adminAccent, borderRadius: 8, alignItems: "center" }}>
            <Text style={{ color: "#000", fontFamily: "Jakarta-Bold", fontSize: 13 }}>+ Add Contact</Text>
          </Pressable>
        </View>
      )}

      <AdminModal visible={modalVisible} title={editIndex !== null && editIndex >= 0 ? "Edit Contact" : "Add Contact"} onClose={() => setModalVisible(false)}>
        <View style={{ gap: 12 }}>
          <View>
            <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12, marginBottom: 4 }}>Label</Text>
            <View style={{ backgroundColor: colors.darkSecondary, borderRadius: 8, padding: 10 }}>
              <input type="text" value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
                style={{ background: "transparent", color: colors.textPrimaryDark, border: "none", outline: "none", width: "100%", fontFamily: "Jakarta-Regular", fontSize: 14 }}
                placeholder="e.g. Police" />
            </View>
          </View>
          <View>
            <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12, marginBottom: 4 }}>Phone Number</Text>
            <View style={{ backgroundColor: colors.darkSecondary, borderRadius: 8, padding: 10 }}>
              <input type="tel" value={editNumber} onChange={(e) => setEditNumber(e.target.value)}
                style={{ background: "transparent", color: colors.textPrimaryDark, border: "none", outline: "none", width: "100%", fontFamily: "Jakarta-Regular", fontSize: 14 }}
                placeholder="e.g. 999" />
            </View>
          </View>
          <Pressable onPress={saveEdit} style={{ paddingVertical: 12, backgroundColor: colors.adminAccent, borderRadius: 8, alignItems: "center" }}>
            <Text style={{ color: "#000", fontFamily: "Jakarta-Bold", fontSize: 14 }}>Save</Text>
          </Pressable>
        </View>
      </AdminModal>
    </AdminShell>
  );
}
