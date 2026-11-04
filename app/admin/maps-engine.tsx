// app/admin/maps-engine.tsx
// In-House Mapping & Routing Engine (dpMaps) Configuration Dashboard
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface ServiceHealth {
  status: "healthy" | "unreachable" | "misconfigured";
  latency_ms: number | null;
  message?: string;
}

interface MapsEngineData {
  config: {
    routing_provider_mode: string;
    search_provider_mode: string;
    dpmaps_osrm_car_url: string;
    dpmaps_osrm_bike_url: string;
    dpmaps_osrm_cng_url: string;
    dpmaps_meilisearch_url: string;
    dpmaps_tiles_style_url: string;
    dpmaps_osrm_timeout_ms: string;
    dpmaps_barikoi_timeout_ms: string;
    dpmaps_google_spend_cap_usd: string;
    dpmaps_learning_ingest_enabled: string;
  };
  services_health: {
    osrm_car: ServiceHealth;
    osrm_bike: ServiceHealth;
    osrm_cng: ServiceHealth;
    meilisearch: ServiceHealth;
    barikoi: ServiceHealth;
  };
}

const ROUTING_MODES = [
  {
    key: "off",
    title: "0: Off (Vendor Only)",
    desc: "100% Barikoi vendor routing. Zero dpMaps OSRM calls and zero shadow overhead.",
    badgeColor: "#6B7280",
  },
  {
    key: "shadow",
    title: "1: Shadow Mode (Launch Default)",
    desc: "Barikoi serves live to passengers. dpMaps OSRM runs asynchronously in background to measure accuracy.",
    badgeColor: "#3B82F6",
  },
  {
    key: "primary",
    title: "2: Primary Cutover",
    desc: "dpMaps OSRM serves live first (300ms SLA). Automatically falls back to Barikoi on timeout or error.",
    badgeColor: "#F59E0B",
  },
  {
    key: "sole",
    title: "3: Sole Provider (Full Sovereignty)",
    desc: "100% dpMaps OSRM. Barikoi and Google endpoints severed in code. Maximum independence.",
    badgeColor: "#10B981",
  },
];

const SEARCH_MODES = [
  {
    key: "vendor_only",
    title: "Vendor Only",
    desc: "Barikoi search only. In-house MeiliSearch index inactive.",
  },
  {
    key: "mixed_shadow",
    title: "Mixed Shadow (Launch Default)",
    desc: "Fuses local dpMaps POIs and Barikoi vendor suggestions in RAM per search request.",
  },
  {
    key: "dpmaps_primary",
    title: "dpMaps Primary",
    desc: "In-house POIs served first. Barikoi vendor called strictly on zero local matches.",
  },
  {
    key: "dpmaps_sole",
    title: "dpMaps Sole",
    desc: "100% in-house POI and OSM search. Zero external API calls.",
  },
];

export default function MapsEngineScreen() {
  const { show: showToast } = useAdminToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<MapsEngineData | null>(null);

  // Form states
  const [routingMode, setRoutingMode] = useState("shadow");
  const [searchMode, setSearchMode] = useState("mixed_shadow");
  const [osrmCarUrl, setOsrmCarUrl] = useState("");
  const [osrmBikeUrl, setOsrmBikeUrl] = useState("");
  const [osrmCngUrl, setOsrmCngUrl] = useState("");
  const [meiliUrl, setMeiliUrl] = useState("");
  const [tilesUrl, setTilesUrl] = useState("");
  const [osrmTimeout, setOsrmTimeout] = useState("300");
  const [barikoiTimeout, setBarikoiTimeout] = useState("400");
  const [googleSpendCap, setGoogleSpendCap] = useState("50.00");
  const [learningEnabled, setLearningEnabled] = useState(true);

  // Rollback modal
  const [rollbackModalVisible, setRollbackModalVisible] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<MapsEngineData>("/api/admin/maps-engine");
    if (res.data) {
      setData(res.data);
      const cfg = res.data.config;
      setRoutingMode(cfg.routing_provider_mode || "shadow");
      setSearchMode(cfg.search_provider_mode || "mixed_shadow");
      setOsrmCarUrl(cfg.dpmaps_osrm_car_url || "http://localhost:5001");
      setOsrmBikeUrl(cfg.dpmaps_osrm_bike_url || "http://localhost:5002");
      setOsrmCngUrl(cfg.dpmaps_osrm_cng_url || "http://localhost:5003");
      setMeiliUrl(cfg.dpmaps_meilisearch_url || "http://localhost:7700");
      setTilesUrl(cfg.dpmaps_tiles_style_url || "https://tiles.yourdomain.com/style.json");
      setOsrmTimeout(cfg.dpmaps_osrm_timeout_ms || "300");
      setBarikoiTimeout(cfg.dpmaps_barikoi_timeout_ms || "400");
      setGoogleSpendCap(cfg.dpmaps_google_spend_cap_usd || "50.00");
      setLearningEnabled(cfg.dpmaps_learning_ingest_enabled !== "false");
    } else {
      showToast("Failed to load Maps Engine config", "error");
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    const updates = [
      { key: "routing_provider_mode", value: routingMode },
      { key: "search_provider_mode", value: searchMode },
      { key: "dpmaps_osrm_car_url", value: osrmCarUrl },
      { key: "dpmaps_osrm_bike_url", value: osrmBikeUrl },
      { key: "dpmaps_osrm_cng_url", value: osrmCngUrl },
      { key: "dpmaps_meilisearch_url", value: meiliUrl },
      { key: "dpmaps_tiles_style_url", value: tilesUrl },
      { key: "dpmaps_osrm_timeout_ms", value: osrmTimeout },
      { key: "dpmaps_barikoi_timeout_ms", value: barikoiTimeout },
      { key: "dpmaps_google_spend_cap_usd", value: googleSpendCap },
      { key: "dpmaps_learning_ingest_enabled", value: learningEnabled ? "true" : "false" },
    ];

    const res = await adminFetch("/api/admin/maps-engine", {
      method: "PATCH",
      body: JSON.stringify({ updates }),
    });

    if (res.data) {
      showToast("Maps Engine settings saved successfully", "success");
      fetchConfig();
    } else {
      showToast(res.message || "Failed to update settings", "error");
    }
    setSaving(false);
  };

  const handleExecuteRollback = async () => {
    setRollingBack(true);
    const res = await adminFetch<{ message: string }>("/api/admin/maps-engine", {
      method: "POST",
      body: JSON.stringify({ action: "rollback", target_mode: "shadow" }),
    });

    if (res.data) {
      showToast("Emergency rollback completed: Reverted to Barikoi", "success");
      setRollbackModalVisible(false);
      fetchConfig();
    } else {
      showToast(res.message || "Rollback failed", "error");
    }
    setRollingBack(false);
  };

  const renderHealthPill = (label: string, health?: ServiceHealth) => {
    const isHealthy = health?.status === "healthy";
    const statusColor = isHealthy ? "#10B981" : health?.status === "misconfigured" ? "#F59E0B" : "#EF4444";
    const statusText = isHealthy ? `Online (${health?.latency_ms ?? 0}ms)` : health?.status === "misconfigured" ? "Missing Key" : "Unreachable";

    return (
      <View style={styles.healthPill}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={styles.healthLabel}>{label}</Text>
        <Text style={[styles.healthValue, { color: statusColor }]}>{statusText}</Text>
      </View>
    );
  };

  if (loading && !data) {
    return (
      <AdminShell title="Maps & Location Engine" subtitle="dpMaps integration & provider waterfall">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.adminAccent} />
        </View>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="Maps & Location Engine"
      subtitle="Configure in-house dpMaps engine, routing waterfall, search modes, and emergency fallback"
      actions={
        <Pressable

          style={styles.rollbackButton}
          onPress={() => setRollbackModalVisible(true)}
         testID="admin.maps-engine.set-rollback-modal-visible">
          <MaterialCommunityIcons name="alert-octagon" size={16} color="#FFFFFF" />
          <Text style={styles.rollbackButtonText}>Emergency Rollback</Text>
        </Pressable>
      }
    >
      <ScrollView contentContainerStyle={styles.container}>
        {/* Service Health Overview Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="server-network" size={20} color={colors.adminAccent} />
            <Text style={styles.cardTitle}>Engine Services Health Matrix</Text>
            <Pressable

              style={styles.refreshButton}
              onPress={fetchConfig}
             testID="admin.maps-engine.fetch-config">
              <MaterialCommunityIcons name="refresh" size={16} color={colors.adminAccent} />
            </Pressable>
          </View>
          <View style={styles.healthGrid}>
            {renderHealthPill("OSRM Car", data?.services_health?.osrm_car)}
            {renderHealthPill("OSRM Bike", data?.services_health?.osrm_bike)}
            {renderHealthPill("OSRM CNG", data?.services_health?.osrm_cng)}
            {renderHealthPill("MeiliSearch", data?.services_health?.meilisearch)}
            {renderHealthPill("Barikoi Live API", data?.services_health?.barikoi)}
          </View>
        </View>

        {/* Routing Waterfall Mode */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="routes" size={20} color={colors.adminAccent} />
            <Text style={styles.cardTitle}>Dispatch Routing Waterfall (`ROUTING_PROVIDER_MODE`)</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            Controls how passenger ride quotes, distance, and ETAs are calculated.
          </Text>
          <View style={styles.optionList}>
            {ROUTING_MODES.map((mode) => {
              const selected = routingMode === mode.key;
              return (
                <Pressable
                  key={mode.key}

                  style={[styles.optionCard, selected && styles.optionCardSelected]}
                  onPress={() => setRoutingMode(mode.key)}
                 testID="admin.maps-engine.set-routing-mode">
                  <View style={styles.optionTopRow}>
                    <View style={[styles.radioButton, selected && styles.radioButtonSelected]}>
                      {selected && <View style={styles.radioButtonInner} />}
                    </View>
                    <Text style={styles.optionTitle}>{mode.title}</Text>
                    <View style={[styles.badge, { backgroundColor: mode.badgeColor + "25" }]}>
                      <Text style={[styles.badgeText, { color: mode.badgeColor }]}>{mode.key.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.optionDesc}>{mode.desc}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Search Mode */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="map-search" size={20} color={colors.adminAccent} />
            <Text style={styles.cardTitle}>POI & Address Search Mode (`SEARCH_PROVIDER_MODE`)</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            Controls rider destination search and autocomplete suggestions.
          </Text>
          <View style={styles.optionList}>
            {SEARCH_MODES.map((mode) => {
              const selected = searchMode === mode.key;
              return (
                <Pressable
                  key={mode.key}

                  style={[styles.optionCard, selected && styles.optionCardSelected]}
                  onPress={() => setSearchMode(mode.key)}
                 testID="admin.maps-engine.set-search-mode">
                  <View style={styles.optionTopRow}>
                    <View style={[styles.radioButton, selected && styles.radioButtonSelected]}>
                      {selected && <View style={styles.radioButtonInner} />}
                    </View>
                    <Text style={styles.optionTitle}>{mode.title}</Text>
                  </View>
                  <Text style={styles.optionDesc}>{mode.desc}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Endpoints & Performance Config */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="cog-outline" size={20} color={colors.adminAccent} />
            <Text style={styles.cardTitle}>Service Endpoints & Latency Budgets</Text>
          </View>

          <View style={styles.formRow}>
            <View style={styles.formCol}>
              <Text style={styles.label}>OSRM Car Endpoint URL</Text>
              <TextInput

                style={styles.input}
                value={osrmCarUrl}
                onChangeText={setOsrmCarUrl}
                placeholder="http://localhost:5001"
                placeholderTextColor={colors.textSecondaryDark}
               testID="admin.maps-engine.set-osrm-car-url"/>
            </View>
            <View style={styles.formCol}>
              <Text style={styles.label}>OSRM Bike Endpoint URL</Text>
              <TextInput

                style={styles.input}
                value={osrmBikeUrl}
                onChangeText={setOsrmBikeUrl}
                placeholder="http://localhost:5002"
                placeholderTextColor={colors.textSecondaryDark}
               testID="admin.maps-engine.set-osrm-bike-url"/>
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={styles.formCol}>
              <Text style={styles.label}>OSRM CNG Endpoint URL</Text>
              <TextInput

                style={styles.input}
                value={osrmCngUrl}
                onChangeText={setOsrmCngUrl}
                placeholder="http://localhost:5003"
                placeholderTextColor={colors.textSecondaryDark}
               testID="admin.maps-engine.set-osrm-cng-url"/>
            </View>
            <View style={styles.formCol}>
              <Text style={styles.label}>MeiliSearch Search Index URL</Text>
              <TextInput

                style={styles.input}
                value={meiliUrl}
                onChangeText={setMeiliUrl}
                placeholder="http://localhost:7700"
                placeholderTextColor={colors.textSecondaryDark}
               testID="admin.maps-engine.set-meili-url"/>
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={styles.formColFull}>
              <Text style={styles.label}>MapLibre Vector Tiles Style URL</Text>
              <TextInput

                style={styles.input}
                value={tilesUrl}
                onChangeText={setTilesUrl}
                placeholder="https://tiles.yourdomain.com/style.json"
                placeholderTextColor={colors.textSecondaryDark}
               testID="admin.maps-engine.set-tiles-url"/>
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={styles.formCol}>
              <Text style={styles.label}>OSRM SLA Timeout (ms)</Text>
              <TextInput

                style={styles.input}
                value={osrmTimeout}
                onChangeText={setOsrmTimeout}
                keyboardType="numeric"
               testID="admin.maps-engine.set-osrm-timeout"/>
            </View>
            <View style={styles.formCol}>
              <Text style={styles.label}>Barikoi Timeout (ms)</Text>
              <TextInput

                style={styles.input}
                value={barikoiTimeout}
                onChangeText={setBarikoiTimeout}
                keyboardType="numeric"
               testID="admin.maps-engine.set-barikoi-timeout"/>
            </View>
            <View style={styles.formCol}>
              <Text style={styles.label}>Google Cap ($USD/mo)</Text>
              <TextInput

                style={styles.input}
                value={googleSpendCap}
                onChangeText={setGoogleSpendCap}
                keyboardType="numeric"
               testID="admin.maps-engine.set-google-spend-cap"/>
            </View>
          </View>
        </View>

        {/* Continuous Learning & Privacy */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="brain" size={20} color={colors.adminAccent} />
            <Text style={styles.cardTitle}>Telemetry Ingestion & Continuous Learning</Text>
          </View>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextContainer}>
              <Text style={styles.toggleTitle}>Ingest Completed Trip Drop-off GPS</Text>
              <Text style={styles.toggleDesc}>
                Forwards physical driver handset dropoff coordinates and scrubbed search queries to the dpMaps evidence ledger.
              </Text>
            </View>
            <Switch

              value={learningEnabled}
              onValueChange={setLearningEnabled}
              trackColor={{ false: "#374151", true: colors.adminAccent }}
             testID="admin.maps-engine.set-learning-enabled"/>
          </View>
          <View style={styles.cleanRoomBadge}>
            <MaterialCommunityIcons name="shield-check" size={16} color="#10B981" />
            <Text style={styles.cleanRoomText}>
              Clean Room Invariant Enforced: Zero vendor coordinates, vendor IDs, or user trip IDs are ever stored.
            </Text>
          </View>
        </View>

        {/* Save Bar */}
        <View style={styles.saveContainer}>
          <Pressable

            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
           testID="admin.maps-engine.handle-save">
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="content-save" size={18} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Save Engine Configuration</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>

      {/* Emergency Rollback Modal */}
      <AdminModal
        visible={rollbackModalVisible}
        title="Confirm Emergency Rollback"
        onClose={() => setRollbackModalVisible(false)}
      >
        <View style={styles.modalContent}>
          <MaterialCommunityIcons name="alert" size={32} color="#EF4444" style={styles.modalIcon} />
          <Text style={styles.modalText}>
            Are you sure you want to trigger an immediate emergency rollback?
          </Text>
          <Text style={styles.modalSubtext}>
            This will immediately force Routing to Shadow Mode (reverting all passenger quotes to Barikoi) and Search to Vendor Only.
          </Text>
          <View style={styles.modalActions}>
            <Pressable

              style={styles.modalCancelButton}
              onPress={() => setRollbackModalVisible(false)}
             testID="admin.maps-engine.set-rollback-modal-visible-2">
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable

              style={styles.modalConfirmButton}
              onPress={handleExecuteRollback}
              disabled={rollingBack}
             testID="admin.maps-engine.handle-execute-rollback">
              {rollingBack ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modalConfirmText}>Execute Rollback</Text>
              )}
            </Pressable>
          </View>
        </View>
      </AdminModal>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 20,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: colors.surfaceElevatedDark,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderDark,
    gap: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimaryDark,
    flex: 1,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.textSecondaryDark,
    lineHeight: 18,
  },
  refreshButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: colors.darkSurface,
  },
  healthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  healthPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.darkSurface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  healthLabel: {
    fontSize: 13,
    color: colors.textPrimaryDark,
    fontWeight: "500",
  },
  healthValue: {
    fontSize: 12,
    fontWeight: "600",
  },
  optionList: {
    gap: 10,
  },
  optionCard: {
    backgroundColor: colors.darkSurface,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1.5,
    borderColor: colors.borderDark,
    gap: 6,
  },
  optionCardSelected: {
    borderColor: colors.adminAccent,
    backgroundColor: colors.adminAccent + "0D",
  },
  optionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  radioButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.textSecondaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  radioButtonSelected: {
    borderColor: colors.adminAccent,
  },
  radioButtonInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.adminAccent,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimaryDark,
    flex: 1,
  },
  optionDesc: {
    fontSize: 12,
    color: colors.textSecondaryDark,
    paddingLeft: 28,
    lineHeight: 16,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  formRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  formCol: {
    flex: 1,
    minWidth: 220,
    gap: 6,
  },
  formColFull: {
    flex: 1,
    minWidth: "100%",
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textPrimaryDark,
  },
  input: {
    backgroundColor: colors.darkSurface,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimaryDark,
    fontSize: 13,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleTextContainer: {
    flex: 1,
    paddingRight: 16,
    gap: 4,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimaryDark,
  },
  toggleDesc: {
    fontSize: 12,
    color: colors.textSecondaryDark,
    lineHeight: 16,
  },
  cleanRoomBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#10B98115",
    padding: 10,
    borderRadius: 6,
  },
  cleanRoomText: {
    fontSize: 12,
    color: "#10B981",
    flex: 1,
    lineHeight: 16,
  },
  saveContainer: {
    alignItems: "flex-end",
    paddingTop: 10,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.adminAccent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  rollbackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EF4444",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  rollbackButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  modalContent: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  modalIcon: {
    marginBottom: 4,
  },
  modalText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimaryDark,
    textAlign: "center",
  },
  modalSubtext: {
    fontSize: 13,
    color: colors.textSecondaryDark,
    textAlign: "center",
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    width: "100%",
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.darkSurface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  modalCancelText: {
    color: colors.textPrimaryDark,
    fontWeight: "600",
    fontSize: 13,
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
  },
  modalConfirmText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
});

