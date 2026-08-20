import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Linking, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

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

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

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
      const res = await fetch(`${API_URL}/api/user/emergency-contacts`, {
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
      await fetch(`${API_URL}/api/user/emergency-contacts?id=${id}`, {
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
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <ActivityIndicator size="large" color="#0CC25F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Emergency Contacts</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        {contacts.length === 0 ? (
          <Text className="text-[14px] font-Jakarta py-4 text-center" style={{ color: textSecondary }}>
            No emergency contacts yet.
          </Text>
        ) : (
          contacts.map((c) => (
            <View key={c.id} className="flex-row justify-between items-center p-[14px] border rounded-[12px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }}>
              <TouchableOpacity className="flex-1 flex-row items-center" onPress={() => Linking.openURL(`tel:${c.phone}`)}>
                <View className="w-10 h-10 rounded-full items-center justify-center mr-[12px]" style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}>
                  <Text className="text-[18px] font-JakartaBold" style={{ color: colors.primary }}>{c.name.charAt(0)}</Text>
                </View>
                <View>
                  <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>{c.name}</Text>
                  <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>{c.phone}{c.relationship ? ` · ${c.relationship}` : ""}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeContact(c.id)}>
                <Text className="text-[14px] font-Jakarta" style={{ color: colors.danger }}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        {showAdd ? (
          <View className="p-[14px] border rounded-[12px] mb-3" style={{ backgroundColor: surfaceBg, borderColor }}>
            <TextInput className="border rounded-[8px] px-[12px] py-[10px] text-[14px] font-Jakarta mb-2" style={{ backgroundColor: bg, borderColor, color: textPrimary }} placeholder="Contact name" placeholderTextColor={textSecondary} value={newName} onChangeText={setNewName} />
            <TextInput className="border rounded-[8px] px-[12px] py-[10px] text-[14px] font-Jakarta mb-2" style={{ backgroundColor: bg, borderColor, color: textPrimary }} placeholder="Phone number (+8801...)" placeholderTextColor={textSecondary} keyboardType="phone-pad" value={newPhone} onChangeText={setNewPhone} />
            <TextInput className="border rounded-[8px] px-[12px] py-[10px] text-[14px] font-Jakarta mb-3" style={{ backgroundColor: bg, borderColor, color: textPrimary }} placeholder="Relationship (optional)" placeholderTextColor={textSecondary} value={newRelationship} onChangeText={setNewRelationship} />
            <View className="flex-row gap-2">
              <TouchableOpacity className="flex-1 rounded-full py-[12px] items-center" style={{ backgroundColor: colors.primary }} onPress={addContact}>
                <Text className="text-[15px] font-JakartaBold" style={{ color: colors.white }}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity className="flex-1 border rounded-full py-[12px] items-center" style={{ borderColor }} onPress={() => setShowAdd(false)}>
                <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity className="rounded-full w-full py-[16px] items-center mt-2" style={{ backgroundColor: colors.primary }} onPress={() => setShowAdd(true)}>
            <Text className="text-[18px] font-JakartaBold" style={{ color: colors.white }}>+ Add contact</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-16 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
