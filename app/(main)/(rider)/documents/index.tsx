import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface DocItem {
  id: string;
  document_type: string;
  status: string;
  uploaded_at: string | null;
  verified_at: string | null;
  notes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  verified: "text-goPrimary",
  approved: "text-goPrimary",
  pending: "text-goSecondary",
  rejected: "text-goDanger",
  missing: "text-goDanger",
  expired: "text-goDanger",
};

export default function DocumentList() {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError("Failed to load documents"); return; }
      const data = await res.json();
      setDocs(data.documents ?? []);
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Documents fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const formatDocType = (type: string) =>
    type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const statusColor = (status: string) =>
    STATUS_COLORS[status.toLowerCase()] ?? "text-goTextSecondaryLight dark:text-goTextSecondaryDark";

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Documents</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        {loading ? (
          <ActivityIndicator size="small" color="#0CC25F" />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger">{error}</Text>
        ) : docs.length === 0 ? (
          <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mt-8">No documents found.</Text>
        ) : (
          docs.map((d) => (
            <TouchableOpacity
              key={d.id}
              className="flex-row justify-between items-center p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]"
              onPress={() => router.push("/(main)/(rider)/onboarding/documents")}
            >
              <View className="flex-1">
                <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{formatDocType(d.document_type)}</Text>
                {d.notes ? <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-0.5">{d.notes}</Text> : null}
              </View>
              <Text className={`text-[13px] font-JakartaBold ml-3 ${statusColor(d.status)}`}>
                {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}