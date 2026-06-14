// F15-UI-08 Referral Campaigns Management
// Admin CRUD for driver referral reward programs. Only one campaign may be
// active at a time — the server enforces this; activating one deactivates the
// previous active campaign.
//
// Schema: referralCampaigns (src/db/schema.ts). Percent fields are integers
// 1–100. max_uses_per_campaign is nullable (null = unlimited, shown as "∞").
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminForm, type AdminField } from "@/components/admin/AdminForm";
import { AdminToggle } from "@/components/admin/AdminToggle";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface ReferralCampaign {
  id: string;
  name: string;
  referrer_reward_percent: number;
  referee_reward_percent: number;
  max_uses_per_referrer: number;
  max_uses_per_campaign: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CampaignsResponse {
  campaigns: ReferralCampaign[];
}

interface CampaignResponse {
  campaign: ReferralCampaign;
}

type Mode = "create" | "edit";

const EMPTY_FORM: Record<string, unknown> = {
  name: "",
  referrer_reward_percent: 10,
  referee_reward_percent: 10,
  max_uses_per_referrer: 1,
  max_uses_per_campaign: "", // empty → null = unlimited
  is_active: true,
};

export default function ReferralCampaignsScreen() {
  const toast = useAdminToast();
  const [campaigns, setCampaigns] = useState<ReferralCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({ ...EMPTY_FORM });
  const [confirmDeactivate, setConfirmDeactivate] =
    useState<ReferralCampaign | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error, status } = await adminFetch<CampaignsResponse>(
      "/api/admin/referral-campaigns",
      { method: "GET" },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(
          `Failed to load campaigns: ${error ?? "unknown"}`,
          "error",
        );
      }
      setCampaigns([]);
    } else {
      setCampaigns(data.campaigns);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openCreate = () => {
    setMode("create");
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setModalVisible(true);
  };

  const openEdit = (c: ReferralCampaign) => {
    setMode("edit");
    setEditingId(c.id);
    setForm({
      name: c.name,
      referrer_reward_percent: c.referrer_reward_percent,
      referee_reward_percent: c.referee_reward_percent,
      max_uses_per_referrer: c.max_uses_per_referrer,
      max_uses_per_campaign:
        c.max_uses_per_campaign == null ? "" : c.max_uses_per_campaign,
      is_active: c.is_active,
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
  };

  const buildPayload = () => {
    const name = String(form.name ?? "").trim();
    if (!name) {
      toast.show("Name is required", "error");
      return null;
    }
    const referrerPct = Number(form.referrer_reward_percent);
    const refereePct = Number(form.referee_reward_percent);
    const maxPerReferrer = Number(form.max_uses_per_referrer);
    const maxPerCampaignRaw = form.max_uses_per_campaign;
    const maxPerCampaignNum =
      maxPerCampaignRaw === "" || maxPerCampaignRaw == null
        ? null
        : Number(maxPerCampaignRaw);

    if (
      !Number.isFinite(referrerPct) ||
      referrerPct < 1 ||
      referrerPct > 100 ||
      !Number.isInteger(referrerPct)
    ) {
      toast.show("Referrer % must be an integer 1–100", "error");
      return null;
    }
    if (
      !Number.isFinite(refereePct) ||
      refereePct < 1 ||
      refereePct > 100 ||
      !Number.isInteger(refereePct)
    ) {
      toast.show("Referee % must be an integer 1–100", "error");
      return null;
    }
    if (
      !Number.isFinite(maxPerReferrer) ||
      maxPerReferrer < 1 ||
      !Number.isInteger(maxPerReferrer)
    ) {
      toast.show("Max/referrer must be a positive integer", "error");
      return null;
    }
    if (
      maxPerCampaignNum !== null &&
      (!Number.isFinite(maxPerCampaignNum) ||
        maxPerCampaignNum < 1 ||
        !Number.isInteger(maxPerCampaignNum))
    ) {
      toast.show("Max total must be a positive integer or blank", "error");
      return null;
    }

    return {
      name,
      referrer_reward_percent: referrerPct,
      referee_reward_percent: refereePct,
      max_uses_per_referrer: maxPerReferrer,
      max_uses_per_campaign: maxPerCampaignNum,
      is_active: Boolean(form.is_active),
    };
  };

  const handleSave = async () => {
    const payload = buildPayload();
    if (!payload) return;

    // Warn the admin that activating will swap out any current active campaign.
    // Server enforces single-active rule regardless; this is informational.
    const willActivate = payload.is_active;
    if (willActivate) {
      const otherActive = campaigns.find(
        (c) => c.is_active && c.id !== editingId,
      );
      if (otherActive) {
        toast.show(
          "Activating will deactivate any other currently-active campaign",
          "warning",
        );
      }
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        const { data, error } = await adminFetch<CampaignResponse>(
          "/api/admin/referral-campaigns",
          { method: "POST", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Create failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Campaign created", "success");
      } else if (editingId) {
        const { data, error } = await adminFetch<CampaignResponse>(
          `/api/admin/referral-campaign/${editingId}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Update failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Campaign updated", "success");
      }
      setModalVisible(false);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (c: ReferralCampaign) => {
    const next = !c.is_active;
    if (next) {
      const otherActive = campaigns.find((x) => x.is_active && x.id !== c.id);
      if (otherActive) {
        toast.show(
          "Activating will deactivate any other currently-active campaign",
          "warning",
        );
      }
    }
    const { error } = await adminFetch<CampaignResponse>(
      `/api/admin/referral-campaign/${c.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      },
    );
    if (error) {
      toast.show(`Toggle failed: ${error}`, "error");
      return;
    }
    toast.show(
      next ? "Campaign activated" : "Campaign deactivated",
      "success",
    );
    await fetchList();
  };

  const openDeactivate = (c: ReferralCampaign) => {
    if (!c.is_active) {
      toast.show("Campaign is already inactive", "info");
      return;
    }
    setConfirmDeactivate(c);
  };

  const confirmDeactivateAction = async () => {
    if (!confirmDeactivate) return;
    setSubmitting(true);
    try {
      const { error } = await adminFetch<CampaignResponse>(
        `/api/admin/referral-campaign/${confirmDeactivate.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_active: false }),
        },
      );
      if (error) {
        toast.show(`Deactivate failed: ${error}`, "error");
        return;
      }
      toast.show("Campaign deactivated", "success");
      setConfirmDeactivate(null);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const fields: AdminField[] = [
    {
      name: "name",
      label: "Name",
      type: "text",
      required: true,
      placeholder: "e.g. Summer Driver Referral",
    },
    {
      name: "referrer_reward_percent",
      label: "Referrer Reward (%)",
      type: "number",
      required: true,
      helpText: "Integer 1–100. Discount applied to referrer's next rides.",
    },
    {
      name: "referee_reward_percent",
      label: "Referee Reward (%)",
      type: "number",
      required: true,
      helpText: "Integer 1–100. Discount applied to new driver's first rides.",
    },
    {
      name: "max_uses_per_referrer",
      label: "Max Uses / Referrer",
      type: "number",
      required: true,
    },
    {
      name: "max_uses_per_campaign",
      label: "Max Uses Total (blank = ∞)",
      type: "number",
      helpText: "Leave blank for unlimited campaign-wide redemptions.",
    },
    {
      name: "is_active",
      label: "Active",
      type: "boolean",
      helpText:
        "Only one campaign can be active. Activating deactivates any other.",
    },
  ];

  const columns: AdminColumn<ReferralCampaign>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (c) => <Text style={styles.cellPrimary}>{c.name}</Text>,
    },
    {
      key: "referrer_reward_percent",
      header: "Referrer %",
      sortable: true,
      width: 110,
      render: (c) => (
        <Text style={styles.cellText}>{c.referrer_reward_percent}%</Text>
      ),
    },
    {
      key: "referee_reward_percent",
      header: "Referee %",
      sortable: true,
      width: 110,
      render: (c) => (
        <Text style={styles.cellText}>{c.referee_reward_percent}%</Text>
      ),
    },
    {
      key: "max_uses_per_referrer",
      header: "Max/Referrer",
      sortable: true,
      width: 120,
    },
    {
      key: "max_uses_per_campaign",
      header: "Max Total",
      sortable: true,
      width: 110,
      render: (c) => (
        <Text style={styles.cellText}>
          {c.max_uses_per_campaign == null ? "∞" : c.max_uses_per_campaign}
        </Text>
      ),
    },
    {
      key: "is_active",
      header: "Active",
      width: 100,
      render: (c) => (
        <AdminToggle
          value={c.is_active}
          onValueChange={() => handleToggleActive(c)}
        />
      ),
    },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      width: 180,
      render: (c) => (
        <Text style={styles.cellText}>
          {new Date(c.created_at).toLocaleString()}
        </Text>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: 220,
      render: (c) => (
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.miniBtn, { backgroundColor: colors.adminAccent }]}
            onPress={() => openEdit(c)}
          >
            <Text style={styles.miniBtnText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[
              styles.miniBtn,
              {
                backgroundColor: colors.danger,
                opacity: c.is_active ? 1 : 0.4,
              },
            ]}
            onPress={() => openDeactivate(c)}
            disabled={!c.is_active}
          >
            <Text style={styles.miniBtnText}>Deactivate</Text>
          </Pressable>
        </View>
      ),
    },
  ];

  return (
    <AdminShell
      title="Referral Campaigns"
      subtitle="Driver referral reward programs"
      actions={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable style={styles.ghostBtn} onPress={fetchList}>
            <Text style={styles.ghostBtnText}>Refresh</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={openCreate}>
            <Text style={styles.primaryBtnText}>+ New Campaign</Text>
          </Pressable>
        </View>
      }
    >
      <AdminTable
        columns={columns}
        rows={campaigns}
        rowKey={(c) => c.id}
        loading={loading}
        emptyMessage="No campaigns yet. Create one to get started."
        pagination={null}
      />

      <AdminModal
        visible={modalVisible}
        title={mode === "create" ? "New Campaign" : "Edit Campaign"}
        onClose={closeModal}
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnGhost]}
              onPress={closeModal}
              disabled={submitting}
            >
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnPrimary]}
              onPress={handleSave}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.modalBtnText}>
                  {mode === "create" ? "Create" : "Save"}
                </Text>
              )}
            </Pressable>
          </View>
        }
      >
        <AdminForm fields={fields} values={form} onChange={setForm} />
      </AdminModal>

      <AdminModal
        visible={!!confirmDeactivate}
        title="Deactivate campaign"
        onClose={() => !submitting && setConfirmDeactivate(null)}
        width={460}
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnGhost]}
              onPress={() => setConfirmDeactivate(null)}
              disabled={submitting}
            >
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, { backgroundColor: colors.danger }]}
              onPress={confirmDeactivateAction}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.modalBtnText}>Deactivate</Text>
              )}
            </Pressable>
          </View>
        }
      >
        <Text style={styles.confirmText}>
          Deactivate this campaign? New referrals will not be tracked against it
          until another campaign is activated.
        </Text>
      </AdminModal>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  cellPrimary: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  cellText: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  miniBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  miniBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
  },
  primaryBtn: {
    backgroundColor: colors.adminAccent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  primaryBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  ghostBtn: {
    backgroundColor: colors.darkSecondary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
  ghostBtnText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 90,
    alignItems: "center",
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
  modalBtnPrimary: { backgroundColor: colors.adminAccent },
  modalBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  confirmText: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    lineHeight: 20,
  },
});
