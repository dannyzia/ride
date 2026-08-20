import { useState, useEffect, useCallback, useRef } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface Props {
  rideId: string | null;
}

interface PendingCharge {
  id: string;
  type: string;
  amount_bdt: number;
  description: string | null;
  status: string;
}

export default function ExtraChargeApproval({ rideId }: Props) {
  const isDark = useIsDark();
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const [charges, setCharges] = useState<PendingCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCharges = useCallback(async () => {
    if (!rideId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/ride/${rideId}/extra-charge`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCharges(data.charges?.filter((c: PendingCharge) => c.status === "pending") ?? []);
      }
    } catch { /* polling */ }
    finally { setLoading(false); }
  }, [rideId]);

  useEffect(() => {
    fetchCharges();
    intervalRef.current = setInterval(fetchCharges, 10000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchCharges]);

  const handleAction = async (chargeId: string, action: "approve" | "dispute") => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/ride/${rideId}/extra-charge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ charge_id: chargeId, action }),
      });
      if (res.ok) { Alert.alert(action === "approve" ? "Approved" : "Disputed", action === "approve" ? "Charge will be added to your fare." : "A support ticket has been created."); fetchCharges(); }
      else { const d = await res.json(); Alert.alert("Error", d.error ?? "Failed"); }
    } catch (err) { logger.error("Charge action failed", err); Alert.alert("Error", "Network error"); }
  };

  if (loading) return null;
  if (charges.length === 0) return null;

  return (
    <View className="mx-4 mb-3">
      {charges.map((c) => (
        <View key={c.id} className="border rounded-xl p-4 mb-2" style={{ backgroundColor: isDark ? "#F59E0B1F" : colors.amber + "1A", borderColor: colors.amber + "4D" }}>
          <View className="flex-row justify-between items-start mb-2">
            <View className="flex-1">
              <View className="flex-row items-center gap-[6px]">
                <Ionicons name={c.type === "toll" ? "cash" : "car-sport"} size={14} color={textPrimary} />
                <Text className="text-sm font-JakartaBold" style={{ color: textPrimary }}>
                  {c.type === "toll" ? "Toll Charge" : "Parking Charge"}
                </Text>
              </View>
              {c.description ? <Text className="text-xs font-Jakarta mt-0.5" style={{ color: textSecondary }}>{c.description}</Text> : null}
            </View>
            <Text className="text-base font-JakartaBold text-goDanger">৳{(c.amount_bdt / 100).toFixed(0)}</Text>
          </View>
          <View className="flex-row gap-3">
            <TouchableOpacity onPress={() => handleAction(c.id, "approve")}
              className="flex-1 py-2 rounded-full bg-goPrimary items-center">
              <Text className="text-goWhite font-JakartaBold text-sm">Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleAction(c.id, "dispute")}
              className="flex-1 py-2 rounded-full border border-goDanger items-center">
              <Text className="text-goDanger font-JakartaBold text-sm">Dispute</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}
