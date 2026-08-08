import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { AppTheme } from "@/src/lib/theme";
import { useTheme } from "@/src/lib/theme-context";
import { api, DailySummary, formatCurrency, formatDate, Phone, Repair, Transaction, TxType } from "@/src/lib/api";
import { shareTransactionReceipt } from "@/src/lib/receipt";

const CATEGORIES_IN = ["venta", "reparacion", "otro"];
const CATEGORIES_OUT = ["compra", "gasto", "otro"];

export default function CajaScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);
  const router = useRouter();

  const [summary, setSummary] = useState<DailySummary>({
    ingresos: 0,
    egresos: 0,
    balance: 0,
    count: 0,
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [phones, setPhones] = useState<Phone[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const sheetRef = useRef<BottomSheet>(null);
  const detailSheetRef = useRef<BottomSheet>(null);
  const [detail, setDetail] = useState<Transaction | null>(null);
  const [txType, setTxType] = useState<TxType>("ingreso");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("venta");
  const [description, setDescription] = useState("");
  const [linkedPhoneId, setLinkedPhoneId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, t, p, r] = await Promise.all([
        api.summaryToday(),
        api.listTransactions(),
        api.listPhones(),
        api.listRepairs(),
      ]);
      setSummary(s);
      setTransactions(t);
      setPhones(p);
      setRepairs(r);
    } catch (e) {
      console.warn("Load error", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openSheet = (type: TxType) => {
    setTxType(type);
    setCategory(type === "ingreso" ? "venta" : "gasto");
    setAmount("");
    setDescription("");
    setLinkedPhoneId(null);
    sheetRef.current?.expand();
  };

  const submit = async () => {
    const n = parseFloat(amount.replace(",", "."));
    if (!n || n <= 0) return;
    setSaving(true);
    try {
      if (txType === "ingreso" && category === "venta" && linkedPhoneId) {
        // Route through sell endpoint so inventory stock/status updates automatically
        await api.sellPhone(linkedPhoneId, { price: n, paid: n, description });
      } else {
        await api.createTransaction({
          type: txType,
          amount: n,
          category,
          description,
          related_phone_id: linkedPhoneId,
        });
      }
      sheetRef.current?.close();
      load();
    } catch (e) {
      console.warn(e);
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (tx: Transaction) => {
    setDetail(tx);
    detailSheetRef.current?.expand();
  };

  const removeTx = async (id: string) => {
    try {
      await api.deleteTransaction(id);
      load();
    } catch (e) {
      console.warn(e);
    }
  };

  const cats = txType === "ingreso" ? CATEGORIES_IN : CATEGORIES_OUT;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand} testID="brand-name">The Family Solutions</Text>
          <Text style={styles.title} testID="screen-title">Caja del día</Text>
          <Text style={styles.subtitle}>
            {new Date().toLocaleDateString("es-DO", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/search" as never)}
          style={styles.headerSearchBtn}
          hitSlop={8}
          testID="btn-global-search"
        >
          <Ionicons name="search" size={22} color={theme.color.onSurface} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Balance Card */}
        <View style={styles.balanceCard} testID="balance-card">
          <Text style={styles.balanceLabel}>Balance de Hoy</Text>
          <Text
            style={[
              styles.balanceAmount,
              { color: summary.balance >= 0 ? theme.color.brandPrimary : theme.color.error },
            ]}
            testID="balance-amount"
          >
            {formatCurrency(summary.balance)}
          </Text>
          <Text style={styles.balanceMeta}>{summary.count} transacciones</Text>
        </View>

        {/* KPI Row */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, { backgroundColor: theme.color.brandTertiary }]} testID="kpi-ingresos">
            <View style={styles.kpiHeader}>
              <Ionicons name="arrow-down-circle" size={18} color={theme.color.brandPrimary} />
              <Text style={[styles.kpiLabel, { color: theme.color.onBrandTertiary }]}>Ingresos</Text>
            </View>
            <Text style={[styles.kpiValue, { color: theme.color.brandPrimary }]}>
              {formatCurrency(summary.ingresos)}
            </Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: theme.color.errorSoft }]} testID="kpi-egresos">
            <View style={styles.kpiHeader}>
              <Ionicons name="arrow-up-circle" size={18} color={theme.color.error} />
              <Text style={[styles.kpiLabel, { color: theme.color.error }]}>Egresos</Text>
            </View>
            <Text style={[styles.kpiValue, { color: theme.color.error }]}>
              {formatCurrency(summary.egresos)}
            </Text>
          </View>
        </View>

        {/* Quick Action Buttons */}
        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => openSheet("ingreso")}
            style={({ pressed }) => [styles.actionBtn, styles.actionBtnPrimary, pressed && { opacity: 0.85 }]}
            testID="btn-new-ingreso"
          >
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Ingreso</Text>
          </Pressable>
          <Pressable
            onPress={() => openSheet("egreso")}
            style={({ pressed }) => [styles.actionBtn, styles.actionBtnDanger, pressed && { opacity: 0.85 }]}
            testID="btn-new-egreso"
          >
            <Ionicons name="remove-circle" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Egreso</Text>
          </Pressable>
        </View>

        {/* Recent Transactions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Transacciones Recientes</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.color.brandPrimary} style={{ marginTop: 24 }} />
        ) : transactions.length === 0 ? (
          <View style={styles.empty} testID="empty-transactions">
            <Ionicons name="receipt-outline" size={36} color={theme.color.muted} />
            <Text style={styles.emptyText}>Aún no hay transacciones</Text>
            <Text style={styles.emptySubtext}>Toca Ingreso o Egreso para empezar</Text>
          </View>
        ) : (
          <View style={styles.txList}>
            {transactions.slice(0, 50).map((tx) => {
              const linkedPhone = tx.related_phone_id ? phones.find((p) => p.id === tx.related_phone_id) : null;
              const linkedRepair = tx.related_repair_id ? repairs.find((r) => r.id === tx.related_repair_id) : null;
              return (
                <Pressable
                  key={tx.id}
                  onPress={() => openDetail(tx)}
                  style={styles.txRow}
                  testID={`tx-row-${tx.id}`}
                >
                  <View
                    style={[
                      styles.txIcon,
                      {
                        backgroundColor:
                          tx.type === "ingreso" ? theme.color.brandTertiary : theme.color.errorSoft,
                      },
                    ]}
                  >
                    <Ionicons
                      name={tx.type === "ingreso" ? "arrow-down" : "arrow-up"}
                      size={16}
                      color={tx.type === "ingreso" ? theme.color.brandPrimary : theme.color.error}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.txTitleRow}>
                      <Text style={styles.txCategory}>{capitalize(tx.category)}</Text>
                      {linkedPhone && (
                        <View style={styles.linkChip}>
                          <Ionicons name="phone-portrait" size={10} color={theme.color.brandPrimary} />
                          <Text style={styles.linkChipText} numberOfLines={1}>
                            {linkedPhone.brand} {linkedPhone.model}
                          </Text>
                        </View>
                      )}
                      {linkedRepair && (
                        <View style={styles.linkChip}>
                          <Ionicons name="construct" size={10} color={theme.color.brandPrimary} />
                          <Text style={styles.linkChipText} numberOfLines={1}>
                            {linkedRepair.client_name}
                          </Text>
                        </View>
                      )}
                    </View>
                    {tx.description ? (
                      <Text style={styles.txDescription} numberOfLines={2}>{tx.description}</Text>
                    ) : null}
                    <Text style={styles.txMeta}>{formatDate(tx.date)}</Text>
                  </View>
                  <Text
                    style={[
                      styles.txAmount,
                      { color: tx.type === "ingreso" ? theme.color.brandPrimary : theme.color.error },
                    ]}
                  >
                    {tx.type === "ingreso" ? "+" : "-"}
                    {formatCurrency(tx.amount)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <BottomSheet
        ref={sheetRef}
        index={-1}
        enablePanDownToClose
        snapPoints={["80%"]}
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
              <Text style={styles.sheetTitle}>
                Nuevo {txType === "ingreso" ? "Ingreso" : "Egreso"}
              </Text>

              <Text style={styles.label}>Monto (RD$)</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={theme.color.muted}
                keyboardType="decimal-pad"
                testID="input-amount"
              />

              <Text style={styles.label}>Categoría</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              >
                {cats.map((c) => {
                  const active = c === category;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setCategory(c)}
                      style={[
                        styles.chip,
                        active && { backgroundColor: theme.color.brandPrimary, borderColor: theme.color.brandPrimary },
                      ]}
                      testID={`chip-cat-${c}`}
                    >
                      <Text style={[styles.chipText, active && { color: "#fff" }]}>
                        {capitalize(c)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>Descripción (opcional)</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: "top" }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Ej: Venta iPhone 13"
                placeholderTextColor={theme.color.muted}
                multiline
                testID="input-description"
              />

              {txType === "ingreso" && category === "venta" && (
                <>
                  <Text style={styles.label}>Vincular con celular del inventario (opcional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                    <Pressable
                      onPress={() => setLinkedPhoneId(null)}
                      style={[styles.chip, !linkedPhoneId && { backgroundColor: theme.color.brandPrimary, borderColor: theme.color.brandPrimary }]}
                      testID="chip-phone-none"
                    >
                      <Text style={[styles.chipText, !linkedPhoneId && { color: "#fff" }]}>Sin vincular</Text>
                    </Pressable>
                    {phones
                      .filter((p) => p.status === "disponible" && p.stock > 0)
                      .map((p) => {
                        const active = p.id === linkedPhoneId;
                        return (
                          <Pressable
                            key={p.id}
                            onPress={() => {
                              setLinkedPhoneId(p.id);
                              if (!amount) setAmount(String(p.sell_price));
                            }}
                            style={[styles.chip, active && { backgroundColor: theme.color.brandPrimary, borderColor: theme.color.brandPrimary }]}
                            testID={`chip-phone-${p.id}`}
                          >
                            <Ionicons name="phone-portrait" size={12} color={active ? "#fff" : theme.color.brandPrimary} />
                            <Text style={[styles.chipText, active && { color: "#fff" }, { marginLeft: 4 }]}>
                              {p.brand} {p.model}
                            </Text>
                          </Pressable>
                        );
                      })}
                  </ScrollView>
                  {linkedPhoneId && (
                    <Text style={styles.linkHint}>
                      Al guardar, el celular se marcará como VENDIDO en el inventario.
                    </Text>
                  )}
                </>
              )}

              <Pressable
                onPress={submit}
                disabled={saving}
                style={({ pressed }) => [
                  styles.submitBtn,
                  pressed && { opacity: 0.85 },
                  saving && { opacity: 0.6 },
                ]}
                testID="btn-submit-tx"
              >
                <Text style={styles.submitBtnText}>
                  {saving ? "Guardando..." : "Guardar Transacción"}
                </Text>
              </Pressable>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Transaction Detail Sheet */}
      <BottomSheet
        ref={detailSheetRef}
        index={-1}
        enablePanDownToClose
        snapPoints={["65%"]}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
        backgroundStyle={{ backgroundColor: theme.color.surfaceSecondary }}
      >
        {detail && (
          <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: 60 }}>
            <View style={styles.detailHeader}>
              <View
                style={[
                  styles.txIcon,
                  { width: 48, height: 48, borderRadius: 24, backgroundColor: detail.type === "ingreso" ? theme.color.brandTertiary : theme.color.errorSoft },
                ]}
              >
                <Ionicons
                  name={detail.type === "ingreso" ? "arrow-down" : "arrow-up"}
                  size={22}
                  color={detail.type === "ingreso" ? theme.color.brandPrimary : theme.color.error}
                />
              </View>
              <Text
                style={[
                  styles.detailAmount,
                  { color: detail.type === "ingreso" ? theme.color.brandPrimary : theme.color.error },
                ]}
              >
                {detail.type === "ingreso" ? "+" : "-"}{formatCurrency(detail.amount)}
              </Text>
            </View>

            <DetailRow label="Tipo" value={detail.type === "ingreso" ? "Ingreso" : "Egreso"} styles={styles} />
            <DetailRow label="Categoría" value={capitalize(detail.category)} styles={styles} />
            <DetailRow label="Fecha" value={formatDate(detail.date)} styles={styles} />
            <DetailRow
              label="Descripción"
              value={detail.description || "—"}
              styles={styles}
              multiline
            />
            {detail.related_phone_id && (() => {
              const p = phones.find((x) => x.id === detail.related_phone_id);
              if (!p) return null;
              return (
                <View style={styles.linkedBox}>
                  <View style={styles.linkedHeader}>
                    <Ionicons name="phone-portrait" size={16} color={theme.color.brandPrimary} />
                    <Text style={styles.linkedTitle}>Celular vendido</Text>
                  </View>
                  <DetailRow label="Marca / Modelo" value={`${p.brand} ${p.model}`} styles={styles} />
                  {p.imei ? <DetailRow label="IMEI" value={p.imei} styles={styles} /> : null}
                  {p.color ? <DetailRow label="Color" value={p.color} styles={styles} /> : null}
                  <DetailRow label="Condición" value={capitalize(p.condition)} styles={styles} />
                  <DetailRow label="Estado" value={p.status === "vendido" ? "Vendido" : "Disponible"} styles={styles} />
                </View>
              );
            })()}
            {detail.related_repair_id && (() => {
              const r = repairs.find((x) => x.id === detail.related_repair_id);
              if (!r) return null;
              return (
                <View style={styles.linkedBox}>
                  <View style={styles.linkedHeader}>
                    <Ionicons name="construct" size={16} color={theme.color.brandPrimary} />
                    <Text style={styles.linkedTitle}>Reparación</Text>
                  </View>
                  <DetailRow label="Cliente" value={r.client_name} styles={styles} />
                  <DetailRow label="Equipo" value={r.device} styles={styles} />
                  <DetailRow label="Falla" value={r.fault} styles={styles} multiline />
                </View>
              );
            })()}

            <View style={{ flexDirection: "row", gap: 10, marginTop: theme.spacing.xl }}>
              <Pressable
                onPress={() => shareTransactionReceipt(detail)}
                style={[styles.detailAction, styles.detailActionPrimary]}
                testID="btn-detail-share"
              >
                <Ionicons name="share-outline" size={18} color="#fff" />
                <Text style={styles.detailActionTextPrimary}>Compartir recibo</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const id = detail.id;
                  detailSheetRef.current?.close();
                  removeTx(id);
                }}
                style={[styles.detailAction, styles.detailActionDanger]}
                testID="btn-detail-delete"
              >
                <Ionicons name="trash-outline" size={18} color={theme.color.error} />
                <Text style={styles.detailActionTextDanger}>Eliminar</Text>
              </Pressable>
            </View>
          </BottomSheetScrollView>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ");
}

function DetailRow({
  label,
  value,
  multiline,
  styles,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, multiline && { flex: 1, textAlign: "right" }]} numberOfLines={multiline ? 3 : 1}>
        {value}
      </Text>
    </View>
  );
}

const buildStyles = (theme: AppTheme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  headerSearchBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.color.surfaceSecondary,
    borderWidth: 1, borderColor: theme.color.border,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 28, fontWeight: "700", color: theme.color.onSurface },
  brand: { fontSize: 12, fontWeight: "800", color: theme.color.brandPrimary, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 },
  subtitle: { fontSize: 14, color: theme.color.muted, marginTop: 2, textTransform: "capitalize" },
  scroll: { paddingBottom: 32 },
  balanceCard: {
    marginHorizontal: theme.spacing.lg,
    backgroundColor: theme.color.surfaceSecondary,
    padding: theme.spacing.xl,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  balanceLabel: { fontSize: 14, color: theme.color.muted, fontWeight: "500" },
  balanceAmount: { fontSize: 36, fontWeight: "800", marginTop: 4, letterSpacing: -0.5 },
  balanceMeta: { fontSize: 12, color: theme.color.muted, marginTop: 4 },
  kpiRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  kpiCard: {
    flex: 1,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
  },
  kpiHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  kpiLabel: { fontSize: 13, fontWeight: "600" },
  kpiValue: { fontSize: 18, fontWeight: "700", marginTop: 6 },
  actionsRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
  },
  actionBtnPrimary: { backgroundColor: theme.color.brandPrimary },
  actionBtnDanger: { backgroundColor: theme.color.error },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  sectionHeader: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: theme.color.onSurface },
  empty: { alignItems: "center", paddingVertical: 48 },
  emptyText: { fontSize: 15, color: theme.color.onSurface, fontWeight: "600", marginTop: 8 },
  emptySubtext: { fontSize: 13, color: theme.color.muted, marginTop: 4 },
  txList: { paddingHorizontal: theme.spacing.lg },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.color.surfaceSecondary,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  txIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  txCategory: { fontSize: 14, fontWeight: "600", color: theme.color.onSurface },
  txTitleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  txDescription: { fontSize: 13, color: theme.color.onSurfaceTertiary, marginTop: 3, lineHeight: 17 },
  linkChip: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: theme.color.brandTertiary,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: theme.radius.pill, maxWidth: 160,
  },
  linkChipText: { fontSize: 10, fontWeight: "700", color: theme.color.brandPrimary },
  linkHint: {
    fontSize: 11, color: theme.color.brandPrimary,
    backgroundColor: theme.color.brandTertiary,
    padding: 8, borderRadius: theme.radius.sm,
    marginTop: 8,
  },
  txMeta: { fontSize: 12, color: theme.color.muted, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: "700", marginLeft: 8 },
  detailHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: theme.spacing.md, marginBottom: theme.spacing.sm,
  },
  detailAmount: { fontSize: 26, fontWeight: "800" },
  detailRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: theme.color.divider,
    gap: 12,
  },
  detailLabel: { fontSize: 13, color: theme.color.muted, fontWeight: "500" },
  detailValue: { fontSize: 14, fontWeight: "600", color: theme.color.onSurface },
  linkedBox: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.brandTertiary,
    borderWidth: 1, borderColor: theme.color.brandPrimary,
  },
  linkedHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  linkedTitle: { fontSize: 13, fontWeight: "800", color: theme.color.brandPrimary, textTransform: "uppercase", letterSpacing: 0.5 },
  detailAction: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 14, borderRadius: theme.radius.md,
  },
  detailActionPrimary: { backgroundColor: theme.color.brandPrimary },
  detailActionDanger: { backgroundColor: "transparent", borderWidth: 1, borderColor: theme.color.error },
  detailActionTextPrimary: { color: "#fff", fontWeight: "700" },
  detailActionTextDanger: { color: theme.color.error, fontWeight: "700" },
  sheetContent: { flex: 1, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: theme.color.onSurface, marginBottom: theme.spacing.lg },
  label: { fontSize: 13, fontWeight: "600", color: theme.color.onSurfaceTertiary, marginTop: theme.spacing.md, marginBottom: 6 },
  input: {
    backgroundColor: theme.color.surfaceTertiary,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.color.onSurface,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  chip: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipText: { fontSize: 13, fontWeight: "600", color: theme.color.onSurface },
  submitBtn: {
    backgroundColor: theme.color.brandPrimary,
    paddingVertical: 16,
    borderRadius: theme.radius.md,
    alignItems: "center",
    marginTop: theme.spacing.xl,
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
