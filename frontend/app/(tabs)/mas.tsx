import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { AppTheme } from "@/src/lib/theme";
import { useTheme } from "@/src/lib/theme-context";
import { api, formatCurrency } from "@/src/lib/api";
import { shareFullReport } from "@/src/lib/receipt";
import { shareBackupJson, pickAndRestoreJson } from "@/src/lib/backup";
import { storage } from "@/src/utils/storage";

const REMINDER_KEY = "settings.repair_ready_alert_days";

interface RangeReport {
  ingresos: number;
  egresos: number;
  balance: number;
}

interface CategoryRow {
  category: string;
  amount: number;
  percent: number;
}

interface CategoryReport {
  ingresos: CategoryRow[];
  egresos: CategoryRow[];
}

interface ClientRow {
  client_name: string;
  count: number;
  total: number;
}

interface PhoneRow {
  label: string;
  brand: string;
  model: string;
  count: number;
  total: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  venta: "Ventas",
  reparacion: "Reparaciones",
  compra: "Compras",
  gasto: "Gastos",
  otro: "Otros",
};

const PRESETS: { key: string; label: string; days: number }[] = [
  { key: "7", label: "7 días", days: 7 },
  { key: "30", label: "30 días", days: 30 },
  { key: "90", label: "90 días", days: 90 },
  { key: "365", label: "1 año", days: 365 },
];

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

export default function MasScreen() {
  const { theme, mode, toggle } = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);
  const [preset, setPreset] = useState("30");
  const [customMode, setCustomMode] = useState(false);
  const [startStr, setStartStr] = useState(toISODate(new Date(Date.now() - 30 * 86400000)));
  const [endStr, setEndStr] = useState(toISODate(new Date()));

  const [report, setReport] = useState<RangeReport | null>(null);
  const [byCat, setByCat] = useState<CategoryReport | null>(null);
  const [topClients, setTopClients] = useState<ClientRow[]>([]);
  const [topPhones, setTopPhones] = useState<PhoneRow[]>([]);
  const [counts, setCounts] = useState({ phones: 0, available: 0, sold: 0, repairs: 0, active: 0, delivered: 0 });
  const [loading, setLoading] = useState(true);
  const [thresholdStr, setThresholdStr] = useState("3");
  const restoreSheetRef = useRef<BottomSheet>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const runRestore = useCallback(async (mode: "replace" | "merge") => {
    setRestoreBusy(true);
    setRestoreStatus(null);
    try {
      const result = await pickAndRestoreJson(mode);
      if (!result) {
        setRestoreBusy(false);
        return;
      }
      const i = result.inserted;
      setRestoreStatus({
        kind: "ok",
        msg: `Restaurado (${result.mode}): ${i.transactions} transacciones, ${i.phones} celulares, ${i.repairs} reparaciones`,
      });
      load();
      restoreSheetRef.current?.close();
    } catch (e) {
      setRestoreStatus({ kind: "err", msg: e instanceof Error ? e.message : "Error al restaurar" });
    } finally {
      setRestoreBusy(false);
    }
  }, [load]);

  useEffect(() => {
    (async () => {
      const v = await storage.getItem<number>(REMINDER_KEY, 3);
      setThresholdStr(String(v ?? 3));
    })();
  }, []);

  const saveThreshold = async (val: string) => {
    setThresholdStr(val);
    const n = parseInt(val || "3");
    if (!isNaN(n) && n > 0) {
      await storage.setItem(REMINDER_KEY, n);
    }
  };

  const exportPdf = async () => {
    if (!report || !byCat) return;
    await shareFullReport({
      rangeLabel: range?.label || "",
      totals: { ingresos: report.ingresos, egresos: report.egresos, balance: report.balance },
      ingresosCat: byCat.ingresos,
      egresosCat: byCat.egresos,
      topPhones: topPhones,
      topClients: topClients,
      inventory: { phones: counts.phones, available: counts.available, sold: counts.sold },
      repairs: { total: counts.repairs, active: counts.active, delivered: counts.delivered },
    });
  };

  const range = useMemo(() => {
    if (customMode) {
      const s = parseDate(startStr);
      const e = parseDate(endStr);
      if (s && e) {
        const endOfDay = new Date(e);
        endOfDay.setUTCHours(23, 59, 59, 999);
        return { start: s.toISOString(), end: endOfDay.toISOString(), days: 0, label: `${startStr} → ${endStr}` };
      }
      return null;
    }
    const days = PRESETS.find((p) => p.key === preset)?.days || 30;
    return { start: undefined, end: undefined, days, label: `Últimos ${days} días` };
  }, [customMode, preset, startStr, endStr]);

  const load = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    try {
      const [r, cat, tc, tp, phones, repairs] = await Promise.all([
        api.summaryRange(range.days, range.start, range.end),
        api.summaryByCategory(range.days, range.start, range.end),
        api.topClients(range.days, range.start, range.end),
        api.topPhones(range.days, range.start, range.end),
        api.listPhones(),
        api.listRepairs(),
      ]);
      setReport(r);
      setByCat(cat);
      setTopClients(tc);
      setTopPhones(tp);
      setCounts({
        phones: phones.length,
        available: phones.filter((p) => p.status === "disponible").length,
        sold: phones.filter((p) => p.status === "vendido").length,
        repairs: repairs.length,
        active: repairs.filter((r) => r.status !== "entregado").length,
        delivered: repairs.filter((r) => r.status === "entregado").length,
      });
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.brand} testID="brand-name">The Family Solutions</Text>
        <Text style={styles.title}>Reportes</Text>
        <Text style={styles.subtitle}>{range?.label || "Seleccione un rango"}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Range Filter */}
        <View style={styles.filterWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {PRESETS.map((p) => {
              const active = !customMode && p.key === preset;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => { setCustomMode(false); setPreset(p.key); }}
                  style={[styles.chip, active && styles.chipActive]}
                  testID={`range-${p.key}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setCustomMode(true)}
              style={[styles.chip, customMode && styles.chipActive]}
              testID="range-custom"
            >
              <Ionicons name="calendar-outline" size={14} color={customMode ? "#fff" : theme.color.onSurface} />
              <Text style={[styles.chipText, customMode && styles.chipTextActive, { marginLeft: 4 }]}>
                Personalizado
              </Text>
            </Pressable>
          </ScrollView>

          {customMode && (
            <View style={styles.customRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>Desde</Text>
                <TextInput
                  style={styles.dateInput}
                  value={startStr}
                  onChangeText={setStartStr}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.color.muted}
                  autoCapitalize="none"
                  testID="input-start-date"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>Hasta</Text>
                <TextInput
                  style={styles.dateInput}
                  value={endStr}
                  onChangeText={setEndStr}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.color.muted}
                  autoCapitalize="none"
                  testID="input-end-date"
                />
              </View>
            </View>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color={theme.color.brandPrimary} style={{ marginTop: 24 }} />
        ) : (
          <View style={{ paddingHorizontal: theme.spacing.lg }}>
            <Section title={range?.label || ""} testID="report-summary">
              <Stat label="Ingresos" value={formatCurrency(report?.ingresos || 0)} color={theme.color.brandPrimary} />
              <Stat label="Egresos" value={formatCurrency(report?.egresos || 0)} color={theme.color.error} />
              <Stat
                label="Balance"
                value={formatCurrency(report?.balance || 0)}
                color={(report?.balance || 0) >= 0 ? theme.color.brandPrimary : theme.color.error}
                bold
              />
            </Section>

            <Section title="Ingresos por categoría" testID="report-cat-in">
              {byCat && byCat.ingresos.length > 0 ? (
                byCat.ingresos.map((row) => (
                  <CategoryBar
                    key={`in-${row.category}`}
                    label={CATEGORY_LABELS[row.category] || row.category}
                    amount={row.amount}
                    percent={row.percent}
                    color={theme.color.brandPrimary}
                    bg={theme.color.brandTertiary}
                  />
                ))
              ) : (
                <Text style={styles.emptyCat}>Sin ingresos en este rango</Text>
              )}
            </Section>

            <Section title="Egresos por categoría" testID="report-cat-out">
              {byCat && byCat.egresos.length > 0 ? (
                byCat.egresos.map((row) => (
                  <CategoryBar
                    key={`out-${row.category}`}
                    label={CATEGORY_LABELS[row.category] || row.category}
                    amount={row.amount}
                    percent={row.percent}
                    color={theme.color.error}
                    bg={theme.color.errorSoft}
                  />
                ))
              ) : (
                <Text style={styles.emptyCat}>Sin egresos en este rango</Text>
              )}
            </Section>

            <Section title="Top celulares vendidos" testID="report-top-phones">
              {topPhones.length > 0 ? (
                topPhones.map((p, idx) => (
                  <RankRow
                    key={p.label}
                    rank={idx + 1}
                    title={p.label}
                    subtitle={`${p.count} unidad${p.count > 1 ? "es" : ""}`}
                    amount={formatCurrency(p.total)}
                  />
                ))
              ) : (
                <Text style={styles.emptyCat}>Aún no hay ventas registradas</Text>
              )}
            </Section>

            <Section title="Top clientes (reparaciones)" testID="report-top-clients">
              {topClients.length > 0 ? (
                topClients.map((c, idx) => (
                  <RankRow
                    key={c.client_name}
                    rank={idx + 1}
                    title={c.client_name}
                    subtitle={`${c.count} reparación${c.count > 1 ? "es" : ""}`}
                    amount={formatCurrency(c.total)}
                  />
                ))
              ) : (
                <Text style={styles.emptyCat}>Aún no hay clientes registrados</Text>
              )}
            </Section>

            <Section title="Inventario" testID="report-inventory">
              <Stat label="Total equipos" value={String(counts.phones)} />
              <Stat label="Disponibles" value={String(counts.available)} color={theme.color.brandPrimary} />
              <Stat label="Vendidos" value={String(counts.sold)} color={theme.color.muted} />
            </Section>

            <Section title="Reparaciones" testID="report-repairs">
              <Stat label="Total" value={String(counts.repairs)} />
              <Stat label="Activas" value={String(counts.active)} color={theme.color.warning} />
              <Stat label="Entregadas" value={String(counts.delivered)} color={theme.color.success} />
            </Section>

            <Section title="Ajustes" testID="report-settings">
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Avisar si una reparación está &quot;Lista&quot; por más de</Text>
                  <Text style={styles.settingSub}>Se muestra un aviso en la lista de reparaciones</Text>
                </View>
                <TextInput
                  style={styles.thresholdInput}
                  value={thresholdStr}
                  onChangeText={saveThreshold}
                  keyboardType="number-pad"
                  testID="input-threshold-days"
                />
                <Text style={styles.settingUnit}>días</Text>
              </View>

              <Pressable onPress={toggle} style={[styles.settingRow, { paddingTop: 16 }]} testID="btn-toggle-theme">
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Modo oscuro</Text>
                  <Text style={styles.settingSub}>Cambia toda la app a tema oscuro</Text>
                </View>
                <View style={[styles.toggle, mode === "dark" && styles.toggleOn]}>
                  <View style={[styles.toggleKnob, mode === "dark" && styles.toggleKnobOn]} />
                </View>
              </Pressable>
            </Section>

            <Pressable
              onPress={exportPdf}
              style={({ pressed }) => [styles.exportBtn, pressed && { opacity: 0.85 }]}
              testID="btn-export-pdf"
            >
              <Ionicons name="document-text-outline" size={20} color="#fff" />
              <Text style={styles.exportBtnText}>Exportar Reporte PDF</Text>
            </Pressable>

            <Pressable
              onPress={async () => {
                try {
                  await shareBackupJson();
                } catch (e) { console.warn(e); }
              }}
              style={({ pressed }) => [styles.backupBtn, pressed && { opacity: 0.85 }]}
              testID="btn-backup-json"
            >
              <Ionicons name="download-outline" size={20} color={theme.color.brandPrimary} />
              <Text style={styles.backupBtnText}>Exportar Respaldo JSON</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setRestoreStatus(null);
                restoreSheetRef.current?.expand();
              }}
              style={({ pressed }) => [styles.backupBtn, pressed && { opacity: 0.85 }]}
              testID="btn-restore-json"
            >
              <Ionicons name="cloud-upload-outline" size={20} color={theme.color.brandPrimary} />
              <Text style={styles.backupBtnText}>Importar Respaldo JSON</Text>
            </Pressable>

            {restoreStatus && (
              <View
                style={[
                  styles.statusBox,
                  restoreStatus.kind === "ok" ? styles.statusOk : styles.statusErr,
                ]}
                testID="restore-status"
              >
                <Ionicons
                  name={restoreStatus.kind === "ok" ? "checkmark-circle" : "alert-circle"}
                  size={18}
                  color={restoreStatus.kind === "ok" ? theme.color.brandPrimary : theme.color.error}
                />
                <Text
                  style={[
                    styles.statusText,
                    { color: restoreStatus.kind === "ok" ? theme.color.brandPrimary : theme.color.error },
                  ]}
                >
                  {restoreStatus.msg}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <BottomSheet
        ref={restoreSheetRef}
        index={-1}
        enablePanDownToClose
        snapPoints={["55%"]}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
        backgroundStyle={{ backgroundColor: theme.color.surfaceSecondary }}
      >
        <BottomSheetView style={{ padding: theme.spacing.lg }}>
          <Text style={styles.restoreTitle}>Importar Respaldo</Text>
          <Text style={styles.restoreText}>
            Selecciona un archivo <Text style={{ fontWeight: "700" }}>.json</Text> previamente exportado y elige cómo combinar los datos.
          </Text>

          <Pressable
            onPress={() => runRestore("replace")}
            disabled={restoreBusy}
            style={[styles.restoreDanger, restoreBusy && { opacity: 0.6 }]}
            testID="btn-restore-replace"
          >
            <Ionicons name="warning-outline" size={18} color={theme.color.onError} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.restoreDangerTitle}>Reemplazar todo</Text>
              <Text style={styles.restoreDangerSub}>Borra todos los datos actuales antes de importar</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => runRestore("merge")}
            disabled={restoreBusy}
            style={[styles.restoreMerge, restoreBusy && { opacity: 0.6 }]}
            testID="btn-restore-merge"
          >
            <Ionicons name="git-merge-outline" size={18} color={theme.color.brandPrimary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.restoreMergeTitle}>Combinar (mantener todo)</Text>
              <Text style={styles.restoreMergeSub}>Agrega los datos del archivo a los actuales (sobreescribe por ID)</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => restoreSheetRef.current?.close()}
            style={styles.restoreCancel}
            testID="btn-restore-cancel"
          >
            <Text style={styles.restoreCancelText}>Cancelar</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheet>
    </SafeAreaView>
  );
}

function Section({ title, children, testID }: { title: string; children: React.ReactNode; testID?: string }) {
  const { theme } = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);
  return (
    <View style={styles.section} testID={testID}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Stat({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: string;
  color?: string;
  bold?: boolean;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null, bold ? { fontWeight: "800" } : null]}>{value}</Text>
    </View>
  );
}

function CategoryBar({
  label,
  amount,
  percent,
  color,
  bg,
}: {
  label: string;
  amount: number;
  percent: number;
  color: string;
  bg: string;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);
  const width = Math.max(2, Math.min(100, percent));
  return (
    <View style={styles.catRow}>
      <View style={styles.catRowHeader}>
        <Text style={styles.catLabel}>{label}</Text>
        <Text style={[styles.catAmount, { color }]}>{formatCurrency(amount)}</Text>
      </View>
      <View style={[styles.catBarBg, { backgroundColor: bg }]}>
        <View style={[styles.catBarFill, { width: `${width}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.catPercent}>{percent.toFixed(1)}%</Text>
    </View>
  );
}

function RankRow({
  rank,
  title,
  subtitle,
  amount,
}: {
  rank: number;
  title: string;
  subtitle: string;
  amount: string;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);
  return (
    <View style={styles.rankRow}>
      <View style={styles.rankBadge}>
        <Text style={styles.rankBadgeText}>{rank}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.rankTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.rankSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.rankAmount}>{amount}</Text>
    </View>
  );
}

const buildStyles = (theme: AppTheme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.md },
  title: { fontSize: 28, fontWeight: "700", color: theme.color.onSurface },
  brand: { fontSize: 12, fontWeight: "800", color: theme.color.brandPrimary, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 },
  subtitle: { fontSize: 14, color: theme.color.muted, marginTop: 2 },
  filterWrap: { paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md },
  chipRow: { gap: 8, paddingVertical: theme.spacing.sm, paddingRight: theme.spacing.lg },
  chip: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 14, height: 36, borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceSecondary,
    flexShrink: 0,
  },
  chipActive: { backgroundColor: theme.color.brandPrimary, borderColor: theme.color.brandPrimary },
  chipText: { fontSize: 13, fontWeight: "600", color: theme.color.onSurface },
  chipTextActive: { color: "#fff" },
  customRow: { flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.sm },
  dateLabel: { fontSize: 12, color: theme.color.muted, fontWeight: "600", marginBottom: 4 },
  dateInput: {
    backgroundColor: theme.color.surfaceTertiary,
    borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: theme.color.onSurface,
    borderWidth: 1, borderColor: theme.color.border,
  },
  section: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.border,
    marginBottom: theme.spacing.md,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 13, fontWeight: "700",
    color: theme.color.onSurfaceTertiary,
    textTransform: "uppercase", letterSpacing: 0.5,
    paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm,
  },
  sectionBody: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md },
  statRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: theme.color.divider,
  },
  statLabel: { fontSize: 14, color: theme.color.onSurface },
  statValue: { fontSize: 15, fontWeight: "700", color: theme.color.onSurface },
  catRow: {
    paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: theme.color.divider,
  },
  catRowHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 6,
  },
  catLabel: { fontSize: 14, fontWeight: "600", color: theme.color.onSurface },
  catAmount: { fontSize: 14, fontWeight: "700" },
  catBarBg: { height: 8, borderRadius: 4, overflow: "hidden" },
  catBarFill: { height: "100%", borderRadius: 4 },
  catPercent: { fontSize: 11, color: theme.color.muted, marginTop: 4, textAlign: "right" },
  emptyCat: { fontSize: 13, color: theme.color.muted, paddingVertical: 14, textAlign: "center" },
  rankRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: theme.color.divider,
  },
  rankBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: theme.color.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  rankBadgeText: { fontSize: 13, fontWeight: "800", color: theme.color.brandPrimary },
  rankTitle: { fontSize: 14, fontWeight: "700", color: theme.color.onSurface },
  rankSubtitle: { fontSize: 12, color: theme.color.muted, marginTop: 2 },
  rankAmount: { fontSize: 14, fontWeight: "800", color: theme.color.brandPrimary },
  settingRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingTop: 6,
  },
  settingLabel: { fontSize: 13, fontWeight: "600", color: theme.color.onSurface },
  settingSub: { fontSize: 11, color: theme.color.muted, marginTop: 2 },
  settingUnit: { fontSize: 13, color: theme.color.muted, fontWeight: "500" },
  thresholdInput: {
    width: 56, height: 40, borderRadius: 8,
    backgroundColor: theme.color.surfaceTertiary,
    textAlign: "center",
    fontSize: 16, fontWeight: "700", color: theme.color.onSurface,
    borderWidth: 1, borderColor: theme.color.border,
  },
  exportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.color.brandPrimary,
    paddingVertical: 16, borderRadius: theme.radius.md,
    marginTop: theme.spacing.md, marginBottom: theme.spacing.lg,
  },
  exportBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  backupBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.color.brandTertiary,
    paddingVertical: 16, borderRadius: theme.radius.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1, borderColor: theme.color.brandPrimary,
  },
  backupBtnText: { color: theme.color.brandPrimary, fontSize: 15, fontWeight: "700" },
  toggle: {
    width: 48, height: 28, borderRadius: 14,
    backgroundColor: theme.color.surfaceTertiary,
    borderWidth: 1, borderColor: theme.color.border,
    justifyContent: "center", paddingHorizontal: 2,
  },
  toggleOn: { backgroundColor: theme.color.brandPrimary, borderColor: theme.color.brandPrimary },
  toggleKnob: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: theme.color.surfaceSecondary,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  toggleKnobOn: { transform: [{ translateX: 20 }], backgroundColor: theme.color.onBrandPrimary },
  statusBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  statusOk: { backgroundColor: theme.color.brandTertiary, borderColor: theme.color.brandPrimary },
  statusErr: { backgroundColor: theme.color.errorSoft, borderColor: theme.color.error },
  statusText: { flex: 1, fontSize: 13, fontWeight: "600" },
  restoreTitle: { fontSize: 20, fontWeight: "700", color: theme.color.onSurface, marginBottom: 8 },
  restoreText: { fontSize: 13, color: theme.color.muted, marginBottom: theme.spacing.lg, lineHeight: 18 },
  restoreDanger: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: theme.color.error,
    paddingHorizontal: 14, paddingVertical: 14,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
  },
  restoreDangerTitle: { color: theme.color.onError, fontWeight: "700", fontSize: 15 },
  restoreDangerSub: { color: theme.color.onError, fontSize: 11, opacity: 0.9, marginTop: 2 },
  restoreMerge: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: theme.color.brandTertiary,
    paddingHorizontal: 14, paddingVertical: 14,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1, borderColor: theme.color.brandPrimary,
  },
  restoreMergeTitle: { color: theme.color.brandPrimary, fontWeight: "700", fontSize: 15 },
  restoreMergeSub: { color: theme.color.onBrandTertiary, fontSize: 11, marginTop: 2 },
  restoreCancel: {
    paddingVertical: 12, alignItems: "center", marginTop: 4,
  },
  restoreCancelText: { fontSize: 14, fontWeight: "600", color: theme.color.muted },
});
