import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AppTheme } from "@/src/lib/theme";
import { useTheme } from "@/src/lib/theme-context";
import { api, formatCurrency, formatDate, Phone, Repair, Transaction } from "@/src/lib/api";

type Hit =
  | { kind: "tx"; data: Transaction }
  | { kind: "phone"; data: Phone }
  | { kind: "repair"; data: Repair };

export default function SearchScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const term = q.trim();
      if (term.length < 2) {
        setHits([]);
        setSearched(false);
        return;
      }
      setLoading(true);
      api
        .search(term)
        .then((r) => {
          const combined: Hit[] = [
            ...r.transactions.map((d) => ({ kind: "tx" as const, data: d })),
            ...r.phones.map((d) => ({ kind: "phone" as const, data: d })),
            ...r.repairs.map((d) => ({ kind: "repair" as const, data: d })),
          ];
          setHits(combined);
          setSearched(true);
        })
        .catch((e) => {
          console.warn(e);
          setHits([]);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const goTo = (kind: Hit["kind"]) => {
    router.back();
    setTimeout(() => {
      if (kind === "tx") router.push("/(tabs)" as never);
      else if (kind === "phone") router.push("/(tabs)/inventario" as never);
      else router.push("/(tabs)/reparaciones" as never);
    }, 50);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} testID="btn-close-search">
            <Ionicons name="close" size={26} color={theme.color.onSurface} />
          </Pressable>
          <Text style={styles.title}>Búsqueda</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={20} color={theme.color.muted} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Buscar cliente, marca, IMEI, falla, categoría..."
            placeholderTextColor={theme.color.muted}
            autoFocus
            returnKeyType="search"
            testID="input-search"
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ("")} hitSlop={8} testID="btn-clear-search">
              <Ionicons name="close-circle" size={18} color={theme.color.muted} />
            </Pressable>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color={theme.color.brandPrimary} style={{ marginTop: 32 }} />
        ) : q.trim().length < 2 ? (
          <View style={styles.empty} testID="search-hint">
            <Ionicons name="search-outline" size={48} color={theme.color.muted} />
            <Text style={styles.emptyText}>Escribe al menos 2 letras</Text>
            <Text style={styles.emptySubtext}>Busca en transacciones, inventario y reparaciones</Text>
          </View>
        ) : searched && hits.length === 0 ? (
          <View style={styles.empty} testID="search-empty">
            <Ionicons name="alert-circle-outline" size={48} color={theme.color.muted} />
            <Text style={styles.emptyText}>Sin resultados</Text>
            <Text style={styles.emptySubtext}>Prueba con otra palabra clave</Text>
          </View>
        ) : (
          <FlatList
            data={hits}
            keyExtractor={(h) =>
              h.kind === "tx"
                ? `tx-${h.data.id}`
                : h.kind === "phone"
                ? `p-${h.data.id}`
                : `r-${h.data.id}`
            }
            contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => <Row hit={item} onPress={() => goTo(item.kind)} />}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Row({ hit, onPress }: { hit: Hit; onPress: () => void }) {
  const { theme } = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);
  const meta = useMemo(() => {
    if (hit.kind === "tx") {
      const tx = hit.data;
      return {
        icon: tx.type === "ingreso" ? ("arrow-down" as const) : ("arrow-up" as const),
        iconBg: tx.type === "ingreso" ? theme.color.brandTertiary : theme.color.errorSoft,
        iconColor: tx.type === "ingreso" ? theme.color.brandPrimary : theme.color.error,
        title: `${cap(tx.category)} · ${formatCurrency(tx.amount)}`,
        subtitle: `${tx.description || "—"} · ${formatDate(tx.date)}`,
        tag: "Transacción",
      };
    }
    if (hit.kind === "phone") {
      const p = hit.data;
      return {
        icon: "phone-portrait" as const,
        iconBg: theme.color.brandTertiary,
        iconColor: theme.color.brandPrimary,
        title: `${p.brand} ${p.model}`,
        subtitle: `${p.imei ? p.imei + " · " : ""}${p.status === "disponible" ? "Disponible" : "Vendido"} · ${formatCurrency(p.sell_price)}`,
        tag: "Inventario",
      };
    }
    const r = hit.data;
    return {
      icon: "construct" as const,
      iconBg: theme.color.warningSoft,
      iconColor: theme.color.warning,
      title: `${r.client_name} · ${r.device}`,
      subtitle: `${r.fault} · ${cap(r.status.replace("_", " "))} · ${formatCurrency(r.cost)}`,
      tag: "Reparación",
    };
  }, [hit, theme]);

  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      testID={`search-result-${hit.kind}-${hit.data.id}`}
    >
      <View style={[styles.rowIcon, { backgroundColor: meta.iconBg }]}>
        <Ionicons name={meta.icon} size={18} color={meta.iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{meta.title}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>{meta.subtitle}</Text>
      </View>
      <Text style={styles.tag}>{meta.tag}</Text>
    </Pressable>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const buildStyles = (theme: AppTheme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
  },
  title: { fontSize: 17, fontWeight: "700", color: theme.color.onSurface },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.color.surfaceTertiary,
    paddingHorizontal: 14, marginHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    height: 48, marginBottom: theme.spacing.md,
    borderWidth: 1, borderColor: theme.color.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: theme.color.onSurface },
  empty: { alignItems: "center", paddingVertical: 64 },
  emptyText: { fontSize: 15, color: theme.color.onSurface, fontWeight: "600", marginTop: 10 },
  emptySubtext: { fontSize: 13, color: theme.color.muted, marginTop: 4, textAlign: "center", paddingHorizontal: 32 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, paddingHorizontal: 12,
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md, marginBottom: theme.spacing.sm,
    borderWidth: 1, borderColor: theme.color.border,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: theme.color.onSurface },
  rowSubtitle: { fontSize: 12, color: theme.color.muted, marginTop: 2 },
  tag: {
    fontSize: 10, fontWeight: "700",
    color: theme.color.brandPrimary,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
});
