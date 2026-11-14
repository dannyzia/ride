import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { formatBdt } from "@/lib/money";
import { supabase } from "@/lib/supabase";
import { API_URL } from "@/lib/config";
import { colors } from "@/theme/goRide";

interface TaxRate { id: string; name: string; code: string; rate_percent: string; is_active: boolean; }
interface SummaryRow { tax_code: string; transaction_count: number; total_base_amount_bdt: number; total_tax_amount_bdt: number; }

// Mirrors the server-side rule in app/api/admin/tax/config+api.ts.
const RATE_RE = /^\d{1,3}(\.\d{1,2})?$/;

export default function TaxDashboard() {
  const toast = useAdminToast();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [totalBase, setTotalBase] = useState(0);
  const [totalTax, setTotalTax] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});

  useEffect(() => { void fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const cfg = await adminFetch<{ rates: TaxRate[] }>("/api/admin/tax/config");
    if (cfg.error) toast.show(cfg.message ?? cfg.error, "error");
    else setRates(cfg.data?.rates ?? []);

    const dly = await adminFetch<{ breakdown: SummaryRow[]; totalBaseAmountBdt: number; totalTaxAmountBdt: number }>(`/api/admin/tax/daily?date=${date}`);
    if (dly.error) toast.show(dly.message ?? dly.error, "error");
    else {
      setSummary(dly.data?.breakdown ?? []);
      setTotalBase(dly.data?.totalBaseAmountBdt ?? 0);
      setTotalTax(dly.data?.totalTaxAmountBdt ?? 0);
    }
    setLoading(false);
  };

  /**
   * Rates are saved explicitly, never per keystroke: typing "12" fired a POST
   * for "1" and then "12", and out-of-order responses could leave the live
   * rate at 1%.
   */
  const saveRate = async (rate: TaxRate) => {
    const draft = rateDrafts[rate.id];
    if (draft === undefined || draft === rate.rate_percent) return;
    if (!RATE_RE.test(draft.trim()) || Number(draft) > 100) {
      toast.show("Rate must be 0-100 with up to 2 decimals", "error");
      return;
    }
    const res = await adminFetch("/api/admin/tax/config", {
      method: "POST",
      body: JSON.stringify({ id: rate.id, rate_percent: draft.trim() }),
      headers: { "Content-Type": "application/json" },
    });
    if (res.error || !res.data) {
      toast.show(res.message ?? res.error ?? "Save failed", "error");
      return;
    }
    toast.show(`${rate.code} set to ${draft.trim()}%`, "success");
    setRateDrafts((prev) => {
      const next = { ...prev };
      delete next[rate.id];
      return next;
    });
    void fetchData();
  };

  const toggleRate = async (rate: TaxRate) => {
    const res = await adminFetch("/api/admin/tax/config", {
      method: "POST",
      body: JSON.stringify({ id: rate.id, is_active: !rate.is_active }),
      headers: { "Content-Type": "application/json" },
    });
    if (res.error) toast.show(res.message ?? res.error, "error");
    else {
      toast.show(`${rate.code} ${rate.is_active ? "disabled" : "enabled"}`, "success");
      void fetchData();
    }
  };

  const exportCsv = async () => {
    // The endpoint returns text/csv, so it cannot go through adminFetch (JSON-only).
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.show("Not authenticated", "error");
      return;
    }
    const res = await fetch(`${API_URL}/api/admin/tax/report?start=${date}&end=${date}&format=csv`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      toast.show(`Export failed (${res.status})`, "error");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tax-report-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.show("CSV downloaded", "success");
  };

  return (
    <AdminShell title="Tax Dashboard" subtitle="Daily tax summary & rate configuration">
      <ScrollView>
        <View style={styles.dateRow}>
          <TextInput style={styles.dateInput} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD"  testID="admin.tax-dashboard.set-date"/>
          <Pressable style={styles.loadBtn} onPress={fetchData} testID="admin.tax-dashboard.fetch-data"><Text style={styles.loadBtnText}>Refresh</Text></Pressable>
          <Pressable style={styles.csvBtn} onPress={() => void exportCsv()} testID="admin.tax-dashboard.export-csv"><Text style={styles.csvBtnText}>Export CSV</Text></Pressable>
        </View>
        {loading ? <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} /> : (
          <>
            <View style={styles.cardsRow}>
              <View style={[styles.statCard, { borderLeftColor: colors.primary }]}>
                <Text style={styles.statLabel}>Total Base</Text>
                <Text style={styles.statValue}>{formatBdt(totalBase)}</Text>
              </View>
              <View style={[styles.statCard, { borderLeftColor: colors.amber }]}>
                <Text style={styles.statLabel}>Total Tax</Text>
                <Text style={styles.statValue}>{formatBdt(totalTax)}</Text>
              </View>
            </View>
            <Text style={styles.sectionTitle}>Daily Breakdown</Text>
            {summary.map((r, i) => (
              <View key={i} style={styles.summaryRow}>
                <Text style={styles.summaryCode}>{r.tax_code}</Text>
                <Text style={styles.summaryCount}>{r.transaction_count} txns</Text>
                <Text style={styles.summaryAmt}>Base: {formatBdt(r.total_base_amount_bdt ?? 0)}</Text>
                <Text style={[styles.summaryAmt, { color: colors.amber }]}>Tax: {formatBdt(r.total_tax_amount_bdt ?? 0)}</Text>
              </View>
            ))}
            <Text style={styles.sectionTitle}>Tax Rates</Text>
            {rates.map((r) => {
              const draft = rateDrafts[r.id];
              const dirty = draft !== undefined && draft !== r.rate_percent;
              return (
                <View key={r.id} style={styles.rateRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rateName}>{r.name}</Text>
                    <Text style={styles.rateCode}>{r.code}</Text>
                  </View>
                  <TextInput
                    style={styles.rateInput}
                    value={draft ?? r.rate_percent}
                    onChangeText={(v) => setRateDrafts((prev) => ({ ...prev, [r.id]: v }))}
                    keyboardType="decimal-pad"
                   
                   testID="admin.tax-dashboard.set-rate-drafts"/>
                  <Text style={styles.ratePercent}>%</Text>
                  {dirty ? (
                    <Pressable onPress={() => void saveRate(r)} style={styles.saveBtn} testID="admin.tax-dashboard.save-rate">
                      <Text style={styles.saveBtnText}>Save</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => void toggleRate(r)}
                    style={[styles.toggleBtn, { backgroundColor: r.is_active ? colors.primary : colors.darkSecondary }]} testID="admin.tax-dashboard.toggle-rate">
                    <Text style={{ color: "#FFF", fontSize: 11, fontFamily: "Jakarta-Bold" }}>{r.is_active ? "ON" : "OFF"}</Text>
                  </Pressable>
                </View>
              );
            })}
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
  saveBtn: { backgroundColor: colors.adminAccent, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  saveBtnText: { color: "#000", fontFamily: "Jakarta-Bold", fontSize: 11 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
});
