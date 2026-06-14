// F15-UI-14 Recovery & Override
// Emergency tools: dispatch pause/resume toggle and stuck payment activation
// recovery. Read current dispatch_paused from system-config; mutate via the
// dispatch-toggle endpoint. Manually re-run subscription activation for a
// stuck payment_event_id.
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface DispatchStateResponse {
  dispatch_paused: boolean;
}

interface DispatchToggleResponse {
  dispatch_paused: boolean;
}

interface RecoverResponse {
  payment_event_id: string;
  subscription_id?: string;
  recovered?: boolean;
  already_activated?: boolean;
}

interface RecoverError {
  error: string;
  message?: string;
}

interface SystemConfigItem {
  key: string;
  value: string;
}

interface SystemConfigResponse {
  config: SystemConfigItem[];
}

type RecoverResult =
  | { ok: true; data: RecoverResponse }
  | { ok: false; error: string; message?: string };

export default function RecoveryScreen() {
  const toast = useAdminToast();

  // Dispatch toggle state
  const [dispatchPaused, setDispatchPaused] = useState<boolean | null>(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState<"pause" | "resume" | null>(
    null,
  );
  const [toggling, setToggling] = useState(false);

  // Recovery state
  const [paymentEventId, setPaymentEventId] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [recoverResult, setRecoverResult] = useState<RecoverResult | null>(null);

  const fetchDispatchState = useCallback(async () => {
    setDispatchLoading(true);
    const { data, error, status: httpStatus } =
      await adminFetch<DispatchStateResponse>("/api/admin/dispatch-toggle", {
        method: "GET",
      });
    setDispatchLoading(false);
    if (error || !data) {
      if (httpStatus !== 0) {
        toast.show(
          `Failed to load dispatch state: ${error ?? "unknown"}`,
          "error",
        );
      }
      setDispatchPaused(null);
      return;
    }
    setDispatchPaused(Boolean(data.dispatch_paused));
  }, [toast]);

  useEffect(() => {
    fetchDispatchState();
  }, [fetchDispatchState]);

  const performToggle = async (nextPaused: boolean) => {
    setToggling(true);
    const { data, error, message, status: httpStatus } =
      await adminFetch<DispatchToggleResponse>("/api/admin/dispatch-toggle", {
        method: "POST",
        body: JSON.stringify({ paused: nextPaused }),
      });
    setToggling(false);
    setConfirmToggle(null);
    if (error || !data) {
      toast.show(
        httpStatus === 0 ? "Network error" : message || error || "Toggle failed",
        "error",
      );
      return;
    }
    setDispatchPaused(Boolean(data.dispatch_paused));
    toast.show(
      nextPaused ? "Dispatch paused — no new offers will be sent" : "Dispatch resumed",
      nextPaused ? "warning" : "success",
    );
  };

  const runRecover = async () => {
    const trimmed = paymentEventId.trim();
    if (!trimmed) {
      toast.show("Enter a payment event ID", "warning");
      return;
    }
    setRecovering(true);
    setRecoverResult(null);
    const { data, error, message, status: httpStatus } =
      await adminFetch<RecoverResponse & RecoverError>(
        `/api/admin/payment-event/${encodeURIComponent(trimmed)}/recover`,
        { method: "POST", body: JSON.stringify({}) },
      );
    setRecovering(false);
    if (error || !data) {
      const errResult: RecoverResult = {
        ok: false,
        error: error ?? "recover_failed",
        message: message ?? (httpStatus === 0 ? "Network error" : undefined),
      };
      setRecoverResult(errResult);
      toast.show(
        httpStatus === 0 ? "Network error" : message || error || "Recovery failed",
        "error",
      );
      return;
    }
    const okResult: RecoverResult = {
      ok: true,
      data: {
        payment_event_id: data.payment_event_id,
        subscription_id: data.subscription_id,
        recovered: data.recovered,
        already_activated: data.already_activated,
      },
    };
    setRecoverResult(okResult);
    toast.show(
      data.already_activated
        ? "Payment was already activated — no action taken"
        : `Subscription activated: ${data.subscription_id ?? "—"}`,
      data.already_activated ? "info" : "success",
    );
  };

  const dispatchRunning = dispatchPaused === false;

  return (
    <AdminShell
      title="Recovery & Override"
      subtitle="Emergency payment recovery and dispatch control"
      actions={
        <Pressable style={styles.refreshBtn} onPress={fetchDispatchState}>
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
      }
    >
      <View style={{ gap: 20 }}>
        {/* Dispatch toggle card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Dispatch Control</Text>
            <Text style={styles.cardSub}>
              Pause to immediately stop new ride offers without restarting the server.
              Active ride matches in-flight are unaffected.
            </Text>
          </View>

          <View style={styles.dispatchStatusRow}>
            <View style={{ gap: 4, flex: 1 }}>
              <Text style={styles.fieldLabel}>CURRENT STATE</Text>
              {dispatchLoading ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator color={colors.adminAccent} size="small" />
                  <Text style={styles.statusTextMuted}>loading…</Text>
                </View>
              ) : dispatchPaused === null ? (
                <Text style={styles.statusTextMuted}>unknown</Text>
              ) : (
                <View
                  style={[
                    styles.statePill,
                    dispatchPaused
                      ? styles.statePillDanger
                      : styles.statePillOk,
                  ]}
                >
                  <View
                    style={[
                      styles.stateDot,
                      dispatchPaused ? styles.stateDotDanger : styles.stateDotOk,
                    ]}
                  />
                  <Text
                    style={[
                      styles.statePillText,
                      dispatchPaused
                        ? styles.statePillTextDanger
                        : styles.statePillTextOk,
                    ]}
                  >
                    {dispatchPaused ? "PAUSED" : "RUNNING"}
                  </Text>
                </View>
              )}
            </View>
            <Pressable
              style={[
                styles.dispatchActionBtn,
                dispatchRunning ? styles.dispatchPauseBtn : styles.dispatchResumeBtn,
                (dispatchPaused === null || toggling) && styles.btnDisabled,
              ]}
              onPress={() =>
                setConfirmToggle(dispatchRunning ? "pause" : "resume")
              }
              disabled={dispatchPaused === null || toggling}
            >
              <Text style={styles.dispatchActionBtnText}>
                {dispatchRunning ? "Pause dispatch" : "Resume dispatch"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.footnoteRow}>
            <Text style={styles.footnote}>
              Reads/writes <Text style={styles.code}>system_config.dispatch_paused</Text>.
              Utils server polls this flag on each dispatch cycle.
            </Text>
          </View>
        </View>

        {/* Payment recovery card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Re-run Payment Activation</Text>
            <Text style={styles.cardSub}>
              For a payment_event with status <Text style={styles.code}>paid</Text> that
              failed to activate its subscription (e.g. transient DB error). Safe to
              re-run; idempotent — if already activated, returns the existing
              subscription_id.
            </Text>
          </View>

          <View style={styles.recoverRow}>
            <TextInput
              value={paymentEventId}
              onChangeText={setPaymentEventId}
              placeholder="payment_event UUID"
              placeholderTextColor={colors.textDisabledDark}
              style={styles.recoverInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.recoverBtn, recovering && styles.btnDisabled]}
              onPress={runRecover}
              disabled={recovering}
            >
              {recovering ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.recoverBtnText}>Recover</Text>
              )}
            </Pressable>
          </View>

          {recoverResult ? (
            <View
              style={[
                styles.resultBox,
                recoverResult.ok ? styles.resultBoxOk : styles.resultBoxErr,
              ]}
            >
              <Text style={styles.resultTitle}>
                {recoverResult.ok ? "Recovery succeeded" : "Recovery failed"}
              </Text>
              {recoverResult.ok ? (
                <View style={{ gap: 4 }}>
                  <ResultRow
                    label="Payment event"
                    value={recoverResult.data.payment_event_id}
                  />
                  <ResultRow
                    label="Subscription"
                    value={recoverResult.data.subscription_id ?? "—"}
                  />
                  <ResultRow
                    label="Outcome"
                    value={
                      recoverResult.data.already_activated
                        ? "already activated (no-op)"
                        : recoverResult.data.recovered
                          ? "newly activated"
                          : "no change"
                    }
                  />
                </View>
              ) : (
                <View style={{ gap: 4 }}>
                  <ResultRow
                    label="Error"
                    value={recoverResult.error}
                  />
                  {recoverResult.message ? (
                    <ResultRow label="Message" value={recoverResult.message} />
                  ) : null}
                </View>
              )}
            </View>
          ) : null}
        </View>

        {/* Optional: system-config confirmation */}
        <SystemConfigConfirmation />
      </View>

      {/* Confirm toggle modal */}
      <AdminModal
        visible={!!confirmToggle}
        title={
          confirmToggle === "pause"
            ? "Pause dispatch?"
            : confirmToggle === "resume"
              ? "Resume dispatch?"
              : ""
        }
        onClose={() => setConfirmToggle(null)}
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnGhost]}
              onPress={() => setConfirmToggle(null)}
              disabled={toggling}
            >
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                styles.modalBtn,
                confirmToggle === "pause"
                  ? { backgroundColor: colors.danger }
                  : { backgroundColor: colors.primary },
              ]}
              onPress={() => performToggle(confirmToggle === "pause")}
              disabled={toggling}
            >
              {toggling ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.modalBtnText}>
                  {confirmToggle === "pause" ? "Pause" : "Resume"}
                </Text>
              )}
            </Pressable>
          </View>
        }
      >
        <Text style={styles.modalBodyText}>
          {confirmToggle === "pause"
            ? "This will stop the dispatch server from sending new ride offers. In-flight offers are unaffected. Riders will see longer wait times until dispatch is resumed."
            : "This will re-enable new ride offers immediately. Drivers in the candidate pool become eligible again on the next dispatch cycle."}
        </Text>
      </AdminModal>
    </AdminShell>
  );
}

function SystemConfigConfirmation() {
  const toast = useAdminToast();
  const [items, setItems] = useState<SystemConfigItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    const { data, error, status: httpStatus } =
      await adminFetch<SystemConfigResponse>("/api/admin/system-config", {
        method: "GET",
      });
    setLoading(false);
    if (error || !data) {
      if (httpStatus !== 0) {
        toast.show(`Failed to load config: ${error ?? "unknown"}`, "error");
      }
      setItems([]);
      return;
    }
    setItems(data.config ?? []);
  }, [toast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const dispatchRow = items.find((i) => i.key === "dispatch_paused");

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>System Config Check</Text>
        <Text style={styles.cardSub}>
          Sanity-check of <Text style={styles.code}>system_config</Text> rows the
          controls above rely on.
        </Text>
      </View>

      <View style={styles.configRow}>
        <Text style={styles.configKey}>dispatch_paused</Text>
        {loading ? (
          <Text style={styles.configValueMuted}>loading…</Text>
        ) : dispatchRow ? (
          <Text
            style={[
              styles.configValue,
              dispatchRow.value === "true"
                ? { color: colors.danger }
                : { color: colors.primary },
            ]}
          >
            {dispatchRow.value}
          </Text>
        ) : (
          <Text style={styles.configValueMuted}>not set (defaults to false)</Text>
        )}
      </View>
    </View>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.resultRow}>
      <Text style={styles.resultRowLabel}>{label}</Text>
      <Text style={styles.resultRowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.darkSecondary,
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  cardHeader: {
    gap: 4,
  },
  cardTitle: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
  },
  cardSub: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  code: {
    fontFamily: "Jakarta-SemiBold",
    color: colors.adminAccent,
  },
  fieldLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  dispatchStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
  },
  statusTextMuted: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
  },
  statePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  statePillOk: {
    backgroundColor: colors.primary + "22",
  },
  statePillDanger: {
    backgroundColor: colors.danger + "22",
  },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stateDotOk: {
    backgroundColor: colors.primary,
  },
  stateDotDanger: {
    backgroundColor: colors.danger,
  },
  statePillText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 13,
    letterSpacing: 0.6,
  },
  statePillTextOk: {
    color: colors.primary,
  },
  statePillTextDanger: {
    color: colors.danger,
  },
  dispatchActionBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 160,
    alignItems: "center",
  },
  dispatchPauseBtn: {
    backgroundColor: colors.danger,
  },
  dispatchResumeBtn: {
    backgroundColor: colors.primary,
  },
  dispatchActionBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  footnoteRow: {
    borderTopWidth: 1,
    borderTopColor: "#2A2D35",
    paddingTop: 10,
  },
  footnote: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    lineHeight: 16,
  },
  recoverRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
  },
  recoverInput: {
    flex: 1,
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
  },
  recoverBtn: {
    backgroundColor: colors.adminAccent,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  recoverBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  resultBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  resultBoxOk: {
    backgroundColor: colors.primary + "12",
    borderColor: colors.primary + "55",
  },
  resultBoxErr: {
    backgroundColor: colors.danger + "12",
    borderColor: colors.danger + "55",
  },
  resultTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 13,
    color: colors.textPrimaryDark,
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  resultRowLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
  },
  resultRowValue: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
    flexShrink: 1,
    textAlign: "right",
  },
  configRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  configKey: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  configValue: {
    fontFamily: "Jakarta-Bold",
    fontSize: 14,
  },
  configValueMuted: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
  },
  refreshBtn: {
    backgroundColor: colors.adminAccent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    minWidth: 90,
    alignItems: "center",
  },
  modalBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  modalBtnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
  modalBtnGhostText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  modalBodyText: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    lineHeight: 20,
  },
});
