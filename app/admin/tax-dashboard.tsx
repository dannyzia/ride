import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, StyleSheet, Alert } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface TaxRate { id: string; name: string; code: string; rate_percent: string; is_active: boolean; }
interface SummaryRow { tax_code: string; transaction_count: number; total_base_amount_bdt: number; total_tax_amount_bdt: number; }

export default function TaxDashboard() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [totalBase, setTotalBase] = useState(0);
  const [totalTax, setTotalTax] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const cfg = await adminFetch<{ rates: TaxRate[] }>("/api/admin/tax/config");
    if (cfg.data) setRates(cfg.data.rates ?? []);
    const dly = await adminFetch<{ breakdown: SummaryRow[]; totalBaseAmountBdt: number; totalTaxAmountBdt: number }>(`/api/admin/tax/daily?date=${date}`);
    if (dly.data) { setSummary(dly.data.breakdown ?? []); setTotalBase(dly.data.totalBaseAmountBdt); setTotalTax(dly.data.totalTaxAmountBdt); }
    setLoading(false);
  };

  const updateRate = async (id: string, rateStr: string) => {
    await adminFetch("/api/admin/tax/config", { method: "POST", body: JSON.stringify({ id, rate_percent: rateStr }), headers: { "Content-Type": "application/json" } });
    fetchData();
  };

  const toggleRate = async (id: string, is_active: boolean) => {
    await adminFetch("/api/admin/tax/config", { method: "POST", body: JSON.stringify({ id, is_active: !is_active }), headers: { "Content-Type": "application/json" } });
    fetchData();
  };

  const exportCsv = async () => {
    const res = await adminFetch<Response>(`/api/admin/tax/report?start=${date}&end=${date}&format=csv`);
    if ((res as any).data) { Alert.alert("CSV Generated", "Report ready for download"); }
  };

  return (
    <AdminShell title="Tax Dashboard" subtitle="Daily tax summary & rate configuration">
      <ScrollView>
        <View style={styles.dateRow}>
          <TextInput style={styles.dateInput} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
          <Pressable style={styles.loadBtn} onPress={fetchData}><Text style={styles.loadBtnText}>Refresh</Text></Pressable>
          <Pressable style={styles.csvBtn} onPress={exportCsv}><Text style={styles.csvBtnText}>Export CSV</Text></Pressable>
        </View>
        {loading ? <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} /> : (
          <>
            <View style={styles.cardsRow}>
              <View style={[styles.statCard, { borderLeftColor: colors.primary }]}>
                <Text style={styles.statLabel}>Total Base</Text>
                <Text style={styles.statValue}>৳{(totalBase / 100).toFixed(2)}</Text>
              </View>
              <View style={[styles.statCard, { borderLeftColor: colors.amber }]}>
                <Text style={styles.statLabel}>Total Tax</Text>
                <Text style={styles.statValue}>৳{(totalTax / 100).toFixed(2)}</Text>
              </View>
            </View>
            <Text style={styles.sectionTitle}>Daily Breakdown</Text>
            {summary.map((r, i) => (
              <View key={i} style={styles.summaryRow}>
                <Text style={styles.summaryCode}>{r.tax_code}</Text>
                <Text style={styles.summaryCount}>{r.transaction_count} txns</Text>
                <Text style={styles.summaryAmt}>Base: ৳{((r.total_base_amount_bdt ?? 0) / 100).toFixed(2)}</Text>
                <Text style={[styles.summaryAmt, { color: colors.amber }]}>Tax: ৳{((r.total_tax_amount_bdt ?? 0) / 100).toFixed(2)}</Text>
              </View>
            ))}
            <Text style={styles.sectionTitle}>Tax Rates</Text>
            {rates.map((r) => (
              <View key={r.id} style={styles.rateRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rateName}>{r.name}</Text>
                  <Text style={styles.rateCode}>{r.code}</Text>
                </View>
                <TextInput style={styles.rateInput} value={String(parseFloat(r.rate_percent || "0"))} onChangeText={(v) => updateRate(r.id, v)} keyboardType="decimal-pad" />
                <Text style={styles.ratePercent}>%</Text>
                <Pressable onPress={() => toggleRate(r.id, r.is_active)}
                  style={[styles.toggleBtn, { backgroundColor: r.is_active ? colors.primary : colors.darkSecondary }]}>
                  <Text style={{ color: "#FFF", fontSize: 11, fontFamily: "Jakarta-Bold" }}>{r.is_active ? "ON" : "OFF"}</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: "row", gap: 8, marginBottom: 16, alignItems: "center" },
  dateInput: { flex: 1, backgroundColor: colors.darkSecondary, color: colors.textPrimaryDark, borderRadius: 8, padding: 10, fontFamily: "Jakarta-Regular", fontSize: 14 },
  loadBtn: { backgroundColor: colors.adminAccent, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  loadBtnText: { color: "#000", fontFamily: "Jakarta-Bold", fontSize: 13 },
  csvBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  csvBtnText: { color: "#FFF", fontFamily: "Jakarta-Bold", fontSize: 13 },
  cardsRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: colors.darkSecondary, borderRadius: 12, padding: 16, borderLeftWidth: 4 },
  statLabel: { color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 },
  statValue: { color: colors.textPrimaryDark, fontFamily: "Jakarta-Bold", fontSize: 24, marginTop: 4 },
  sectionTitle: { color: colors.textSecondaryDark, fontFamily: "Jakarta-Bold", fontSize: 14, marginBottom: 8, marginTop: 16 },
  summaryRow: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: colors.darkSecondary, borderRadius: 8, marginBottom: 4, gap: 12 },
  summaryCode: { color: colors.textPrimaryDark, fontFamily: "Jakarta-Bold", fontSize: 12, width: 140 },
  summaryCount: { color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11, width: 60 },
  summaryAmt: { color: colors.textPrimaryDark, fontFamily: "Jakarta-Bold", fontSize: 11, flex: 1, textAlign: "right" },
  rateRow: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: colors.darkSecondary, borderRadius: 8, marginBottom: 4, gap: 8 },
  rateName: { color: colors.textPrimaryDark, fontFamily: "Jakarta-Bold", fontSize: 13 },
  rateCode: { color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11 },
  rateInput: { backgroundColor: colors.darkSurface, color: colors.textPrimaryDark, borderRadius: 6, padding: 6, fontFamily: "Jakarta-Bold", fontSize: 14, width: 60, textAlign: "center" },
  ratePercent: { color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 14 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
});
