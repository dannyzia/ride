import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, Modal } from "react-native";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface Props {
  visible: boolean;
  rideId: string | null;
  onClose: () => void;
}

const TYPES = ["toll", "parking"] as const;

export default function TollParkingModal({ visible, rideId, onClose }: Props) {
  const [chargeType, setChargeType] = useState<"toll" | "parking">("toll");
  const [amountTaka, setAmountTaka] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!rideId || !amountTaka) { Alert.alert("Error", "Amount is required"); return; }
    const amountBdt = parseInt(amountTaka, 10) * 100;
    if (amountBdt < 1000 || amountBdt > 50000) { Alert.alert("Error", "Amount must be between ৳10 and ৳500"); return; }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { Alert.alert("Error", "Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/ride/${rideId}/extra-charge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: chargeType, amount_bdt: amountBdt, description: description.trim() || undefined }),
      });
      if (res.ok) { Alert.alert("Submitted", "Charge sent to rider for approval"); onClose(); setAmountTaka(""); setDescription(""); }
      else { const d = await res.json(); Alert.alert("Error", d.error ?? "Failed"); }
    } catch (err: any) { logger.error("Extra charge failed", err); Alert.alert("Error", "Network error"); }
    finally { setSubmitting(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark rounded-t-3xl p-6">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Add Charge</Text>
            <TouchableOpacity onPress={onClose}><Text className="text-goDanger font-JakartaBold">Close</Text></TouchableOpacity>
          </View>
          <View className="flex-row gap-3 mb-4">
            {TYPES.map((t) => (
              <TouchableOpacity key={t} onPress={() => setChargeType(t)}
                className={`flex-1 py-3 rounded-full items-center ${chargeType === t ? "bg-goPrimary" : "bg-goBorderLight dark:bg-goDarkSecondary"}`}>
                <Text className={`font-JakartaBold text-sm ${chargeType === t ? "text-goWhite" : "text-goTextPrimaryLight dark:text-goTextPrimaryDark"}`}>
                  {t === "toll" ? "🛣️ Toll" : "🅿️ Parking"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Amount (BDT)</Text>
          <TextInput className="bg-goBgLight dark:bg-goBgDark border border-goBorderLight dark:border-goBorderDark rounded-lg px-4 py-3 mb-4 text-goTextPrimaryLight dark:text-goTextPrimaryDark font-Jakarta text-base"
            keyboardType="numeric" value={amountTaka} onChangeText={setAmountTaka} placeholder="e.g. 50" placeholderTextColor="#64748B" />
          <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Description (optional)</Text>
          <TextInput className="bg-goBgLight dark:bg-goBgDark border border-goBorderLight dark:border-goBorderDark rounded-lg px-4 py-3 mb-6 text-goTextPrimaryLight dark:text-goTextPrimaryDark font-Jakarta text-base"
            value={description} onChangeText={setDescription} placeholder="Toll/parking details" placeholderTextColor="#64748B" />
          <TouchableOpacity onPress={handleSubmit} disabled={submitting || !amountTaka}
            className={`py-4 rounded-full items-center ${submitting ? "bg-goBorderDark" : "bg-goPrimary"}`}>
            {submitting ? <ActivityIndicator size={20} color="#FFF" /> : <Text className="text-goWhite font-JakartaBold text-base">Submit Charge</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
