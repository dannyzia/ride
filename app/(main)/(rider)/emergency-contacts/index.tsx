import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  StatusBar,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

const MAX_CONTACTS = 5;

interface Contact {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
}

/** Bangladesh phone: +8801XXXXXXXXX or 01XXXXXXXXX (11 digits) */
function isValidBdPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return /^\+?8801[0-9]{9}$/.test(cleaned) || /^01[0-9]{9}$/.test(cleaned);
}

export default function EmergencyContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRelationship, setNewRelationship] = useState("");
  const [formError, setFormError] = useState("");

  // Delete confirmation modal
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);

  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const atLimit = contacts.length >= MAX_CONTACTS;

  const fetchContacts = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/user/emergency-contacts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setContacts(data.contacts ?? []);
    } catch (err) {
      logger.error("EmergencyContacts fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const addContact = async () => {
    setFormError("");

    if (!newName.trim()) {
      setFormError("Name is required");
      return;
    }
    if (!newPhone.trim()) {
      setFormError("Phone number is required");
      return;
    }
    if (!isValidBdPhone(newPhone.trim())) {
      setFormError("Enter a valid Bangladesh phone number (e.g. 01712345678 or +8801712345678)");
      return;
    }
    if (atLimit) {
      setFormError(`Maximum ${MAX_CONTACTS} contacts allowed`);
      return;
    }

    setAdding(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/user/emergency-contacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim(),
          relationship: newRelationship.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setContacts((prev) => [...prev, data.contact]);
        setNewName("");
        setNewPhone("");
        setNewRelationship("");
        setShowAdd(false);
        setFormError("");
      } else {
        setFormError(data.message || "Failed to add contact");
      }
    } catch (err) {
      setFormError("Network error");
      logger.error("EmergencyContacts add failed", err);
    } finally {
      setAdding(false);
    }
  };

  const confirmRemove = (contact: Contact) => {
    setPendingDelete(contact);
    setDeleteModalVisible(true);
  };

  const removeContact = async () => {
    if (!pendingDelete) return;
    setRemovingId(pendingDelete.id);
    setDeleteModalVisible(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      await fetch(`${API_URL}/api/user/emergency-contacts?id=${pendingDelete.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setContacts((prev) => prev.filter((c) => c.id !== pendingDelete.id));
    } catch (err) {
      logger.error("EmergencyContacts delete failed", err);
    } finally {
      setRemovingId(null);
      setPendingDelete(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: bg }}
      >
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={bg}
        />
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      {/* Header */}
      <View
        className="flex-row items-center px-[24px] py-[16px] border-b"
        style={{ borderBottomColor: borderColor }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-[12px] p-[4px]"
        >
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          className="flex-1 text-center text-[18px] font-JakartaBold"
          style={{ color: textPrimary }}
        >
          Emergency Contacts
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Counter */}
      <View
        className="px-[24px] py-[12px] flex-row justify-between items-center"
        style={{ borderBottomWidth: 1, borderBottomColor: borderColor }}
      >
        <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
          {contacts.length} of {MAX_CONTACTS} contacts
        </Text>
        {atLimit && (
          <View
            className="px-[8px] py-[2px] rounded-full"
            style={{ backgroundColor: `${colors.amber}20` }}
          >
            <Text
              className="text-[11px] font-JakartaBold"
              style={{ color: colors.amber }}
            >
              MAX REACHED
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        className="flex-1 px-[24px]"
        contentContainerStyle={{ paddingVertical: 16 }}
      >
        {contacts.length === 0 && !showAdd ? (
          <View className="items-center py-[40px]">
            <Ionicons name="people-outline" size={48} color={textSecondary} />
            <Text
              className="text-[15px] font-Jakarta mt-3 text-center"
              style={{ color: textSecondary }}
            >
              No emergency contacts yet.
            </Text>
            <Text
              className="text-[13px] font-Jakarta mt-1 text-center"
              style={{ color: textSecondary }}
            >
              Add contacts who should be notified in case of emergency.
            </Text>
          </View>
        ) : (
          contacts.map((c) => (
            <View
              key={c.id}
              className="flex-row justify-between items-center p-[14px] border rounded-[12px] mb-2"
              style={{ backgroundColor: surfaceBg, borderColor }}
            >
              <TouchableOpacity
                className="flex-1 flex-row items-center"
                onPress={() => Linking.openURL(`tel:${c.phone}`)}
                disabled={removingId === c.id}
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-[12px]"
                  style={{
                    backgroundColor: isDark
                      ? colors.primaryLightDark
                      : colors.primaryLight,
                  }}
                >
                  <Text
                    className="text-[18px] font-JakartaBold"
                    style={{ color: colors.primary }}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text
                    className="text-[15px] font-JakartaBold"
                    style={{ color: textPrimary }}
                  >
                    {c.name}
                  </Text>
                  <Text
                    className="text-[13px] font-Jakarta"
                    style={{ color: textSecondary }}
                  >
                    {c.phone}
                    {c.relationship ? ` · ${c.relationship}` : ""}
                  </Text>
                </View>
              </TouchableOpacity>
              {removingId === c.id ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <TouchableOpacity
                  onPress={() => confirmRemove(c)}
                  className="p-[8px]"
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={colors.danger}
                  />
                </TouchableOpacity>
              )}
            </View>
          ))
        )}

        {/* Add contact form */}
        {showAdd ? (
          <View
            className="p-[14px] border rounded-[12px] mb-3 mt-2"
            style={{ backgroundColor: surfaceBg, borderColor }}
          >
            <Text
              className="text-[15px] font-JakartaBold mb-3"
              style={{ color: textPrimary }}
            >
              New Contact
            </Text>
            <TextInput
              className="border rounded-[8px] px-[12px] py-[10px] text-[14px] font-Jakarta mb-2"
              style={{
                backgroundColor: bg,
                borderColor,
                color: textPrimary,
              }}
              placeholder="Contact name"
              placeholderTextColor={textSecondary}
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              className="border rounded-[8px] px-[12px] py-[10px] text-[14px] font-Jakarta mb-2"
              style={{
                backgroundColor: bg,
                borderColor,
                color: textPrimary,
              }}
              placeholder="Phone number (01712345678)"
              placeholderTextColor={textSecondary}
              keyboardType="phone-pad"
              value={newPhone}
              onChangeText={setNewPhone}
            />
            <TextInput
              className="border rounded-[8px] px-[12px] py-[10px] text-[14px] font-Jakarta mb-1"
              style={{
                backgroundColor: bg,
                borderColor,
                color: textPrimary,
              }}
              placeholder="Relationship (optional)"
              placeholderTextColor={textSecondary}
              value={newRelationship}
              onChangeText={setNewRelationship}
            />
            <Text
              className="text-[11px] font-Jakarta mb-3"
              style={{ color: textSecondary }}
            >
              Accepts: 01712345678 or +8801712345678
            </Text>

            {formError ? (
              <Text
                className="text-[13px] font-Jakarta mb-2"
                style={{ color: colors.danger }}
              >
                {formError}
              </Text>
            ) : null}

            <View className="flex-row gap-2">
              <TouchableOpacity
                className="flex-1 rounded-full py-[12px] items-center"
                style={{
                  backgroundColor: adding ? colors.borderDark : colors.primary,
                }}
                onPress={addContact}
                disabled={adding}
              >
                {adding ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text
                    className="text-[15px] font-JakartaBold"
                    style={{ color: colors.white }}
                  >
                    Save
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 border rounded-full py-[12px] items-center"
                style={{ borderColor }}
                onPress={() => {
                  setShowAdd(false);
                  setFormError("");
                  setNewName("");
                  setNewPhone("");
                  setNewRelationship("");
                }}
              >
                <Text
                  className="text-[15px] font-JakartaBold"
                  style={{ color: textPrimary }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            className="rounded-full w-full py-[16px] items-center mt-2 flex-row justify-center gap-2"
            style={{
              backgroundColor: atLimit ? colors.borderDark : colors.primary,
            }}
            onPress={() => setShowAdd(true)}
            disabled={atLimit}
          >
            <Ionicons
              name="add-circle-outline"
              size={20}
              color={atLimit ? textSecondary : colors.white}
            />
            <Text
              className="text-[16px] font-JakartaBold"
              style={{ color: atLimit ? textSecondary : colors.white }}
            >
              {atLimit ? "Max contacts reached" : "Add Contact"}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDeleteModalVisible(false);
          setPendingDelete(null);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            className="w-[85%] rounded-[16px] p-[20px]"
            style={{ backgroundColor: surfaceBg }}
          >
            <Text
              className="text-[18px] font-JakartaBold mb-2"
              style={{ color: textPrimary }}
            >
              Remove Contact?
            </Text>
            <Text
              className="text-[14px] font-Jakarta mb-4"
              style={{ color: textSecondary }}
            >
              {pendingDelete
                ? `Remove ${pendingDelete.name} from your emergency contacts?`
                : ""}
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-[12px] rounded-[10px] items-center"
                style={{ borderWidth: 1, borderColor }}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setPendingDelete(null);
                }}
              >
                <Text
                  className="text-[15px] font-JakartaSemiBold"
                  style={{ color: textPrimary }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-[12px] rounded-[10px] items-center"
                style={{ backgroundColor: colors.danger }}
                onPress={removeContact}
              >
                <Text className="text-[15px] font-JakartaSemiBold text-white">
                  Remove
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
