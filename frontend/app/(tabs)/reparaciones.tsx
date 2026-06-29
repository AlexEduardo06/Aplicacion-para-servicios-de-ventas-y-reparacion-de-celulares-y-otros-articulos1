import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { theme } from "@/src/lib/theme";
import { api, formatCurrency, formatDate, Repair, RepairStatus } from "@/src/lib/api";

const STATUS_META: Record<RepairStatus, { label: string; bg: string; fg: string }> = {
  recibido: { label: "Recibido", bg: "#E5E7EB", fg: "#374151" },
  en_progreso: { label: "En Progreso", bg: "#FEF3C7", fg: "#92400E" },
  listo: { label: "Listo", bg: theme.color.brandTertiary, fg: theme.color.brandPrimary },
  entregado: { label: "Entregado", bg: "#DCFCE7", fg: theme.color.success },
};

const STATUS_FLOW: RepairStatus[] = ["recibido", "en_progreso", "listo", "entregado"];

export default function ReparacionesScreen() {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"activas" | "entregadas">("activas");

  const sheetRef = useRef<BottomSheet>(null);
  const editSheetRef = useRef<BottomSheet>(null);
  const [editing, setEditing] = useState<Repair | null>(null);
  const [form, setForm] = useState({
    client_name: "",
    client_phone: "",
    device: "",
    fault: "",
    cost: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.listRepairs();
      setRepairs(list);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return repairs.filter((r) =>
      tab === "activas" ? r.status !== "entregado" : r.status === "entregado"
    );
  }, [repairs, tab]);

  const openNew = () => {
    setForm({ client_name: "", client_phone: "", device: "", fault: "", cost: "", notes: "" });
    sheetRef.current?.expand();
  };

  const submitNew = async () => {
    if (!form.client_name.trim() || !form.device.trim() || !form.fault.trim()) return;
    setSaving(true);
    try {
      await api.createRepair({
        client_name: form.client_name.trim(),
        client_phone: form.client_phone.trim(),
        device: form.device.trim(),
        fault: form.fault.trim(),
        cost: parseFloat(form.cost || "0") || 0,
        notes: form.notes.trim(),
        status: "recibido",
      });
      sheetRef.current?.close();
      load();
    } catch (e) {
      console.warn(e);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (r: Repair) => {
    setEditing(r);
    editSheetRef.current?.expand();
  };

  const updateStatus = async (status: RepairStatus) => {
    if (!editing) return;
    try {
      const updated = await api.updateRepair(editing.id, { status });
      setEditing(updated);
      load();
    } catch (e) {
      console.warn(e);
    }
  };

  const removeRepair = async (id: string) => {
    try {
      await api.deleteRepair(id);
      editSheetRef.current?.close();
      load();
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Reparaciones</Text>
          <Pressable onPress={openNew} style={styles.addBtn} testID="btn-add-repair">
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.segmented}>
          {(["activas", "entregadas"] as const).map((t) => {
            const active = t === tab;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                testID={`segment-${t}`}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {t === "activas" ? "Activas" : "Entregadas"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.color.brandPrimary} style={{ marginTop: 24 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty} testID="empty-repairs">
          <Ionicons name="construct-outline" size={48} color={theme.color.muted} />
          <Text style={styles.emptyText}>
            {tab === "activas" ? "No hay reparaciones activas" : "Sin entregas registradas"}
          </Text>
          <Text style={styles.emptySubtext}>Toca + para registrar una reparación</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 32 }}
          renderItem={({ item }) => {
            const meta = STATUS_META[item.status];
            return (
              <Pressable onPress={() => openEdit(item)} style={styles.card} testID={`repair-card-${item.id}`}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.client_name}</Text>
                  <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.badgeText, { color: meta.fg }]}>{meta.label}</Text>
                  </View>
                </View>
                <Text style={styles.cardDevice}>{item.device}</Text>
                <Text style={styles.cardFault} numberOfLines={2}>{item.fault}</Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardMeta}>{formatDate(item.created_at)}</Text>
                  <Text style={styles.cardCost}>{formatCurrency(item.cost)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* New Repair Sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        enablePanDownToClose
        snapPoints={["88%"]}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
        backgroundStyle={{ backgroundColor: theme.color.surfaceSecondary }}
      >
        <BottomSheetView style={styles.sheetContent}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              <Text style={styles.sheetTitle}>Nueva Reparación</Text>

              <Text style={styles.label}>Cliente</Text>
              <TextInput style={styles.input} value={form.client_name} onChangeText={(v) => setForm((f) => ({ ...f, client_name: v }))} placeholder="Nombre completo" placeholderTextColor={theme.color.muted} testID="input-client-name" />

              <Text style={styles.label}>Teléfono del cliente</Text>
              <TextInput style={styles.input} value={form.client_phone} onChangeText={(v) => setForm((f) => ({ ...f, client_phone: v }))} placeholder="809-000-0000" keyboardType="phone-pad" placeholderTextColor={theme.color.muted} testID="input-client-phone" />

              <Text style={styles.label}>Equipo</Text>
              <TextInput style={styles.input} value={form.device} onChangeText={(v) => setForm((f) => ({ ...f, device: v }))} placeholder="iPhone 12 Pro" placeholderTextColor={theme.color.muted} testID="input-device" />

              <Text style={styles.label}>Falla / Problema</Text>
              <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]} value={form.fault} onChangeText={(v) => setForm((f) => ({ ...f, fault: v }))} placeholder="Pantalla rota" multiline placeholderTextColor={theme.color.muted} testID="input-fault" />

              <Text style={styles.label}>Costo (RD$)</Text>
              <TextInput style={styles.input} value={form.cost} onChangeText={(v) => setForm((f) => ({ ...f, cost: v }))} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={theme.color.muted} testID="input-cost" />

              <Text style={styles.label}>Notas técnicas (opcional)</Text>
              <TextInput style={[styles.input, { height: 60, textAlignVertical: "top" }]} value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} multiline placeholderTextColor={theme.color.muted} testID="input-notes" />

              <Pressable onPress={submitNew} disabled={saving} style={[styles.submitBtn, saving && { opacity: 0.6 }]} testID="btn-submit-repair">
                <Text style={styles.submitBtnText}>{saving ? "Guardando..." : "Registrar Reparación"}</Text>
              </Pressable>
            </BottomSheetScrollView>
          </KeyboardAvoidingView>
        </BottomSheetView>
      </BottomSheet>

      {/* Edit Status Sheet */}
      <BottomSheet
        ref={editSheetRef}
        index={-1}
        enablePanDownToClose
        snapPoints={["60%"]}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
        backgroundStyle={{ backgroundColor: theme.color.surfaceSecondary }}
      >
        <BottomSheetView style={styles.sheetContent}>
          {editing && (
            <BottomSheetScrollView>
              <Text style={styles.sheetTitle}>{editing.client_name}</Text>
              <Text style={styles.cardDevice}>{editing.device}</Text>
              <Text style={[styles.cardFault, { marginBottom: 8 }]}>{editing.fault}</Text>
              <Text style={[styles.cardCost, { marginBottom: theme.spacing.lg }]}>{formatCurrency(editing.cost)}</Text>

              <Text style={styles.label}>Actualizar Estado</Text>
              <View style={{ gap: 8 }}>
                {STATUS_FLOW.map((s) => {
                  const active = s === editing.status;
                  const meta = STATUS_META[s];
                  return (
                    <Pressable
                      key={s}
                      onPress={() => updateStatus(s)}
                      style={[
                        styles.statusOption,
                        active && { borderColor: theme.color.brandPrimary, backgroundColor: theme.color.brandTertiary },
                      ]}
                      testID={`status-option-${s}`}
                    >
                      <View style={[styles.statusDot, { backgroundColor: meta.fg }]} />
                      <Text style={[styles.statusOptionText, active && { color: theme.color.brandPrimary, fontWeight: "700" }]}>
                        {meta.label}
                      </Text>
                      {active && <Ionicons name="checkmark" size={20} color={theme.color.brandPrimary} />}
                    </Pressable>
                  );
                })}
              </View>

              <Pressable onPress={() => removeRepair(editing.id)} style={styles.deleteBtn} testID="btn-delete-repair">
                <Ionicons name="trash-outline" size={18} color={theme.color.error} />
                <Text style={styles.deleteBtnText}>Eliminar reparación</Text>
              </Pressable>
            </BottomSheetScrollView>
          )}
        </BottomSheetView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 28, fontWeight: "700", color: theme.color.onSurface },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.color.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: theme.color.surfaceTertiary,
    borderRadius: theme.radius.md,
    padding: 4,
    marginTop: theme.spacing.md,
  },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  segmentBtnActive: { backgroundColor: theme.color.surfaceSecondary, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { fontSize: 14, fontWeight: "600", color: theme.color.muted },
  segmentTextActive: { color: theme.color.onSurface },
  empty: { alignItems: "center", paddingVertical: 64 },
  emptyText: { fontSize: 15, color: theme.color.onSurface, fontWeight: "600", marginTop: 10 },
  emptySubtext: { fontSize: 13, color: theme.color.muted, marginTop: 4 },
  card: {
    backgroundColor: theme.color.surfaceSecondary,
    padding: theme.spacing.md, borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1, borderColor: theme.color.border,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: theme.color.onSurface, flex: 1 },
  cardDevice: { fontSize: 14, color: theme.color.onSurfaceTertiary, marginTop: 4, fontWeight: "600" },
  cardFault: { fontSize: 13, color: theme.color.muted, marginTop: 4 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  cardMeta: { fontSize: 12, color: theme.color.muted },
  cardCost: { fontSize: 15, fontWeight: "800", color: theme.color.brandPrimary },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill, marginLeft: 8 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  sheetContent: { flex: 1, paddingHorizontal: theme.spacing.lg },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: theme.color.onSurface, marginBottom: theme.spacing.sm },
  label: { fontSize: 13, fontWeight: "600", color: theme.color.onSurfaceTertiary, marginTop: theme.spacing.md, marginBottom: 6 },
  input: {
    backgroundColor: theme.color.surfaceTertiary,
    borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: theme.color.onSurface,
    borderWidth: 1, borderColor: theme.color.border,
  },
  submitBtn: { backgroundColor: theme.color.brandPrimary, paddingVertical: 16, borderRadius: theme.radius.md, alignItems: "center", marginTop: theme.spacing.xl },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  statusOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    backgroundColor: theme.color.surfaceTertiary,
    borderRadius: theme.radius.md,
    borderWidth: 2, borderColor: "transparent",
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusOptionText: { flex: 1, fontSize: 15, fontWeight: "600", color: theme.color.onSurface },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: theme.spacing.xl, paddingVertical: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.error,
  },
  deleteBtnText: { color: theme.color.error, fontWeight: "700" },
});
