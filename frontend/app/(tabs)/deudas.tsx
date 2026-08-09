import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { AppTheme } from "@/src/lib/theme";
import { useTheme } from "@/src/lib/theme-context";
import { api, Debt, DebtSource, daysUntil, formatCurrency, formatDate, formatDateOnly } from "@/src/lib/api";

const SOURCES: { key: DebtSource; label: string }[] = [
  { key: "venta", label: "Venta" },
  { key: "reparacion", label: "Reparación" },
  { key: "otro", label: "Otro" },
];

export default function DeudasScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  const [debts, setDebts] = useState<Debt[]>([]);
  const [summary, setSummary] = useState({ total_pending: 0, total_paid: 0, count_pending: 0, count_paid: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pendientes" | "pagadas">("pendientes");

  const addSheetRef = useRef<BottomSheet>(null);
  const detailSheetRef = useRef<BottomSheet>(null);
  const paySheetRef = useRef<BottomSheet>(null);
  const [detail, setDetail] = useState<Debt | null>(null);

  const [form, setForm] = useState({
    client_name: "",
    client_phone: "",
    concept: "",
    source: "venta" as DebtSource,
    original_amount: "",
    due_date: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("efectivo");
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([api.listDebts(), api.debtsSummary()]);
      setDebts(list);
      setSummary(s);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return debts.filter((d) => (tab === "pendientes" ? d.status !== "pagado" : d.status === "pagado"));
  }, [debts, tab]);

  const openAdd = () => {
    setForm({ client_name: "", client_phone: "", concept: "", source: "venta", original_amount: "", due_date: "", notes: "" });
    setFormError(null);
    addSheetRef.current?.expand();
  };

  const submit = async () => {
    setFormError(null);
    const clientName = form.client_name.trim();
    const concept = form.concept.trim();
    const amt = parseFloat((form.original_amount || "").replace(",", "."));
    if (!clientName) { setFormError("El nombre del cliente es requerido"); return; }
    if (!concept) { setFormError("El concepto es requerido"); return; }
    if (!amt || amt <= 0) { setFormError("Ingresa un monto válido mayor a 0"); return; }

    let dueIso: string | null = null;
    const rawDue = form.due_date.trim();
    if (rawDue) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDue);
      if (!match) { setFormError("Fecha inválida. Usa el formato YYYY-MM-DD"); return; }
      const d = new Date(`${rawDue}T23:59:59.000Z`);
      if (isNaN(d.getTime())) { setFormError("Fecha inválida. Usa el formato YYYY-MM-DD"); return; }
      dueIso = d.toISOString();
    }

    setSaving(true);
    try {
      await api.createDebt({
        client_name: clientName,
        client_phone: form.client_phone.trim(),
        concept,
        source: form.source,
        original_amount: amt,
        due_date: dueIso,
        notes: form.notes.trim(),
      });
      addSheetRef.current?.close();
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo guardar la deuda";
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (d: Debt) => {
    setDetail(d);
    detailSheetRef.current?.expand();
  };

  const openPay = () => {
    if (!detail) return;
    setPayAmount(String(detail.balance));
    setPayMethod("efectivo");
    paySheetRef.current?.expand();
  };

  const confirmPay = async () => {
    if (!detail) return;
    const amt = parseFloat(payAmount.replace(",", "."));
    if (!amt || amt <= 0) return;
    setPaying(true);
    try {
      const updated = await api.payDebt(detail.id, amt, payMethod);
      setDetail(updated);
      paySheetRef.current?.close();
      load();
    } catch (e) { console.warn(e); }
    finally { setPaying(false); }
  };

  const removeDebt = async () => {
    if (!detail) return;
    try {
      await api.deleteDebt(detail.id);
      detailSheetRef.current?.close();
      setDetail(null);
      load();
    } catch (e) { console.warn(e); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand} testID="brand-name">The Family Solutions</Text>
            <Text style={styles.title}>Deudas</Text>
          </View>
          <Pressable onPress={openAdd} style={styles.addBtn} testID="btn-add-debt">
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.summaryCard} testID="debts-summary">
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Por cobrar</Text>
            <Text style={[styles.summaryValue, { color: theme.color.error }]}>{formatCurrency(summary.total_pending)}</Text>
            <Text style={styles.summaryMeta}>{summary.count_pending} pendiente{summary.count_pending === 1 ? "" : "s"}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Cobrado</Text>
            <Text style={[styles.summaryValue, { color: theme.color.brandPrimary }]}>{formatCurrency(summary.total_paid)}</Text>
            <Text style={styles.summaryMeta}>{summary.count_paid} pagada{summary.count_paid === 1 ? "" : "s"}</Text>
          </View>
        </View>

        <View style={styles.segmented}>
          {(["pendientes", "pagadas"] as const).map((t) => {
            const active = t === tab;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                testID={`segment-${t}`}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {t === "pendientes" ? "Pendientes" : "Pagadas"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.color.brandPrimary} style={{ marginTop: 24 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty} testID="empty-debts">
          <Ionicons name="wallet-outline" size={48} color={theme.color.muted} />
          <Text style={styles.emptyText}>
            {tab === "pendientes" ? "Sin deudas pendientes" : "Sin deudas pagadas"}
          </Text>
          <Text style={styles.emptySubtext}>Toca + para registrar una deuda</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 32 }}
          renderItem={({ item }) => {
            const isPaid = item.status === "pagado";
            const isPartial = item.status === "pagado_parcial";
            const progress = item.original_amount > 0 ? Math.min(100, (item.paid_amount / item.original_amount) * 100) : 0;
            return (
              <Pressable onPress={() => openDetail(item)} style={styles.card} testID={`debt-card-${item.id}`}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.client_name}</Text>
                  <View
                    style={[
                      styles.badge,
                      isPaid ? { backgroundColor: theme.color.brandTertiary } : isPartial ? { backgroundColor: theme.color.warningSoft } : { backgroundColor: theme.color.errorSoft },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: isPaid ? theme.color.brandPrimary : isPartial ? theme.color.warningSoftText : theme.color.error },
                      ]}
                    >
                      {isPaid ? "Pagado" : isPartial ? "Parcial" : "Pendiente"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardConcept}>{item.concept}</Text>
                <View style={styles.progressWrap}>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: isPaid ? theme.color.brandPrimary : theme.color.warning }]} />
                  </View>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardMeta}>
                    Pagado {formatCurrency(item.paid_amount)} de {formatCurrency(item.original_amount)}
                  </Text>
                  <Text style={[styles.cardBalance, { color: isPaid ? theme.color.brandPrimary : theme.color.error }]}>
                    {isPaid ? "✓ Saldado" : `Debe ${formatCurrency(item.balance)}`}
                  </Text>
                </View>
                {item.due_date && !isPaid && (() => {
                  const d = daysUntil(item.due_date);
                  const overdue = d < 0;
                  return (
                    <View
                      style={[
                        styles.dueChip,
                        overdue
                          ? { backgroundColor: theme.color.errorSoft }
                          : d <= 1
                            ? { backgroundColor: theme.color.warningSoft }
                            : { backgroundColor: theme.color.surfaceTertiary },
                      ]}
                      testID={`debt-due-${item.id}`}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={12}
                        color={overdue ? theme.color.error : d <= 1 ? theme.color.warning : theme.color.muted}
                      />
                      <Text
                        style={[
                          styles.dueChipText,
                          {
                            color: overdue ? theme.color.error : d <= 1 ? theme.color.warningSoftText : theme.color.onSurfaceTertiary,
                          },
                        ]}
                      >
                        {overdue
                          ? `Vencida hace ${Math.abs(d)} día${Math.abs(d) === 1 ? "" : "s"}`
                          : d === 0
                            ? "Vence hoy"
                            : d === 1
                              ? "Vence mañana"
                              : `Vence: ${formatDateOnly(item.due_date)}`}
                      </Text>
                    </View>
                  );
                })()}
              </Pressable>
            );
          }}
        />
      )}

      {/* Add Debt Sheet */}
      <BottomSheet
        ref={addSheetRef}
        index={-1}
        enablePanDownToClose
        snapPoints={["85%"]}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
        backgroundStyle={{ backgroundColor: theme.color.surfaceSecondary }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: 60 }}>
          <Text style={styles.sheetTitle}>Nueva Deuda</Text>

          <Text style={styles.label}>Cliente</Text>
          <TextInput style={styles.input} value={form.client_name} onChangeText={(v) => setForm((f) => ({ ...f, client_name: v }))} placeholder="Nombre" placeholderTextColor={theme.color.muted} testID="input-debt-client" />

          <Text style={styles.label}>Teléfono (opcional)</Text>
          <TextInput style={styles.input} value={form.client_phone} onChangeText={(v) => setForm((f) => ({ ...f, client_phone: v }))} placeholder="809-000-0000" keyboardType="phone-pad" placeholderTextColor={theme.color.muted} testID="input-debt-phone" />

          <Text style={styles.label}>Concepto</Text>
          <TextInput style={styles.input} value={form.concept} onChangeText={(v) => setForm((f) => ({ ...f, concept: v }))} placeholder="Ej: Venta iPhone 13, Cambio pantalla" placeholderTextColor={theme.color.muted} testID="input-debt-concept" />

          <Text style={styles.label}>Origen</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {SOURCES.map((s) => {
              const active = s.key === form.source;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setForm((f) => ({ ...f, source: s.key }))}
                  style={[styles.chip, active && styles.chipActive]}
                  testID={`chip-src-${s.key}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Monto adeudado (RD$)</Text>
          <TextInput style={styles.input} value={form.original_amount} onChangeText={(v) => setForm((f) => ({ ...f, original_amount: v }))} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={theme.color.muted} testID="input-debt-amount" />

          <Text style={styles.label}>Fecha límite de pago (opcional)</Text>
          <TextInput
            style={styles.input}
            value={form.due_date}
            onChangeText={(v) => setForm((f) => ({ ...f, due_date: v }))}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.color.muted}
            autoCapitalize="none"
            testID="input-debt-due-date"
          />

          <Text style={styles.label}>Notas (opcional)</Text>
          <TextInput style={[styles.input, { height: 70, textAlignVertical: "top" }]} value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} multiline placeholderTextColor={theme.color.muted} testID="input-debt-notes" />

          {formError && (
            <View style={styles.errorBox} testID="debt-form-error">
              <Ionicons name="alert-circle" size={16} color={theme.color.error} />
              <Text style={styles.errorText}>{formError}</Text>
            </View>
          )}

          <Pressable onPress={submit} disabled={saving} style={[styles.submitBtn, saving && { opacity: 0.6 }]} testID="btn-submit-debt">
            <Text style={styles.submitBtnText}>{saving ? "Guardando..." : "Registrar Deuda"}</Text>
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Detail Sheet */}
      <BottomSheet
        ref={detailSheetRef}
        index={-1}
        enablePanDownToClose
        snapPoints={["85%"]}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
        backgroundStyle={{ backgroundColor: theme.color.surfaceSecondary }}
      >
        {detail && (
          <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: 60 }}>
            <Text style={styles.sheetTitle}>{detail.client_name}</Text>
            <Text style={styles.cardConcept}>{detail.concept}</Text>

            <View style={styles.balanceBig}>
              <Text style={styles.balanceBigLabel}>Saldo pendiente</Text>
              <Text style={[styles.balanceBigValue, { color: detail.status === "pagado" ? theme.color.brandPrimary : theme.color.error }]}>
                {formatCurrency(detail.balance)}
              </Text>
              <Text style={styles.balanceBigSub}>
                Pagado {formatCurrency(detail.paid_amount)} de {formatCurrency(detail.original_amount)}
              </Text>
            </View>

            {detail.client_phone ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Teléfono</Text>
                <Text style={styles.detailValue}>{detail.client_phone}</Text>
              </View>
            ) : null}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Origen</Text>
              <Text style={styles.detailValue}>{cap(detail.source)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Registrada</Text>
              <Text style={styles.detailValue}>{formatDate(detail.created_at)}</Text>
            </View>
            {detail.due_date ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Vence</Text>
                <Text
                  style={[
                    styles.detailValue,
                    daysUntil(detail.due_date) < 0 && detail.status !== "pagado"
                      ? { color: theme.color.error }
                      : null,
                  ]}
                >
                  {formatDateOnly(detail.due_date)}
                </Text>
              </View>
            ) : null}
            {detail.notes ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Notas</Text>
                <Text style={[styles.detailValue, { flex: 1, textAlign: "right" }]} numberOfLines={4}>{detail.notes}</Text>
              </View>
            ) : null}

            <Text style={[styles.label, { marginTop: theme.spacing.lg }]}>Historial de pagos</Text>
            {detail.payments.length === 0 ? (
              <Text style={styles.emptyPay}>Sin pagos registrados</Text>
            ) : (
              detail.payments.map((p, idx) => (
                <View key={idx} style={styles.payRow}>
                  <View style={styles.payIcon}>
                    <Ionicons name="checkmark" size={14} color={theme.color.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payAmount}>{formatCurrency(p.amount)}</Text>
                    <Text style={styles.payMeta}>{cap(p.method)} · {formatDate(p.date)}</Text>
                  </View>
                </View>
              ))
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: theme.spacing.xl }}>
              {detail.status !== "pagado" && (
                <Pressable onPress={openPay} style={[styles.detailAction, styles.detailActionPrimary]} testID="btn-register-payment">
                  <Ionicons name="cash-outline" size={18} color="#fff" />
                  <Text style={styles.detailActionTextPrimary}>Registrar pago</Text>
                </Pressable>
              )}
              <Pressable onPress={removeDebt} style={[styles.detailAction, styles.detailActionDanger]} testID="btn-delete-debt">
                <Ionicons name="trash-outline" size={18} color={theme.color.error} />
                <Text style={styles.detailActionTextDanger}>Eliminar</Text>
              </Pressable>
            </View>
          </BottomSheetScrollView>
        )}
      </BottomSheet>

      {/* Pay Sheet */}
      <BottomSheet
        ref={paySheetRef}
        index={-1}
        enablePanDownToClose
        snapPoints={["55%"]}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
        backgroundStyle={{ backgroundColor: theme.color.surfaceSecondary }}
      >
        {detail && (
          <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: 60 }}>
            <Text style={styles.sheetTitle}>Registrar pago</Text>
            <Text style={styles.cardConcept}>{detail.client_name} · Debe {formatCurrency(detail.balance)}</Text>

            <Text style={styles.label}>Monto a pagar (RD$)</Text>
            <TextInput style={styles.input} value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" placeholderTextColor={theme.color.muted} testID="input-pay-amount" />

            <Text style={styles.label}>Método</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {["efectivo", "transferencia", "tarjeta"].map((m) => {
                const active = m === payMethod;
                return (
                  <Pressable key={m} onPress={() => setPayMethod(m)} style={[styles.chip, active && styles.chipActive]} testID={`chip-method-${m}`}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{cap(m)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.payInfoBox}>
              <Ionicons name="information-circle" size={18} color={theme.color.brandPrimary} />
              <Text style={styles.payInfoText}>
                El pago se sumará automáticamente a la caja como ingreso.
              </Text>
            </View>

            <Pressable onPress={confirmPay} disabled={paying} style={[styles.submitBtn, paying && { opacity: 0.6 }]} testID="btn-confirm-payment">
              <Text style={styles.submitBtnText}>{paying ? "Procesando..." : "Confirmar pago"}</Text>
            </Pressable>
          </BottomSheetScrollView>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ");
}

const buildStyles = (theme: AppTheme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 28, fontWeight: "700", color: theme.color.onSurface },
  brand: { fontSize: 12, fontWeight: "800", color: theme.color.brandPrimary, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.color.brandPrimary, alignItems: "center", justifyContent: "center" },
  summaryCard: {
    flexDirection: "row",
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.border,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  summaryCol: { flex: 1, alignItems: "center" },
  summaryDivider: { width: 1, backgroundColor: theme.color.divider, marginHorizontal: theme.spacing.md },
  summaryLabel: { fontSize: 12, color: theme.color.muted, fontWeight: "600" },
  summaryValue: { fontSize: 20, fontWeight: "800", marginTop: 4 },
  summaryMeta: { fontSize: 11, color: theme.color.muted, marginTop: 2 },
  segmented: {
    flexDirection: "row",
    backgroundColor: theme.color.surfaceTertiary,
    borderRadius: theme.radius.md,
    padding: 4,
    marginTop: theme.spacing.md,
  },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  segmentBtnActive: { backgroundColor: theme.color.surfaceSecondary },
  segmentText: { fontSize: 14, fontWeight: "600", color: theme.color.muted },
  segmentTextActive: { color: theme.color.onSurface },
  empty: { alignItems: "center", paddingVertical: 64 },
  emptyText: { fontSize: 15, color: theme.color.onSurface, fontWeight: "600", marginTop: 10 },
  emptySubtext: { fontSize: 13, color: theme.color.muted, marginTop: 4 },
  card: {
    backgroundColor: theme.color.surfaceSecondary,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1, borderColor: theme.color.border,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: theme.color.onSurface, flex: 1 },
  cardConcept: { fontSize: 13, color: theme.color.muted, marginTop: 4 },
  progressWrap: { marginTop: 10 },
  progressBg: { height: 6, borderRadius: 3, backgroundColor: theme.color.surfaceTertiary, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  cardMeta: { fontSize: 12, color: theme.color.muted },
  cardBalance: { fontSize: 14, fontWeight: "800" },
  dueChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: theme.radius.pill,
    marginTop: 6,
  },
  dueChipText: { fontSize: 11, fontWeight: "700" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill, marginLeft: 8 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: theme.color.onSurface, marginTop: 4, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: "600", color: theme.color.onSurfaceTertiary, marginTop: theme.spacing.md, marginBottom: 6 },
  input: {
    backgroundColor: theme.color.surfaceTertiary,
    borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: theme.color.onSurface,
    borderWidth: 1, borderColor: theme.color.border,
  },
  chip: {
    paddingHorizontal: 14, height: 36, borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceSecondary,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  chipActive: { backgroundColor: theme.color.brandPrimary, borderColor: theme.color.brandPrimary },
  chipText: { fontSize: 13, fontWeight: "600", color: theme.color.onSurface },
  chipTextActive: { color: "#fff" },
  submitBtn: {
    backgroundColor: theme.color.brandPrimary,
    paddingVertical: 16, borderRadius: theme.radius.md,
    alignItems: "center", marginTop: theme.spacing.xl,
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.errorSoft,
    borderWidth: 1, borderColor: theme.color.error,
    marginTop: theme.spacing.md,
  },
  errorText: { flex: 1, fontSize: 13, color: theme.color.error, fontWeight: "600" },
  balanceBig: {
    alignItems: "center",
    paddingVertical: theme.spacing.lg,
    backgroundColor: theme.color.surfaceTertiary,
    borderRadius: theme.radius.md,
    marginTop: theme.spacing.md,
  },
  balanceBigLabel: { fontSize: 12, color: theme.color.muted, fontWeight: "600" },
  balanceBigValue: { fontSize: 32, fontWeight: "800", marginTop: 4 },
  balanceBigSub: { fontSize: 12, color: theme.color.muted, marginTop: 4 },
  detailRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingVertical: 10, gap: 12,
    borderTopWidth: 1, borderTopColor: theme.color.divider,
  },
  detailLabel: { fontSize: 13, color: theme.color.muted, fontWeight: "500" },
  detailValue: { fontSize: 14, fontWeight: "600", color: theme.color.onSurface },
  emptyPay: { fontSize: 13, color: theme.color.muted, textAlign: "center", paddingVertical: 12, fontStyle: "italic" },
  payRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: theme.color.divider,
  },
  payIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: theme.color.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  payAmount: { fontSize: 14, fontWeight: "700", color: theme.color.brandPrimary },
  payMeta: { fontSize: 11, color: theme.color.muted, marginTop: 2 },
  detailAction: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 14, borderRadius: theme.radius.md,
  },
  detailActionPrimary: { backgroundColor: theme.color.brandPrimary },
  detailActionDanger: { backgroundColor: "transparent", borderWidth: 1, borderColor: theme.color.error },
  detailActionTextPrimary: { color: "#fff", fontWeight: "700" },
  detailActionTextDanger: { color: theme.color.error, fontWeight: "700" },
  payInfoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: theme.color.brandTertiary,
    padding: theme.spacing.md, borderRadius: theme.radius.md,
    marginTop: theme.spacing.lg,
  },
  payInfoText: { flex: 1, fontSize: 12, color: theme.color.onBrandTertiary, lineHeight: 17 },
});
