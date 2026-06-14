// F15-UI-09 Point Offers Management
// Admin CRUD for loyalty point redemption offers. Drivers accumulate points
// and spend them here. reward_type is one of: package_grant | wallet_credit.
// reward_value is a string that holds either a package_id UUID (for
// package_grant) or an integer paisa amount (for wallet_credit).
//
// Schema: pointOffers (src/db/schema.ts). points_required is a positive int.
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

type RewardType = "package_grant" | "wallet_credit";

interface PointOffer {
  id: string;
  title: string;
  points_required: number;
  reward_type: RewardType;
  reward_value: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface OffersResponse {
  offers: PointOffer[];
}

interface OfferResponse {
  offer: PointOffer;
}

type Mode = "create" | "edit";

const REWARD_TYPE_OPTIONS: { label: string; value: RewardType }[] = [
  { label: "Package Grant", value: "package_grant" },
  { label: "Wallet Credit", value: "wallet_credit" },
];

const EMPTY_FORM: Record<string, unknown> = {
  title: "",
  points_required: 100,
  reward_type: "package_grant",
  reward_value: "",
  is_active: true,
};

export default function PointOffersScreen() {
  const toast = useAdminToast();
  const [offers, setOffers] = useState<PointOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({ ...EMPTY_FORM });
  const [confirmDeactivate, setConfirmDeactivate] =
    useState<PointOffer | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    // include_inactive=true so admins see the full list (inactive offers are
    // hidden from drivers but visible to admins).
    const { data, error, status } = await adminFetch<OffersResponse>(
      "/api/admin/point-offers?include_inactive=true",
      { method: "GET" },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(`Failed to load offers: ${error ?? "unknown"}`, "error");
      }
      setOffers([]);
    } else {
      setOffers(data.offers);
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

  const openEdit = (o: PointOffer) => {
    setMode("edit");
    setEditingId(o.id);
    setForm({
      title: o.title,
      points_required: o.points_required,
      reward_type: o.reward_type,
      reward_value: o.reward_value,
      is_active: o.is_active,
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
  };

  const buildPayload = () => {
    const title = String(form.title ?? "").trim();
    if (!title) {
      toast.show("Title is required", "error");
      return null;
    }
    const pointsRequired = Number(form.points_required);
    if (
      !Number.isFinite(pointsRequired) ||
      pointsRequired < 1 ||
      !Number.isInteger(pointsRequired)
    ) {
      toast.show("Points required must be a positive integer", "error");
      return null;
    }
    const rewardType = form.reward_type as RewardType;
    if (rewardType !== "package_grant" && rewardType !== "wallet_credit") {
      toast.show("Reward type must be selected", "error");
      return null;
    }
    const rewardValue = String(form.reward_value ?? "").trim();
    if (!rewardValue) {
      toast.show("Reward value is required", "error");
      return null;
    }
    if (rewardType === "wallet_credit") {
      // Wallet credit value is integer paisa.
      const paisa = Number(rewardValue);
      if (
        !Number.isFinite(paisa) ||
        paisa < 1 ||
        !Number.isInteger(paisa)
      ) {
        toast.show(
          "Wallet credit must be a positive integer paisa amount",
          "error",
        );
        return null;
      }
    }
    return {
      title,
      points_required: pointsRequired,
      reward_type: rewardType,
      reward_value: rewardValue,
      is_active: Boolean(form.is_active),
    };
  };

  const handleSave = async () => {
    const payload = buildPayload();
    if (!payload) return;

    setSubmitting(true);
    try {
      if (mode === "create") {
        const { data, error } = await adminFetch<OfferResponse>(
          "/api/admin/point-offers",
          { method: "POST", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Create failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Offer created", "success");
      } else if (editingId) {
        const { data, error } = await adminFetch<OfferResponse>(
          `/api/admin/point-offer/${editingId}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Update failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Offer updated", "success");
      }
      setModalVisible(false);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (o: PointOffer) => {
    const next = !o.is_active;
    const { error } = await adminFetch<OfferResponse>(
      `/api/admin/point-offer/${o.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      },
    );
    if (error) {
      toast.show(`Toggle failed: ${error}`, "error");
      return;
    }
    toast.show(next ? "Offer activated" : "Offer deactivated", "success");
    await fetchList();
  };

  const openDeactivate = (o: PointOffer) => {
    if (!o.is_active) {
      toast.show("Offer is already inactive", "info");
      return;
    }
    setConfirmDeactivate(o);
  };

  const confirmDeactivateAction = async () => {
    if (!confirmDeactivate) return;
    setSubmitting(true);
    try {
      const { error } = await adminFetch<OfferResponse>(
        `/api/admin/point-offer/${confirmDeactivate.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_active: false }),
        },
      );
      if (error) {
        toast.show(`Deactivate failed: ${error}`, "error");
        return;
      }
      toast.show("Offer deactivated", "success");
      setConfirmDeactivate(null);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const fields: AdminField[] = [
    {
      name: "title",
      label: "Title",
      type: "text",
      required: true,
      placeholder: "e.g. Free Starter 100 Package",
    },
    {
      name: "points_required",
      label: "Points Required",
      type: "number",
      required: true,
    },
    {
      name: "reward_type",
      label: "Reward Type",
      type: "select",
      required: true,
      options: REWARD_TYPE_OPTIONS,
      helpText:
        "package_grant = give a call package (reward_value = package_id). " +
        "wallet_credit = credit driver wallet (reward_value = paisa amount).",
    },
    {
      name: "reward_value",
      label: "Reward Value",
      type: "text",
      required: true,
      placeholder:
        form.reward_type === "wallet_credit"
          ? "paisa, e.g. 5000 (= ৳50)"
          : "package_id UUID",
    },
    { name: "is_active", label: "Active", type: "boolean" },
  ];

  const columns: AdminColumn<PointOffer>[] = [
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (o) => <Text style={styles.cellPrimary}>{o.title}</Text>,
    },
    {
      key: "points_required",
      header: "Points",
      sortable: true,
      width: 100,
      render: (o) => (
        <Text style={styles.cellText}>{o.points_required} pts</Text>
      ),
    },
    {
      key: "reward_type",
      header: "Reward Type",
      width: 150,
      render: (o) => {
        const isWallet = o.reward_type === "wallet_credit";
        return (
          <View
            style={[
              styles.badge,
              isWallet ? styles.badgeWallet : styles.badgePackage,
            ]}
          >
            <Text style={styles.badgeText}>
              {isWallet ? "Wallet Credit" : "Package Grant"}
            </Text>
          </View>
        );
      },
    },
    {
      key: "reward_value",
      header: "Reward Value",
      width: 200,
      render: (o) => {
        if (o.reward_type === "wallet_credit") {
          const paisa = Number(o.reward_value);
          const taka = Number.isFinite(paisa)
            ? (paisa / 100).toFixed(0)
            : o.reward_value;
          return <Text style={styles.cellText}>৳{taka}</Text>;
        }
        // package_id UUID — truncate for display.
        const v = o.reward_value;
        const short = v.length > 13 ? `${v.slice(0, 8)}…` : v;
        return <Text style={styles.cellText}>{short}</Text>;
      },
    },
    {
      key: "is_active",
      header: "Active",
      width: 100,
      render: (o) => (
        <AdminToggle
          value={o.is_active}
          onValueChange={() => handleToggleActive(o)}
        />
      ),
    },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      width: 180,
      render: (o) => (
        <Text style={styles.cellText}>
          {new Date(o.created_at).toLocaleString()}
        </Text>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: 220,
      render: (o) => (
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.miniBtn, { backgroundColor: colors.adminAccent }]}
            onPress={() => openEdit(o)}
          >
            <Text style={styles.miniBtnText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[
              styles.miniBtn,
              {
                backgroundColor: colors.danger,
                opacity: o.is_active ? 1 : 0.4,
              },
            ]}
            onPress={() => openDeactivate(o)}
            disabled={!o.is_active}
          >
            <Text style={styles.miniBtnText}>Deactivate</Text>
          </Pressable>
        </View>
      ),
    },
  ];

  return (
    <AdminShell
      title="Point Offers"
      subtitle="Loyalty rewards drivers redeem with points"
      actions={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable style={styles.ghostBtn} onPress={fetchList}>
            <Text style={styles.ghostBtnText}>Refresh</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={openCreate}>
            <Text style={styles.primaryBtnText}>+ New Offer</Text>
          </Pressable>
        </View>
      }
    >
      <AdminTable
        columns={columns}
        rows={offers}
        rowKey={(o) => o.id}
        loading={loading}
        emptyMessage="No offers yet. Create one to get started."
        pagination={null}
      />

      <AdminModal
        visible={modalVisible}
        title={mode === "create" ? "New Offer" : "Edit Offer"}
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
        title="Deactivate offer"
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
          Deactivate this offer? Drivers will no longer be able to redeem it.
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
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  badgePackage: {
    backgroundColor: "rgba(100, 181, 246, 0.18)",
  },
  badgeWallet: {
    backgroundColor: "rgba(12, 194, 95, 0.18)",
  },
  badgeText: {
    color: colors.adminSubtle,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
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
