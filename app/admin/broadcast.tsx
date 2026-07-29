import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";

export default function Broadcast() {
  const toast = useAdminToast();
  const [target, setTarget] = useState<"all" | "rider" | "driver">("all");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) { toast.show("Title and message are required", "error"); return; }
    setSending(true);
    const res = await adminFetch<{ success: boolean; sent: number }>("/api/admin/broadcast", {
      method: "POST", body: JSON.stringify({ target, title: title.trim(), message: message.trim() }), headers: { "Content-Type": "application/json" },
    });
    if (res.data?.success) { toast.show(`Sent to ${res.data.sent} users`, "success"); setTitle(""); setMessage(""); }
    else { toast.show(res.error ?? "Failed", "error"); }
    setSending(false);
  };

  return (
    <AdminShell title="Broadcast Push" subtitle="Send push notifications to app users">
      <View className="mb-4">
        <Text className="text-goTextSecondaryDark font-Jakarta text-[12px] mb-1.5">Target</Text>
        <View className="flex-row gap-2">
          {(["all", "rider", "driver"] as const).map((t) => (
            <Pressable key={t} onPress={() => setTarget(t)}
              className={`px-[14px] py-[6px] rounded-[16px] ${target === t ? "bg-goAdminAccent" : "bg-goDarkSecondary"}`}>
              <Text className={`font-JakartaSemiBold text-[12px] ${target === t ? "text-goBgDark" : "text-goTextPrimaryDark"}`}>{t}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View className="mb-4">
        <Text className="text-goTextSecondaryDark font-Jakarta text-[12px] mb-1.5">Title</Text>
        <TextInput className="bg-goDarkSecondary rounded-[8px] px-[12px] py-[10px] text-goTextPrimaryDark font-Jakarta text-[14px]"
          value={title} onChangeText={setTitle} maxLength={200} placeholder="Enter title" placeholderTextColor="#64748B" />
      </View>
      <View className="mb-4">
        <Text className="text-goTextSecondaryDark font-Jakarta text-[12px] mb-1.5">Message</Text>
        <TextInput className="bg-goDarkSecondary rounded-[8px] px-[12px] py-[10px] text-goTextPrimaryDark font-Jakarta text-[14px] min-h-[80px]"
          value={message} onChangeText={setMessage} maxLength={1000} multiline numberOfLines={4} placeholder="Enter message" placeholderTextColor="#64748B" />
      </View>
      <Pressable onPress={handleSend} disabled={sending}
        className={`py-[12px] rounded-[8px] items-center ${sending ? "bg-goDarkSecondary" : "bg-goAdminAccent"}`}>
        {sending ? <ActivityIndicator size={20} color="#FFF" /> : <Text className="text-goBgDark font-JakartaBold text-[14px]">Send Broadcast</Text>}
      </Pressable>
    </AdminShell>
  );
}
