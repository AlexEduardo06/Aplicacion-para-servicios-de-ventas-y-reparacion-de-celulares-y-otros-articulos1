import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/lib/theme";
import { api, formatCurrency } from "@/src/lib/api";

interface RangeReport {
  days: number;
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
  total_ingresos: number;
  total_egresos: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  venta: "Ventas",
  reparacion: "Reparaciones",
  compra: "Compras",
  gasto: "Gastos",
  otro: "Otros",
};

export default function MasScreen() {
  const [week, setWeek] = useState<RangeReport | null>(null);
  const [month, setMonth] = useState<RangeReport | null>(null);
  const [byCat, setByCat] = useState<CategoryReport | null>(null);
  const [counts, setCounts] = useState({ phones: 0, available: 0, sold: 0, repairs: 0, active: 0, delivered: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [w, m, cat, phones, repairs] = await Promise.all([
        api.summaryRange(7),
        api.summaryRange(30),
        api.summaryByCategory(30),
        api.listPhones(),
        api.listRepairs(),
      ]);
      setWeek(w);
      setMonth(m);
      setByCat(cat);
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
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.brand} testID="brand-name">The Family Solutions</Text>
        <Text style={styles.title}>Reportes</Text>
        <Text style={styles.subtitle}>Resumen general del negocio</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.color.brandPrimary} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 32 }}>
          <Section title="Últimos 7 días" testID="report-week">
            <Stat label="Ingresos" value={formatCurrency(week?.ingresos || 0)} color={theme.color.brandPrimary} />
            <Stat label="Egresos" value={formatCurrency(week?.egresos || 0)} color={theme.color.error} />
            <Stat label="Balance" value={formatCurrency(week?.balance || 0)} color={(week?.balance || 0) >= 0 ? theme.color.brandPrimary : theme.color.error} bold />
          </Section>

          <Section title="Últimos 30 días" testID="report-month">
            <Stat label="Ingresos" value={formatCurrency(month?.ingresos || 0)} color={theme.color.brandPrimary} />
            <Stat label="Egresos" value={formatCurrency(month?.egresos || 0)} color={theme.color.error} />
            <Stat label="Balance" value={formatCurrency(month?.balance || 0)} color={(month?.balance || 0) >= 0 ? theme.color.brandPrimary : theme.color.error} bold />
          </Section>

          <Section title="Ingresos por categoría (30 días)" testID="report-cat-in">
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
              <Text style={styles.emptyCat}>Sin ingresos registrados</Text>
            )}
          </Section>

          <Section title="Egresos por categoría (30 días)" testID="report-cat-out">
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
              <Text style={styles.emptyCat}>Sin egresos registrados</Text>
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

          <View style={styles.aboutCard}>
            <Ionicons name="information-circle-outline" size={20} color={theme.color.brandPrimary} />
            <Text style={styles.aboutText}>
              Los datos se sincronizan en tiempo real. Desliza hacia abajo en las pantallas para refrescar.
            </Text>
          </View>
        </ScrollView>
      )}
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
    <View style={styles.catRow} testID={`cat-${label.toLowerCase()}`}>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.md },
  title: { fontSize: 28, fontWeight: "700", color: theme.color.onSurface },
  brand: { fontSize: 12, fontWeight: "800", color: theme.color.brandPrimary, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 },
  subtitle: { fontSize: 14, color: theme.color.muted, marginTop: 2 },
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
  emptyCat: { fontSize: 13, color: theme.color.muted, paddingVertical: 10, textAlign: "center" },
  aboutCard: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: theme.color.brandTertiary,
    padding: theme.spacing.md, borderRadius: theme.radius.md,
    marginTop: theme.spacing.md,
  },
  aboutText: { flex: 1, fontSize: 13, color: theme.color.onBrandTertiary, lineHeight: 18 },
});
