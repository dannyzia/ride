import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface Contact { id: string; name: string; phone: string; relationship: string | null; }

export default function SettingsEmergencyContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRelationship, setNewRelationship] = useState("");

  const fetchContacts = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/user/emergency-contacts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setContacts(data.contacts ?? []);
    } catch (err) {
      logger.error("RiderEmergencyContacts fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const addContact = async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/user/emergency-contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim(), relationship: newRelationship.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setContacts((prev) => [...prev, data.contact]);
        setShowAddModal(false); setNewName(""); setNewPhone(""); setNewRelationship("");
      }
    } catch (err) {
      logger.error("RiderEmergencyContacts add failed", err);
    }
  };

  const deleteContact = (id: string) => {
    Alert.alert("Delete Contact", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) return;
            await fetch(`${API_URL}/api/user/emergency-contacts?id=${id}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            setContacts((prev) => prev.filter((c) => c.id !== id));
          } catch (err) {
            logger.error("RiderEmergencyContacts delete failed", err);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center">
        <ActivityIndicator size="large" color="#0CC25F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Emergency Contacts</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 100 }}>
        {contacts.length > 0 ? contacts.map((contact) => (
          <View key={contact.id} className="mb-3 flex-row items-center justify-between p-[12px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px]">
            <View className="flex-1">
              <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{contact.name}</Text>
              <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{contact.relationship ?? "—"} · {contact.phone}</Text>
            </View>
            <TouchableOpacity className="p-[6px]" onPress={() => deleteContact(contact.id)}><Text className="text-[16px]">🗑</Text></TouchableOpacity>
          </View>
        )) : (
          <View className="items-center py-[24px]"><Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">No emergency contacts added</Text></View>
        )}
      </ScrollView>
      <View className="absolute bottom-0 left-0 right-0 px-[24px] pb-[24px]">
        <TouchableOpacity className="bg-goPrimary rounded-full w-full py-[16px] items-center" onPress={() => setShowAddModal(true)}>
          <Text className="text-[18px] font-JakartaBold text-goWhite">+ Add Emergency Contact</Text>
        </TouchableOpacity>
      </View>
      {showAddModal && (
        <View className="absolute top-0 left-0 right-0 bottom-0 bg-black/50 justify-center items-center p-[24px]">
          <View className="bg-goBgLight dark:bg-goBgDark rounded-2xl w-full max-w-[400px] p-[24px]">
            <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-6 text-center">Add Emergency Contact</Text>
            <TextInput className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-3" placeholder="Name" placeholderTextColor="#9CA3AF" value={newName} onChangeText={setNewName} />
            <TextInput className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-3" placeholder="Phone Number" placeholderTextColor="#9CA3AF" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
            <TextInput className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-6" placeholder="Relationship (optional)" placeholderTextColor="#9CA3AF" value={newRelationship} onChangeText={setNewRelationship} />
            <View className="flex-row gap-3">
              <TouchableOpacity className="flex-1 border border-goBorderLight dark:border-goBorderDark rounded-full py-[14px] items-center" onPress={() => setShowAddModal(false)}>
                <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity className="flex-1 bg-goPrimary rounded-full py-[14px] items-center" onPress={addContact}>
                <Text className="text-[16px] font-JakartaBold text-goWhite">Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}