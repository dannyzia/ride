/**
 * Ambulance certification screen (Phase 6) — submit, renew (F12), and track
 * the driver's BLS/ALS cert pairs. REST canonical: POST/PATCH
 * /api/ambulance/certifications*, GET /me.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

interface Certification {
  id: string;
  vehicle_id: string;
  certification_status: string;
  service_level: string | null;
  cert_number: string | null;
  issuing_body: string | null;
  expires_at: string | null;
  review_notes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  verified: "#0CC25F",
  pending: "#F59E0B",
  unverified: "#6B7280",
  revoked: colors.danger,
};

export default function AmbulanceCertScreen() {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const [certs, setCerts] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form (submit new OR renew the selected pair)
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [serviceLevel, setServiceLevel] = useState<"BLS" | "ALS">("BLS");
  const [certNumber, setCertNumber] = useState("");
  const [issuingBody, setIssuingBody] = useState("");
  const [expiresAt, setExpiresAt] = useState(""); // ISO or YYYY-MM-DD
  const [documentUrls, setDocumentUrls] = useState("");

  const loadCerts = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${SERVER_URL}/api/ambulance/certifications/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCerts(data.certifications ?? []);
      }
    } catch (err) {
      logger.error("[ambulance-cert] load error", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCerts();
  }, [loadCerts]);

  const startRenew = (cert: Certification) => {
    setRenewingId(cert.id);
    setVehicleId(cert.vehicle_id);
    setServiceLevel(cert.service_level === "ALS" ? "ALS" : "BLS");
    setCertNumber(cert.cert_number ?? "");
    setIssuingBody(cert.issuing_body ?? "");
    setExpiresAt(cert.expires_at ? cert.expires_at.slice(0, 10) : "");
  };

  const resetForm = () => {
    setRenewingId(null);
    setVehicleId("");
    setServiceLevel("BLS");
    setCertNumber("");
    setIssuingBody("");
    setExpiresAt("");
    setDocumentUrls("");
  };

  const handleSubmit = async () => {
    if (!vehicleId || !expiresAt || documentUrls.trim().length === 0) {
      Alert.alert("Missing Info", "Vehicle, expiry date and at least one document URL are required");
      return;
    }

    const expiresIso = new Date(
      expiresAt.includes("T") ? expiresAt : `${expiresAt}T23:59:59Z`,
    ).toISOString();
    const payload = {
      service_level: serviceLevel,
      cert_number: certNumber.trim() || undefined,
      issuing_body: issuingBody.trim() || undefined,
      expires_at: expiresIso,
      document_urls: documentUrls.split(",").map((s) => s.trim()).filter(Boolean),
    };

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const url = renewingId
        ? `${SERVER_URL}/api/ambulance/certifications/${renewingId}/renew`
        : `${SERVER_URL}/api/ambulance/certifications`;

      const res = await fetch(url, {
        method: renewingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(renewingId ? { ...payload, vehicle_id: undefined } : { ...payload, vehicle_id: vehicleId }),
      });

      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.message || "Could not submit certification");
        return;
      }

      Alert.alert("Submitted", "Your certification is pending admin review");
      resetForm();
      await loadCerts();
    } catch (err) {
      logger.error("[ambulance-cert] submit error", err);
      Alert.alert("Error", "Could not submit certification");
    } finally {
      setSubmitting(false);
    }
  };

  const statusChip = (status: string) => (
    <View
      style={{ backgroundColor: (STATUS_COLORS[status] ?? "#6B7280") + "1F", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}
      accessibilityLabel={`Certification status: ${status}`}
    >
      <Text style={{ fontSize: 11, fontFamily: "JakartaSemiBold", color: STATUS_COLORS[status] ?? "#6B7280" }}>
        {status}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <Ionicons name="medkit" size={22} color={colors.danger} />
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 10 }}>
          Ambulance Certification
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadCerts(); setRefreshing(false); }} />}
      >
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {certs.map((cert) => (
              <View
                key={cert.id}
                style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor, borderRadius: 14, padding: 14, marginBottom: 10 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ flex: 1, fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary }}>
                    {cert.service_level ?? "—"} · {cert.vehicle_id.slice(0, 8)}…
                  </Text>
                  {statusChip(cert.certification_status)}
                </View>
                {cert.expires_at && (
                  <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 4 }}>
                    Expires {new Date(cert.expires_at).toLocaleDateString("en-GB")}
                  </Text>
                )}
                {cert.review_notes && (
                  <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 4 }}>
                    Reviewer: {cert.review_notes}
                  </Text>
                )}
                <TouchableOpacity
                  onPress={() => startRenew(cert)}
                  accessibilityRole="button"
                  accessibilityLabel={`Renew ${cert.service_level} certification`}
                  style={{ marginTop: 10, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  <Text style={{ fontSize: 12, fontFamily: "JakartaSemiBold", color: colors.primary }}>
                    Renew (re-review required)
                  </Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* Submit / renew form */}
            <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginTop: 8, marginBottom: 8 }}>
              {renewingId ? "Renew certification pair" : "New certification"}
            </Text>
            {renewingId && (
              <View style={{ backgroundColor: colors.amber + "18", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: textPrimary }}>
                  Renewal resets this pair to “pending” — an admin must re-review.
                </Text>
              </View>
            )}

            <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 6 }}>Vehicle ID</Text>
            <TextInput
              style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor, borderRadius: 12, padding: 14, color: textPrimary, fontSize: 14, marginBottom: 12 }}
              placeholder="UUID of your fleet vehicle"
              placeholderTextColor={textSecondary}
              value={vehicleId}
              onChangeText={setVehicleId}
              editable={!renewingId}
              autoCapitalize="none"
              accessibilityLabel="Vehicle ID"
            />

            <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 6 }}>Service level</Text>
            <View style={{ flexDirection: "row", marginBottom: 12 }}>
              {(["BLS", "ALS"] as const).map((lvl) => (
                <TouchableOpacity
                  key={lvl}
                  onPress={() => setServiceLevel(lvl)}
                  accessibilityRole="button"
                  accessibilityLabel={`Service level ${lvl}`}
                  accessibilityState={{ selected: serviceLevel === lvl }}
                  style={{
                    flex: 1, paddingVertical: 12, alignItems: "center",
                    backgroundColor: serviceLevel === lvl ? colors.danger + "18" : surfaceBg,
                    borderWidth: 2, borderColor: serviceLevel === lvl ? colors.danger : borderColor,
                    borderRadius: 12, marginRight: lvl === "BLS" ? 8 : 0,
                  }}
                >
                  <Text style={{ fontSize: 14, fontFamily: "JakartaSemiBold", color: serviceLevel === lvl ? colors.danger : textSecondary }}>
                    {lvl}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 6 }}>Certificate number</Text>
            <TextInput
              style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor, borderRadius: 12, padding: 14, color: textPrimary, fontSize: 14, marginBottom: 12 }}
              placeholder="e.g. ALS-2026-00123"
              placeholderTextColor={textSecondary}
              value={certNumber}
              onChangeText={setCertNumber}
              accessibilityLabel="Certificate number"
            />

            <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 6 }}>Issuing body</Text>
            <TextInput
              style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor, borderRadius: 12, padding: 14, color: textPrimary, fontSize: 14, marginBottom: 12 }}
              placeholder="e.g. Bangladesh Health Ministry"
              placeholderTextColor={textSecondary}
              value={issuingBody}
              onChangeText={setIssuingBody}
              accessibilityLabel="Issuing body"
            />

            <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 6 }}>Expires (YYYY-MM-DD)</Text>
            <TextInput
              style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor, borderRadius: 12, padding: 14, color: textPrimary, fontSize: 14, marginBottom: 12 }}
              placeholder="2027-12-31"
              placeholderTextColor={textSecondary}
              value={expiresAt}
              onChangeText={setExpiresAt}
              autoCapitalize="none"
              accessibilityLabel="Certification expiry date"
            />

            <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 6 }}>Document URLs (comma-separated)</Text>
            <TextInput
              style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor, borderRadius: 12, padding: 14, color: textPrimary, fontSize: 14, minHeight: 70, textAlignVertical: "top", marginBottom: 16 }}
              placeholder="https://…"
              placeholderTextColor={textSecondary}
              value={documentUrls}
              onChangeText={setDocumentUrls}
              multiline
              autoCapitalize="none"
              accessibilityLabel="Document URLs"
            />

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              style={{ backgroundColor: colors.danger, borderRadius: 12, height: 52, alignItems: "center", justifyContent: "center", opacity: submitting ? 0.5 : 1, marginBottom: 40 }}
              accessibilityRole="button"
              accessibilityLabel={renewingId ? "Submit renewal" : "Submit certification"}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontFamily: "JakartaSemiBold" }}>
                  {renewingId ? "Submit Renewal" : "Submit for Review"}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
