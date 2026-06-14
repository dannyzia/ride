// F15-UI-06 Promo Codes Management
// Admin CRUD for rider-facing discount codes. discount_type is percent|flat.
// discount_value is integer: percent (0-100) when type=percent, or paisa when
// type=flat. max_discount_bdt / min_spend_bdt are integer paisa in the DB but
// edited/displayed in taka on this screen (×100 on save, /100 on display).
//
// Schema: promoCodes (src/db/schema.ts L361).
// API:    app/api/admin/promos+api.ts (GET/POST/PATCH/DELETE).
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
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminForm, type AdminField } from "@/components/admin/AdminForm";
import { AdminToggle } from "@/components/admin/AdminToggle";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

type DiscountType = "percent" | "flat";

// The GET /api/admin/promos endpoint projects rows into this shape (see API).
interface PromoRow {
  promo_id: string;
  code: string;
  title: string | null;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  max_uses: number | null;
  max_uses_per_rider: number;
  max_discount_bdt: number | null;
  min_spend_bdt: number | null;
  usage_interval: number | null;
  valid_from: string;
  expires_at: string;
  is_active: boolean;
  times_used: number;
}

interface PromosResponse {
  promos: PromoRow[];
  total: number;
  has_more: boolean;
}

interface PromoResponse {
  promo?: Partial<PromoRow>;
  promo_id?: string;
  code?: string;
}

type Mode = "create" | "edit";

const DISCOUNT_TYPE_OPTIONS: { label: string; value: DiscountType }[] = [
  { label: "Percent (%)", value: "percent" },
  { label: "Flat (৳)", value: "flat" },
];

// Form holds taka for *_bdt money fields; converted to paisa at save time.
interface PromoForm {
  code: string;
  title: string;
  description: string;
  discount_type: DiscountType;
  discount_value: number;
  max_uses: string; // optional → empty string
  max_uses_per_rider: number;
  max_discount_taka: string; // optional → empty string
  min_spend_taka: string; // optional → empty string
  usage_interval: string; // optional → empty string
  valid_from: string | null;
  expires_at: string | null;
  is_active: boolean;
}

const EMPTY_FORM: PromoForm = {
  code: "",
  title: "",
  description: "",
  discount_type: "percent",
  discount_value: 10,
  max_uses: "",
  max_uses_per_rider: 1,
  max_discount_taka: "",
  min_spend_taka: "",
  usage_interval: "",
  valid_from: null,
  expires_at: null,
  is_active: true,
};

function discountDisplay(p: PromoRow): string {
  if (p.discount_type === "percent") return `${p.discount_value}%`;
  return `৳${(p.discount_value / 100).toFixed(0)}`;
}

export default function PromosScreen() {
  const toast = useAdminToast();
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromoForm>({ ...EMPTY_FORM });
  const [confirmDeactivate, setConfirmDeactivate] = useState<PromoRow | null>(
    null,
  );

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error, status } = await adminFetch<PromosResponse>(
      "/api/admin/promos?status=all&limit=200",
      { method: "GET" },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(`Failed to load promos: ${error ?? "unknown"}`, "error");
      }
      setPromos([]);
    } else {
      setPromos(data.promos ?? []);
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

  const openEdit = (p: PromoRow) => {
    setMode("edit");
    setEditingId(p.promo_id);
    setForm({
      code: p.code,
      title: p.title ?? "",
      description: p.description ?? "",
      discount_type: p.discount_type,
      // Flat discount_value is stored as paisa; show taka in the form. Percent
      // is integer 1-100 and is shown as-is.
      discount_value:
        p.discount_type === "flat" ? p.discount_value / 100 : p.discount_value,
      max_uses: p.max_uses == null ? "" : String(p.max_uses),
      max_uses_per_rider: p.max_uses_per_rider,
      max_discount_taka:
        p.max_discount_bdt == null ? "" : String(p.max_discount_bdt / 100),
      min_spend_taka:
        p.min_spend_bdt == null ? "" : String(p.min_spend_bdt / 100),
      usage_interval: p.usage_interval == null ? "" : String(p.usage_interval),
      valid_from: p.valid_from,
      expires_at: p.expires_at,
      is_active: p.is_active,
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
  };

  // Parse an optional numeric field. Empty string → null. Non-finite / negative
  // → throws with a message; caller surfaces via toast.
  function parseOptionalInt(
    raw: string,
    fieldName: string,
    opts: { allowZero?: boolean } = {},
  ): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new Error(`${fieldName} must be a whole number`);
    }
    if (!opts.allowZero && n <= 0) {
      throw new Error(`${fieldName} must be a positive integer`);
    }
    if (opts.allowZero && n < 0) {
      throw new Error(`${fieldName} cannot be negative`);
    }
    return n;
  }

  const buildPayload = (): Record<string, unknown> | null => {
    const code = String(form.code).trim().toUpperCase();
    if (!code) {
      toast.show("Code is required", "error");
      return null;
    }
    const validFrom = form.valid_from;
    const expiresAt = form.expires_at;
    if (!validFrom || !expiresAt) {
      toast.show("Valid from and expires at are required", "error");
      return null;
    }
    if (new Date(expiresAt).getTime() <= new Date(validFrom).getTime()) {
      toast.show("Expires at must be after valid from", "error");
      return null;
    }
    const discountValue = Number(form.discount_value);
    if (
      !Number.isFinite(discountValue) ||
      !Number.isInteger(discountValue) ||
      discountValue <= 0
    ) {
      toast.show("Discount value must be a positive integer", "error");
      return null;
    }
    if (form.discount_type === "percent" && discountValue > 100) {
      toast.show("Percent discount cannot exceed 100", "error");
      return null;
    }
    // Flat discount_value: admin enters taka, API stores paisa (×100).
    const discountValuePaisaOrPercent =
      form.discount_type === "flat" ? discountValue * 100 : discountValue;
    const maxUsesPerRider = Number(form.max_uses_per_rider);
    if (
      !Number.isFinite(maxUsesPerRider) ||
      !Number.isInteger(maxUsesPerRider) ||
      maxUsesPerRider <= 0
    ) {
      toast.show("Max uses per rider must be a positive integer", "error");
      return null;
    }

    // Optional fields — surface parse errors via toast.
    let maxUses: number | null;
    let maxDiscountPaisa: number | null;
    let minSpendPaisa: number | null;
    let usageInterval: number | null;
    try {
      maxUses = parseOptionalInt(form.max_uses, "Max uses");
      // Flat discount value is paisa; percent is integer 0-100.
      maxDiscountPaisa = parseOptionalInt(
        form.max_discount_taka,
        "Max discount",
      );
      if (maxDiscountPaisa != null) maxDiscountPaisa = maxDiscountPaisa * 100;
      minSpendPaisa = parseOptionalInt(form.min_spend_taka, "Min spend");
      if (minSpendPaisa != null) minSpendPaisa = minSpendPaisa * 100;
      usageInterval = parseOptionalInt(form.usage_interval, "Usage interval");
    } catch (e) {
      toast.show((e as Error).message, "error");
      return null;
    }

    return {
      code,
      title: String(form.title).trim() || undefined,
      description: String(form.description).trim() || undefined,
      discount_type: form.discount_type,
      discount_value: discountValuePaisaOrPercent,
      max_uses: maxUses,
      max_uses_per_rider: maxUsesPerRider,
      max_discount_bdt: maxDiscountPaisa,
      min_spend_bdt: minSpendPaisa,
      usage_interval: usageInterval,
      valid_from: validFrom,
      expires_at: expiresAt,
      is_active: Boolean(form.is_active),
    };
  };

  const handleSave = async () => {
    const payload = buildPayload();
    if (!payload) return;

    setSubmitting(true);
    try {
      if (mode === "create") {
        const { data, error } = await adminFetch<PromoResponse>(
          "/api/admin/promos",
          { method: "POST", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Create failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Promo created", "success");
      } else if (editingId) {
        const { data, error } = await adminFetch<PromoResponse>(
          `/api/admin/promos?id=${encodeURIComponent(editingId)}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Update failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Promo updated", "success");
      }
      setModalVisible(false);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (p: PromoRow) => {
    const next = !p.is_active;
    const { error } = await adminFetch<PromoResponse>(
      `/api/admin/promos?id=${encodeURIComponent(p.promo_id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      },
    );
    if (error) {
      toast.show(`Toggle failed: ${error}`, "error");
      return;
    }
    toast.show(next ? "Promo activated" : "Promo deactivated", "success");
    await fetchList();
  };

  const openDeactivate = (p: PromoRow) => {
    if (!p.is_active) {
      toast.show("Promo is already inactive", "info");
      return;
    }
    setConfirmDeactivate(p);
  };

  const confirmDeactivateAction = async () => {
    if (!confirmDeactivate) return;
    setSubmitting(true);
    try {
      const { error } = await adminFetch<PromoResponse>(
        `/api/admin/promos?id=${encodeURIComponent(confirmDeactivate.promo_id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_active: false }),
        },
      );
      if (error) {
        toast.show(`Deactivate failed: ${error}`, "error");
        return;
      }
      toast.show("Promo deactivated", "success");
      setConfirmDeactivate(null);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const searchTerm = search.trim().toLowerCase();
  const filteredPromos = promos.filter((p) => {
    if (!searchTerm) return true;
    return (
      p.code.toLowerCase().includes(searchTerm) ||
      (p.title?.toLowerCase().includes(searchTerm) ?? false)
    );
  });

  const fields: AdminField[] = [
    {
      name: "code",
      label: "Code",
      type: "text",
      required: true,
      placeholder: "e.g. WELCOME50",
      helpText: "Stored uppercase. Riders type this at checkout.",
    },
    {
      name: "title",
      label: "Title",
      type: "text",
      placeholder: "Short display name (optional)",
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      placeholder: "Internal description (optional)",
    },
    {
      name: "discount_type",
      label: "Discount Type",
      type: "select",
      required: true,
      options: DISCOUNT_TYPE_OPTIONS,
    },
    {
      name: "discount_value",
      label: "Discount Value",
      type: "number",
      required: true,
      step: 1,
      helpText:
        "Percent (1-100) when type=percent. Taka amount when type=flat (×100 to paisa on save).",
    },
    {
      name: "max_uses",
      label: "Max Uses (total, blank = unlimited)",
      type: "number",
      step: 1,
    },
    {
      name: "max_uses_per_rider",
      label: "Max Uses Per Rider",
      type: "number",
      required: true,
      step: 1,
    },
    {
      name: "usage_interval",
      label: "Usage Interval (every Nth ride, blank = none)",
      type: "number",
      step: 1,
      helpText:
        "When set, this promo is only valid on every Nth completed ride.",
    },
    {
      name: "max_discount_taka",
      label: "Max Discount (৳, blank = none)",
      type: "number",
      step: 1,
      helpText:
        "Cap on discount amount in taka. Usually used with percent type.",
    },
    {
      name: "min_spend_taka",
      label: "Min Spend (৳, blank = none)",
      type: "number",
      step: 1,
    },
    {
      name: "valid_from",
      label: "Valid From",
      type: "datetime",
      required: true,
    },
    {
      name: "expires_at",
      label: "Expires At",
      type: "datetime",
      required: true,
    },
    { name: "is_active", label: "Active", type: "boolean" },
  ];

  // AdminForm works on Record<string, unknown>; bridge to/from PromoForm.
  const formValues: Record<string, unknown> = { ...form };
  const onChangeForm = (next: Record<string, unknown>) =>
    setForm({ ...EMPTY_FORM, ...(next as Partial<PromoForm>) });

  const columns: AdminColumn<PromoRow>[] = [
    {
      key: "code",
      header: "Code",
      sortable: true,
      width: 140,
      render: (p) => (
        <Text style={styles.cellPrimary}>{p.code.toUpperCase()}</Text>
      ),
    },
    {
      key: "title",
      header: "Title",
      width: 180,
      render: (p) => <Text style={styles.cellText}>{p.title ?? "—"}</Text>,
    },
    {
      key: "discount_value",
      header: "Discount",
      width: 110,
      sortable: true,
      render: (p) => <Text style={styles.cellText}>{discountDisplay(p)}</Text>,
    },
    {
      key: "max_uses",
      header: "Max Uses",
      width: 120,
      render: (p) => (
        <Text style={styles.cellText}>
          {p.max_uses == null ? "∞" : `${p.times_used}/${p.max_uses}`}
        </Text>
      ),
    },
    {
      key: "max_uses_per_rider",
      header: "Max / Rider",
      width: 110,
      sortable: true,
      render: (p) => (
        <Text style={styles.cellText}>{p.max_uses_per_rider}</Text>
      ),
    },
    {
      key: "usage_interval",
      header: "Interval",
      width: 100,
      render: (p) => (
        <Text style={styles.cellText}>
          {p.usage_interval == null ? "—" : `every ${p.usage_interval}`}
        </Text>
      ),
    },
    {
      key: "is_active",
      header: "Active",
      width: 90,
      render: (p) => (
        <AdminToggle
          value={p.is_active}
          onValueChange={() => handleToggleActive(p)}
        />
      ),
    },
    {
      key: "valid_from",
      header: "Valid From",
      width: 180,
      sortable: true,
      render: (p) => (
        <Text style={styles.cellText}>
          {new Date(p.valid_from).toLocaleString()}
        </Text>
      ),
    },
    {
      key: "expires_at",
      header: "Expires",
      width: 180,
      sortable: true,
      render: (p) => (
        <Text style={styles.cellText}>
          {new Date(p.expires_at).toLocaleString()}
        </Text>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: 220,
      render: (p) => (
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.miniBtn, { backgroundColor: colors.adminAccent }]}
            onPress={() => openEdit(p)}
          >
            <Text style={styles.miniBtnText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[
              styles.miniBtn,
              {
                backgroundColor: colors.danger,
                opacity: p.is_active ? 1 : 0.4,
              },
            ]}
            onPress={() => openDeactivate(p)}
            disabled={!p.is_active}
          >
            <Text style={styles.miniBtnText}>Deactivate</Text>
          </Pressable>
        </View>
      ),
    },
  ];

  return (
    <AdminShell
      title="Promo Codes"
      subtitle="Discount codes for riders"
      actions={
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <View style={styles.searchWrap}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search code or title…"
              placeholderTextColor={colors.textDisabledDark}
              style={styles.searchInput}
            />
          </View>
          <Pressable style={styles.ghostBtn} onPress={fetchList}>
            <Text style={styles.ghostBtnText}>Refresh</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={openCreate}>
            <Text style={styles.primaryBtnText}>+ New Promo</Text>
          </Pressable>
        </View>
      }
    >
      <AdminTable
        columns={columns}
        rows={filteredPromos}
        rowKey={(p) => p.promo_id}
        loading={loading}
        emptyMessage={
          searchTerm
            ? `No promos match "${searchTerm}".`
            : "No promos yet. Create one to get started."
        }
        pagination={null}
      />

      <AdminModal
        visible={modalVisible}
        title={mode === "create" ? "New Promo" : "Edit Promo"}
        onClose={closeModal}
        width={620}
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
        <AdminForm
          fields={fields}
          values={formValues}
          onChange={onChangeForm}
        />
      </AdminModal>

      <AdminModal
        visible={!!confirmDeactivate}
        title="Deactivate promo"
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
          {`Deactivate "${confirmDeactivate?.code ?? ""}"? Riders will no longer be able to apply this code.`}
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
  searchWrap: {
    backgroundColor: colors.darkSecondary,
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 0,
    minWidth: 200,
  },
  searchInput: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    paddingVertical: 8,
    paddingHorizontal: 4,
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
