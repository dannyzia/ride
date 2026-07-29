import { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface Contact {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
}

export default function EmergencyContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRelationship, setNewRelationship] = useState("");

  const fetchContacts = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/user/emergency-contacts`, {
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

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const addContact = async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/user/emergency-contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim(), relationship: newRelationship.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setContacts((prev) => [...prev, data.contact]);
        setNewName(""); setNewPhone(""); setNewRelationship("");
        setShowAdd(false);
      }
    } catch (err) {
      logger.error("EmergencyContacts add failed", err);
    }
  };

  const removeContact = async (id: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/user/emergency-contacts?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      logger.error("EmergencyContacts delete failed", err);
    }
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
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        {contacts.length === 0 ? (
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark py-4 text-center">
            No emergency contacts yet.
          </Text>
        ) : (
          contacts.map((c) => (
            <View key={c.id} className="flex-row justify-between items-center p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-2">
              <TouchableOpacity className="flex-1 flex-row items-center" onPress={() => Linking.openURL(`tel:${c.phone}`)}>
                <View className="w-10 h-10 rounded-full bg-goAccentLight items-center justify-center mr-[12px]">
                  <Text className="text-[18px] font-JakartaBold text-goPrimary">{c.name.charAt(0)}</Text>
                </View>
                <View>
                  <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{c.name}</Text>
                  <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{c.phone}{c.relationship ? ` · ${c.relationship}` : ""}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeContact(c.id)}>
                <Text className="text-[14px] font-Jakarta text-goDanger">Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        {showAdd ? (
          <View className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-3">
            <TextInput className="bg-goBgLight dark:bg-goBgDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] px-[12px] py-[10px] text-[14px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2" placeholder="Contact name" placeholderTextColor="#9CA3AF" value={newName} onChangeText={setNewName} />
            <TextInput className="bg-goBgLight dark:bg-goBgDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] px-[12px] py-[10px] text-[14px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2" placeholder="Phone number (+8801...)" placeholderTextColor="#9CA3AF" keyboardType="phone-pad" value={newPhone} onChangeText={setNewPhone} />
            <TextInput className="bg-goBgLight dark:bg-goBgDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] px-[12px] py-[10px] text-[14px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-3" placeholder="Relationship (optional)" placeholderTextColor="#9CA3AF" value={newRelationship} onChangeText={setNewRelationship} />
            <View className="flex-row gap-2">
              <TouchableOpacity className="flex-1 bg-goPrimary rounded-full py-[12px] items-center" onPress={addContact}>
                <Text className="text-[15px] font-JakartaBold text-goWhite">Save</Text>
              </TouchableOpacity>
              <TouchableOpacity className="flex-1 border border-goBorderLight dark:border-goBorderDark rounded-full py-[12px] items-center" onPress={() => setShowAdd(false)}>
                <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity className="bg-goPrimary rounded-full w-full py-[16px] items-center mt-2" onPress={() => setShowAdd(true)}>
            <Text className="text-[18px] font-JakartaBold text-goWhite">+ Add contact</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}