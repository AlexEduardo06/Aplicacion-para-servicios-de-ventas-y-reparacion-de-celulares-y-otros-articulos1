import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  Image as RNImage,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import * as ImagePicker from "expo-image-picker";
import { AppTheme } from "@/src/lib/theme";
import { useTheme } from "@/src/lib/theme-context";
import { api, daysSince, daysUntil, formatCurrency, formatDate, formatDateOnly, Repair, RepairPhoto, RepairStatus } from "@/src/lib/api";
import { shareRepairReceipt } from "@/src/lib/receipt";
import { storage } from "@/src/utils/storage";

const REMINDER_KEY = "settings.repair_ready_alert_days";

function getStatusMeta(theme: AppTheme): Record<RepairStatus, { label: string; bg: string; fg: string }> {
  return {
    recibido: { label: "Recibido", bg: theme.color.surfaceTertiary, fg: theme.color.onSurfaceTertiary },
    en_progreso: { label: "En Progreso", bg: theme.color.warningSoft, fg: theme.color.warningSoftText },
    listo: { label: "Listo", bg: theme.color.brandTertiary, fg: theme.color.brandPrimary },
    entregado: { label: "Entregado", bg: theme.color.brandSecondary, fg: theme.color.success },
  };
}

const STATUS_FLOW: RepairStatus[] = ["recibido", "en_progreso", "listo", "entregado"];

export default function ReparacionesScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);
  const STATUS_META = useMemo(() => getStatusMeta(theme), [theme]);

  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"activas" | "atrasadas" | "entregadas">("activas");
  const [threshold, setThreshold] = useState(3);

  const sheetRef = useRef<BottomSheet>(null);
  const editSheetRef = useRef<BottomSheet>(null);
  const deliverSheetRef = useRef<BottomSheet>(null);
  const [editing, setEditing] = useState<Repair | null>(null);
  const [photos, setPhotos] = useState<RepairPhoto[]>([]);
  const [form, setForm] = useState({
    client_name: "",
    client_phone: "",
    device: "",
    fault: "",
    cost: "",
    notes: "",
    due_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [deliverPaid, setDeliverPaid] = useState("");
  const [deliverMethod, setDeliverMethod] = useState("efectivo");
  const [delivering, setDelivering] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, t] = await Promise.all([
        api.listRepairs(),
        storage.getItem<number>(REMINDER_KEY, 3),
      ]);
      setRepairs(list);
      if (t && t > 0) setThreshold(t);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return repairs.filter((r) => {
      if (tab === "entregadas") return r.status === "entregado";
      if (tab === "atrasadas") {
        return r.status === "listo" && !!r.listo_at && daysSince(r.listo_at) >= threshold;
      }
      return r.status !== "entregado";
    });
  }, [repairs, tab, threshold]);

  const overdueIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of repairs) {
      if (r.status === "listo" && r.listo_at && daysSince(r.listo_at) >= threshold) {
        set.add(r.id);
      }
    }
    return set;
  }, [repairs, threshold]);

  const overdueCount = overdueIds.size;

  const openNew = () => {
    setForm({ client_name: "", client_phone: "", device: "", fault: "", cost: "", notes: "", due_date: "" });
    sheetRef.current?.expand();
  };

  const submitNew = async () => {
    if (!form.client_name.trim() || !form.device.trim() || !form.fault.trim()) return;
    let dueIso: string | null = null;
    const rawDue = form.due_date.trim();
    if (rawDue) {
      if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(rawDue)) return;
      const d = new Date(`${rawDue}T23:59:59.000Z`);
      if (isNaN(d.getTime())) return;
      dueIso = d.toISOString();
    }
    setSaving(true);
    try {
      await api.createRepair({
        client_name: form.client_name.trim(),
        client_phone: form.client_phone.trim(),
        device: form.device.trim(),
        fault: form.fault.trim(),
        cost: parseFloat(form.cost || "0") || 0,
        notes: form.notes.trim(),
        due_date: dueIso,
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
    setPhotos(r.photos || []);
    editSheetRef.current?.expand();
  };

  const updateStatus = async (status: RepairStatus) => {
    if (!editing) return;
    if (status === "entregado") {
      // Intercept to collect payment & optional debt
      setDeliverPaid(String(editing.cost || 0));
      setDeliverMethod("efectivo");
      deliverSheetRef.current?.expand();
      return;
    }
    try {
      const updated = await api.updateRepair(editing.id, { status });
      setEditing(updated);
      load();
    } catch (e) {
      console.warn(e);
    }
  };

  const confirmDeliver = async () => {
    if (!editing) return;
    const paid = parseFloat(deliverPaid || "0");
    if (paid < 0) return;
    setDelivering(true);
    try {
      const res = await api.deliverRepair(editing.id, paid, deliverMethod);
      setEditing(res.repair);
      deliverSheetRef.current?.close();
      load();
    } catch (e) {
      console.warn(e);
    } finally {
      setDelivering(false);
    }
  };

  const addPhoto = async (type: "antes" | "despues") => {
    if (!editing) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.4,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets[0]?.base64) return;
    const newPhoto: RepairPhoto = {
      type,
      data: `data:image/jpeg;base64,${res.assets[0].base64}`,
    };
    const updatedPhotos = [...photos, newPhoto];
    setPhotos(updatedPhotos);
    try {
      const updated = await api.updateRepair(editing.id, { photos: updatedPhotos });
      setEditing(updated);
      load();
    } catch (e) {
      console.warn(e);
    }
  };

  const removePhoto = async (idx: number) => {
    if (!editing) return;
    const updatedPhotos = photos.filter((_, i) => i !== idx);
    setPhotos(updatedPhotos);
    try {
      const updated = await api.updateRepair(editing.id, { photos: updatedPhotos });
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
          <View>
            <Text style={styles.brand} testID="brand-name">The Family Solutions</Text>
            <Text style={styles.title}>Reparaciones</Text>
          </View>
          <Pressable onPress={openNew} style={styles.addBtn} testID="btn-add-repair">
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.segmented}>
          {(["activas", "atrasadas", "entregadas"] as const).map((t) => {
            const active = t === tab;
            const count = t === "atrasadas" ? overdueCount : null;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                testID={`segment-${t}`}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {t === "activas" ? "Activas" : t === "atrasadas" ? "Atrasadas" : "Entregadas"}
                  {count !== null && count > 0 ? ` (${count})` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {overdueCount > 0 && tab === "activas" && (
          <View style={styles.reminderBanner} testID="reminder-banner">
            <Ionicons name="alert-circle" size={20} color={theme.color.warning} />
            <Text style={styles.reminderText}>
              <Text style={{ fontWeight: "800" }}>{overdueCount}</Text> reparación{overdueCount > 1 ? "es" : ""} lista{overdueCount > 1 ? "s" : ""} sin retirar (más de {threshold} día{threshold > 1 ? "s" : ""})
            </Text>
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.color.brandPrimary} style={{ marginTop: 24 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty} testID="empty-repairs">
          <Ionicons name="construct-outline" size={48} color={theme.color.muted} />
          <Text style={styles.emptyText}>
            {tab === "activas" ? "No hay reparaciones activas" : tab === "atrasadas" ? "Sin reparaciones atrasadas" : "Sin entregas registradas"}
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
            const isOverdue = overdueIds.has(item.id);
            const overdueDays = isOverdue && item.listo_at ? daysSince(item.listo_at) : 0;
            return (
              <Pressable
                onPress={() => openEdit(item)}
                style={[styles.card, isOverdue && styles.cardOverdue]}
                testID={`repair-card-${item.id}`}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.client_name}</Text>
                  <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.badgeText, { color: meta.fg }]}>{meta.label}</Text>
                  </View>
                </View>
                <Text style={styles.cardDevice}>{item.device}</Text>
                <Text style={styles.cardFault} numberOfLines={2}>{item.fault}</Text>
                {isOverdue && (
                  <View style={styles.overdueChip} testID={`overdue-${item.id}`}>
                    <Ionicons name="time-outline" size={14} color={theme.color.warning} />
                    <Text style={styles.overdueChipText}>
                      Lista hace {overdueDays} día{overdueDays > 1 ? "s" : ""} sin retirar
                    </Text>
                  </View>
                )}
                {item.due_date && item.status !== "entregado" && (() => {
                  const d = daysUntil(item.due_date);
                  const overdueDate = d < 0;
                  const soon = d >= 0 && d <= 1;
                  return (
                    <View
                      style={[
                        styles.dueChip,
                        overdueDate
                          ? { backgroundColor: theme.color.errorSoft }
                          : soon
                            ? { backgroundColor: theme.color.warningSoft }
                            : { backgroundColor: theme.color.surfaceTertiary },
                      ]}
                      testID={`due-${item.id}`}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={12}
                        color={overdueDate ? theme.color.error : soon ? theme.color.warning : theme.color.muted}
                      />
                      <Text
                        style={[
                          styles.dueChipText,
                          {
                            color: overdueDate ? theme.color.error : soon ? theme.color.warningSoftText : theme.color.onSurfaceTertiary,
                          },
                        ]}
                      >
                        {overdueDate
                          ? `Vencida hace ${Math.abs(d)} día${Math.abs(d) === 1 ? "" : "s"}`
                          : d === 0
                            ? "Vence hoy"
                            : d === 1
                              ? "Vence mañana"
                              : `Entrega: ${formatDateOnly(item.due_date)}`}
                      </Text>
                    </View>
                  );
                })()}
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
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
        backgroundStyle={{ backgroundColor: theme.color.surfaceSecondary }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: 60 }}
        >
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

              <Text style={styles.label}>Fecha de entrega prometida (opcional)</Text>
              <TextInput
                style={styles.input}
                value={form.due_date}
                onChangeText={(v) => setForm((f) => ({ ...f, due_date: v }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.color.muted}
                autoCapitalize="none"
                testID="input-repair-due-date"
              />

              <Text style={styles.label}>Notas técnicas (opcional)</Text>
              <TextInput style={[styles.input, { height: 60, textAlignVertical: "top" }]} value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} multiline placeholderTextColor={theme.color.muted} testID="input-notes" />

              <Pressable onPress={submitNew} disabled={saving} style={[styles.submitBtn, saving && { opacity: 0.6 }]} testID="btn-submit-repair">
                <Text style={styles.submitBtnText}>{saving ? "Guardando..." : "Registrar Reparación"}</Text>
              </Pressable>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Edit Status Sheet */}
      <BottomSheet
        ref={editSheetRef}
        index={-1}
        enablePanDownToClose
        snapPoints={["90%"]}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
        backgroundStyle={{ backgroundColor: theme.color.surfaceSecondary }}
      >
        {editing && (
          <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: 60 }}>
              <Text style={styles.sheetTitle}>{editing.client_name}</Text>
              <Text style={styles.cardDevice}>{editing.device}</Text>
              <Text style={[styles.cardFault, { marginBottom: 8 }]}>{editing.fault}</Text>
              <Text style={[styles.cardCost, { marginBottom: theme.spacing.lg }]}>{formatCurrency(editing.cost)}</Text>

              {(["antes", "despues"] as const).map((type) => {
                const list = photos
                  .map((p, idx) => ({ p, idx }))
                  .filter((x) => x.p.type === type);
                return (
                  <View key={type} style={{ marginBottom: theme.spacing.md }}>
                    <View style={styles.photoSectionHeader}>
                      <Text style={styles.label}>
                        Fotos {type === "antes" ? "antes" : "después"}
                      </Text>
                      <Pressable
                        onPress={() => addPhoto(type)}
                        style={styles.photoAddBtn}
                        testID={`btn-add-photo-${type}`}
                      >
                        <Ionicons name="add" size={16} color={theme.color.brandPrimary} />
                        <Text style={styles.photoAddBtnText}>Agregar</Text>
                      </Pressable>
                    </View>
                    {list.length === 0 ? (
                      <Text style={styles.photoEmpty}>Sin fotos</Text>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {list.map(({ p, idx }) => (
                          <View key={idx} style={styles.photoThumb} testID={`photo-${type}-${idx}`}>
                            <RNImage source={{ uri: p.data }} style={{ width: "100%", height: "100%", borderRadius: 8 }} />
                            <Pressable
                              onPress={() => removePhoto(idx)}
                              style={styles.photoRemove}
                              hitSlop={6}
                              testID={`photo-remove-${type}-${idx}`}
                            >
                              <Ionicons name="close" size={14} color="#fff" />
                            </Pressable>
                          </View>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                );
              })}

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

              <Pressable onPress={() => shareRepairReceipt(editing)} style={styles.shareBtn} testID="btn-share-repair">
                <Ionicons name="share-outline" size={18} color={theme.color.brandPrimary} />
                <Text style={styles.shareBtnText}>Compartir recibo (WhatsApp / PDF)</Text>
              </Pressable>

              <Pressable onPress={() => removeRepair(editing.id)} style={styles.deleteBtn} testID="btn-delete-repair">
                <Ionicons name="trash-outline" size={18} color={theme.color.error} />
                <Text style={styles.deleteBtnText}>Eliminar reparación</Text>
              </Pressable>
          </BottomSheetScrollView>
        )}
      </BottomSheet>

      {/* Deliver Repair Sheet (payment on delivery) */}
      <BottomSheet
        ref={deliverSheetRef}
        index={-1}
        enablePanDownToClose
        snapPoints={["70%"]}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
        backgroundStyle={{ backgroundColor: theme.color.surfaceSecondary }}
      >
        {editing && (
          <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: 60 }}>
            <Text style={styles.sheetTitle}>Entregar y cobrar</Text>
            <Text style={styles.cardDevice}>{editing.client_name} · {editing.device}</Text>
            <Text style={[styles.cardCost, { marginBottom: theme.spacing.lg }]}>Costo: {formatCurrency(editing.cost)}</Text>

            <Text style={styles.label}>Monto cobrado ahora (RD$)</Text>
            <TextInput
              style={styles.input}
              value={deliverPaid}
              onChangeText={setDeliverPaid}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={theme.color.muted}
              testID="input-deliver-paid"
            />

            <Text style={styles.label}>Método</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {["efectivo", "transferencia", "tarjeta"].map((m) => {
                const active = m === deliverMethod;
                return (
                  <Pressable key={m} onPress={() => setDeliverMethod(m)} style={[styles.chip, active && styles.chipActive]} testID={`chip-deliver-method-${m}`}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {(() => {
              const paid = parseFloat(deliverPaid || "0");
              const pending = Math.max(0, (editing.cost || 0) - (paid || 0));
              if (pending <= 0) {
                return (
                  <View style={[styles.deliverInfoBox, { backgroundColor: theme.color.brandTertiary, borderColor: theme.color.brandPrimary }]}>
                    <Ionicons name="checkmark-circle" size={18} color={theme.color.brandPrimary} />
                    <Text style={[styles.deliverInfoText, { color: theme.color.brandPrimary }]}>
                      Pago completo. Se sumará {formatCurrency(paid)} a la caja.
                    </Text>
                  </View>
                );
              }
              return (
                <View style={[styles.deliverInfoBox, { backgroundColor: theme.color.warningSoft, borderColor: theme.color.warningSoftBorder }]}>
                  <Ionicons name="warning" size={18} color={theme.color.warning} />
                  <Text style={[styles.deliverInfoText, { color: theme.color.warningSoftText }]}>
                    Queda debiendo {formatCurrency(pending)}. Se creará automáticamente en el módulo Deudas.
                  </Text>
                </View>
              );
            })()}

            <Pressable
              onPress={confirmDeliver}
              disabled={delivering}
              style={[styles.submitBtn, delivering && { opacity: 0.6 }]}
              testID="btn-confirm-deliver"
            >
              <Text style={styles.submitBtnText}>
                {delivering ? "Procesando..." : "Marcar como entregada"}
              </Text>
            </Pressable>
          </BottomSheetScrollView>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

const buildStyles = (theme: AppTheme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 28, fontWeight: "700", color: theme.color.onSurface },
  brand: { fontSize: 12, fontWeight: "800", color: theme.color.brandPrimary, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 },
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
  reminderBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.color.warningSoft,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: theme.radius.md,
    marginTop: theme.spacing.md,
    borderWidth: 1, borderColor: theme.color.warningSoftBorder,
  },
  reminderText: { flex: 1, fontSize: 13, color: theme.color.warningSoftText, lineHeight: 18 },
  cardOverdue: { borderColor: theme.color.warning, borderWidth: 2 },
  overdueChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    alignSelf: "flex-start",
    backgroundColor: theme.color.warningSoft,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: theme.radius.pill,
    marginTop: 8,
  },
  overdueChipText: { fontSize: 11, fontWeight: "700", color: theme.color.warningSoftText },
  dueChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: theme.radius.pill,
    marginTop: 6,
  },
  dueChipText: { fontSize: 11, fontWeight: "700" },
  photoSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  photoAddBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: theme.color.brandTertiary,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: theme.radius.pill,
  },
  photoAddBtnText: { fontSize: 12, fontWeight: "700", color: theme.color.brandPrimary },
  photoEmpty: { fontSize: 12, color: theme.color.muted, marginTop: 6, fontStyle: "italic" },
  photoThumb: {
    width: 96, height: 96, borderRadius: 8,
    backgroundColor: theme.color.surfaceTertiary,
    overflow: "hidden", flexShrink: 0,
    marginTop: 6,
  },
  photoRemove: {
    position: "absolute", top: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center",
  },
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
    marginTop: theme.spacing.md, paddingVertical: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.error,
  },
  deleteBtnText: { color: theme.color.error, fontWeight: "700" },
  deliverInfoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    marginTop: theme.spacing.lg,
    borderWidth: 1,
  },
  deliverInfoText: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  shareBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: theme.spacing.xl, paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.brandTertiary,
  },
  shareBtnText: { color: theme.color.brandPrimary, fontWeight: "700" },
});
