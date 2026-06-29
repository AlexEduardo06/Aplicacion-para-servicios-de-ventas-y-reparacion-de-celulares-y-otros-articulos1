import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/lib/theme";
import { api, formatCurrency } from "@/src/lib/api";

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
                    bg="#FEE2E2"
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
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children, testID }: { title: string; children: React.ReactNode; testID?: string }) {
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

const styles = StyleSheet.create({
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
});
