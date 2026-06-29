import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
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
import { AppTheme } from "@/src/lib/theme";
import { useTheme } from "@/src/lib/theme-context";
import { api, DailySummary, formatCurrency, formatDate, Transaction, TxType } from "@/src/lib/api";
import { shareTransactionReceipt } from "@/src/lib/receipt";

const CATEGORIES_IN = ["venta", "reparacion", "otro"];
const CATEGORIES_OUT = ["compra", "gasto", "otro"];

export default function CajaScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  const [summary, setSummary] = useState<DailySummary>({
    ingresos: 0,
    egresos: 0,
    balance: 0,
    count: 0,
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const sheetRef = useRef<BottomSheet>(null);
  const [txType, setTxType] = useState<TxType>("ingreso");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("venta");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([api.summaryToday(), api.listTransactions()]);
      setSummary(s);
      setTransactions(t);
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
    sheetRef.current?.expand();
  };

  const submit = async () => {
    const n = parseFloat(amount.replace(",", "."));
    if (!n || n <= 0) return;
    setSaving(true);
    try {
      await api.createTransaction({
        type: txType,
        amount: n,
        category,
        description,
      });
      sheetRef.current?.close();
      load();
    } catch (e) {
      console.warn(e);
    } finally {
      setSaving(false);
    }
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
            {transactions.slice(0, 50).map((tx) => (
              <View key={tx.id} style={styles.txRow} testID={`tx-row-${tx.id}`}>
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
                  <Text style={styles.txCategory}>{capitalize(tx.category)}</Text>
                  <Text style={styles.txMeta} numberOfLines={1}>
                    {tx.description || "—"} · {formatDate(tx.date)}
                  </Text>
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
                <Pressable
                  onPress={() => shareTransactionReceipt(tx)}
                  hitSlop={8}
                  testID={`tx-share-${tx.id}`}
                  style={{ marginLeft: 8 }}
                >
                  <Ionicons name="share-outline" size={18} color={theme.color.brandPrimary} />
                </Pressable>
                <Pressable onPress={() => removeTx(tx.id)} hitSlop={8} testID={`tx-delete-${tx.id}`}>
                  <Ionicons name="trash-outline" size={18} color={theme.color.muted} style={{ marginLeft: 8 }} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <BottomSheet
        ref={sheetRef}
        index={-1}
        enablePanDownToClose
        snapPoints={["70%"]}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
        backgroundStyle={{ backgroundColor: theme.color.surfaceSecondary }}
      >
        <BottomSheetView style={styles.sheetContent}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 32 }}>
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
          </KeyboardAvoidingView>
        </BottomSheetView>
      </BottomSheet>
    </SafeAreaView>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ");
}

const buildStyles = (theme: AppTheme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
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
  txMeta: { fontSize: 12, color: theme.color.muted, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: "700" },
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
