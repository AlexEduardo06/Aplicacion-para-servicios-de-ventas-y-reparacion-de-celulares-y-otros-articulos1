import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image as RNImage,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import * as ImagePicker from "expo-image-picker";
import { theme } from "@/src/lib/theme";
import { api, formatCurrency, Phone, PhoneCondition, PhoneStatus } from "@/src/lib/api";

const CONDITIONS: { key: PhoneCondition | "todos"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "nuevo", label: "Nuevo" },
  { key: "usado", label: "Usado" },
  { key: "reacondicionado", label: "Reacondicionado" },
];

export default function InventarioScreen() {
  const [phones, setPhones] = useState<Phone[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PhoneCondition | "todos">("todos");

  const sheetRef = useRef<BottomSheet>(null);
  const sellSheetRef = useRef<BottomSheet>(null);
  const [editing, setEditing] = useState<Phone | null>(null);
  const [selling, setSelling] = useState<Phone | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const [sellNote, setSellNote] = useState("");
  const [sellingBusy, setSellingBusy] = useState(false);
  const [form, setForm] = useState({
    brand: "",
    model: "",
    imei: "",
    color: "",
    condition: "nuevo" as PhoneCondition,
    buy_price: "",
    sell_price: "",
    stock: "1",
    photo: "",
    status: "disponible" as PhoneStatus,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.listPhones();
      setPhones(list);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return phones.filter((p) => {
      if (filter !== "todos" && p.condition !== filter) return false;
      if (!q) return true;
      return (
        p.brand.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q) ||
        (p.imei || "").toLowerCase().includes(q)
      );
    });
  }, [phones, search, filter]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      brand: "",
      model: "",
      imei: "",
      color: "",
      condition: "nuevo",
      buy_price: "",
      sell_price: "",
      stock: "1",
      photo: "",
      status: "disponible",
    });
    sheetRef.current?.expand();
  };

  const openEdit = (p: Phone) => {
    setEditing(p);
    setForm({
      brand: p.brand,
      model: p.model,
      imei: p.imei || "",
      color: p.color || "",
      condition: p.condition,
      buy_price: String(p.buy_price),
      sell_price: String(p.sell_price),
      stock: String(p.stock),
      photo: p.photo || "",
      status: p.status,
    });
    sheetRef.current?.expand();
  };

  const openSell = (p: Phone) => {
    setSelling(p);
    setSellPrice(String(p.sell_price || ""));
    setSellNote("");
    sellSheetRef.current?.expand();
  };

  const confirmSell = async () => {
    if (!selling) return;
    const price = parseFloat(sellPrice || "0");
    if (!price || price <= 0) return;
    setSellingBusy(true);
    try {
      await api.sellPhone(selling.id, price, sellNote.trim() || undefined);
      sellSheetRef.current?.close();
      setSelling(null);
      load();
    } catch (e) {
      console.warn(e);
    } finally {
      setSellingBusy(false);
    }
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.5,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!res.canceled && res.assets[0]?.base64) {
      setForm((f) => ({ ...f, photo: `data:image/jpeg;base64,${res.assets[0].base64}` }));
    }
  };

  const submit = async () => {
    if (!form.brand.trim() || !form.model.trim()) return;
    setSaving(true);
    try {
      const payload: Partial<Phone> = {
        brand: form.brand.trim(),
        model: form.model.trim(),
        imei: form.imei.trim(),
        color: form.color.trim(),
        condition: form.condition,
        buy_price: parseFloat(form.buy_price || "0") || 0,
        sell_price: parseFloat(form.sell_price || "0") || 0,
        stock: parseInt(form.stock || "1") || 1,
        photo: form.photo,
        status: form.status,
      };
      if (editing) {
        await api.updatePhone(editing.id, payload);
      } else {
        await api.createPhone(payload);
      }
      sheetRef.current?.close();
      load();
    } catch (e) {
      console.warn(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deletePhone(id);
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
            <Text style={styles.title}>Inventario</Text>
          </View>
          <Pressable onPress={openAdd} style={styles.addBtn} testID="btn-add-phone">
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={theme.color.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por marca, modelo, IMEI"
            placeholderTextColor={theme.color.muted}
            value={search}
            onChangeText={setSearch}
            testID="input-search-phone"
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {CONDITIONS.map((c) => {
            const active = c.key === filter;
            return (
              <Pressable
                key={c.key}
                onPress={() => setFilter(c.key)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`chip-filter-${c.key}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.color.brandPrimary} style={{ marginTop: 24 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty} testID="empty-inventory">
          <Ionicons name="phone-portrait-outline" size={48} color={theme.color.muted} />
          <Text style={styles.emptyText}>No hay equipos en inventario</Text>
          <Text style={styles.emptySubtext}>Toca + para agregar tu primer celular</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openEdit(item)}
              style={styles.card}
              testID={`phone-card-${item.id}`}
            >
              <View style={styles.phoneImage}>
                {item.photo ? (
                  <RNImage source={{ uri: item.photo }} style={{ width: "100%", height: "100%", borderRadius: 12 }} />
                ) : (
                  <Ionicons name="phone-portrait" size={32} color={theme.color.muted} />
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.brand} {item.model}</Text>
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  {item.color ? `${item.color} · ` : ""}{item.imei || "Sin IMEI"}
                </Text>
                <View style={styles.cardMetaRow}>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: item.status === "disponible" ? theme.color.brandTertiary : "#FEE2E2" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: item.status === "disponible" ? theme.color.brandPrimary : theme.color.error },
                      ]}
                    >
                      {item.status === "disponible" ? "Disponible" : "Vendido"}
                    </Text>
                  </View>
                  <Text style={styles.stockText}>Stock: {item.stock}</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.price}>{formatCurrency(item.sell_price)}</Text>
                {item.status === "disponible" && item.stock > 0 ? (
                  <Pressable
                    onPress={() => openSell(item)}
                    style={styles.sellBtn}
                    testID={`phone-sell-${item.id}`}
                  >
                    <Ionicons name="cash-outline" size={14} color="#fff" />
                    <Text style={styles.sellBtnText}>Vender</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => remove(item.id)} hitSlop={8} testID={`phone-delete-${item.id}`}>
                  <Ionicons name="trash-outline" size={16} color={theme.color.muted} style={{ marginTop: 8 }} />
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}

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
              <Text style={styles.sheetTitle}>{editing ? "Editar Equipo" : "Nuevo Equipo"}</Text>

              <Pressable onPress={pickImage} style={styles.photoPicker} testID="btn-pick-image">
                {form.photo ? (
                  <RNImage source={{ uri: form.photo }} style={{ width: "100%", height: "100%", borderRadius: 16 }} />
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={28} color={theme.color.muted} />
                    <Text style={styles.photoPickerText}>Agregar foto</Text>
                  </>
                )}
              </Pressable>

              <Row label="Marca">
                <TextInput style={styles.input} value={form.brand} onChangeText={(v) => setForm((f) => ({ ...f, brand: v }))} placeholder="Apple" placeholderTextColor={theme.color.muted} testID="input-brand" />
              </Row>
              <Row label="Modelo">
                <TextInput style={styles.input} value={form.model} onChangeText={(v) => setForm((f) => ({ ...f, model: v }))} placeholder="iPhone 13" placeholderTextColor={theme.color.muted} testID="input-model" />
              </Row>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Row label="IMEI">
                    <TextInput style={styles.input} value={form.imei} onChangeText={(v) => setForm((f) => ({ ...f, imei: v }))} placeholder="Opcional" placeholderTextColor={theme.color.muted} testID="input-imei" />
                  </Row>
                </View>
                <View style={{ flex: 1 }}>
                  <Row label="Color">
                    <TextInput style={styles.input} value={form.color} onChangeText={(v) => setForm((f) => ({ ...f, color: v }))} placeholder="Negro" placeholderTextColor={theme.color.muted} testID="input-color" />
                  </Row>
                </View>
              </View>

              <Text style={styles.label}>Condición</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {(["nuevo", "usado", "reacondicionado"] as PhoneCondition[]).map((c) => {
                  const active = c === form.condition;
                  return (
                    <Pressable key={c} onPress={() => setForm((f) => ({ ...f, condition: c }))} style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{c[0].toUpperCase() + c.slice(1)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Row label="Precio compra">
                    <TextInput style={styles.input} value={form.buy_price} onChangeText={(v) => setForm((f) => ({ ...f, buy_price: v }))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={theme.color.muted} testID="input-buy-price" />
                  </Row>
                </View>
                <View style={{ flex: 1 }}>
                  <Row label="Precio venta">
                    <TextInput style={styles.input} value={form.sell_price} onChangeText={(v) => setForm((f) => ({ ...f, sell_price: v }))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={theme.color.muted} testID="input-sell-price" />
                  </Row>
                </View>
                <View style={{ width: 80 }}>
                  <Row label="Stock">
                    <TextInput style={styles.input} value={form.stock} onChangeText={(v) => setForm((f) => ({ ...f, stock: v }))} keyboardType="number-pad" placeholder="1" placeholderTextColor={theme.color.muted} testID="input-stock" />
                  </Row>
                </View>
              </View>

              <Text style={styles.label}>Estado</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["disponible", "vendido"] as PhoneStatus[]).map((s) => {
                  const active = s === form.status;
                  return (
                    <Pressable key={s} onPress={() => setForm((f) => ({ ...f, status: s }))} style={[styles.chip, active && styles.chipActive, { flex: 1 }]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{s === "disponible" ? "Disponible" : "Vendido"}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable onPress={submit} disabled={saving} style={[styles.submitBtn, saving && { opacity: 0.6 }]} testID="btn-submit-phone">
                <Text style={styles.submitBtnText}>{saving ? "Guardando..." : editing ? "Actualizar" : "Guardar"}</Text>
              </Pressable>
            </BottomSheetScrollView>
          </KeyboardAvoidingView>
        </BottomSheetView>
      </BottomSheet>

      {/* Sell Phone Sheet */}
      <BottomSheet
        ref={sellSheetRef}
        index={-1}
        enablePanDownToClose
        snapPoints={["55%"]}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
        backgroundStyle={{ backgroundColor: theme.color.surfaceSecondary }}
      >
        <BottomSheetView style={styles.sheetContent}>
          {selling && (
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
              <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                <Text style={styles.sheetTitle}>Vender Equipo</Text>
                <View style={styles.sellSummary}>
                  <View style={[styles.phoneImage, { width: 56, height: 56 }]}>
                    {selling.photo ? (
                      <RNImage source={{ uri: selling.photo }} style={{ width: "100%", height: "100%", borderRadius: 12 }} />
                    ) : (
                      <Ionicons name="phone-portrait" size={24} color={theme.color.muted} />
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.cardTitle}>{selling.brand} {selling.model}</Text>
                    <Text style={styles.cardSubtitle}>Stock actual: {selling.stock}</Text>
                  </View>
                </View>

                <Text style={styles.label}>Precio de venta (RD$)</Text>
                <TextInput
                  style={styles.input}
                  value={sellPrice}
                  onChangeText={setSellPrice}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={theme.color.muted}
                  testID="input-sell-amount"
                />

                <Text style={styles.label}>Nota (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={sellNote}
                  onChangeText={setSellNote}
                  placeholder="Cliente, método de pago, etc."
                  placeholderTextColor={theme.color.muted}
                  testID="input-sell-note"
                />

                <View style={styles.sellInfoBox}>
                  <Ionicons name="information-circle" size={18} color={theme.color.brandPrimary} />
                  <Text style={styles.sellInfoText}>
                    Se descontará 1 del stock y se creará un ingreso automático en la caja.
                  </Text>
                </View>

                <Pressable
                  onPress={confirmSell}
                  disabled={sellingBusy}
                  style={[styles.submitBtn, sellingBusy && { opacity: 0.6 }]}
                  testID="btn-confirm-sell"
                >
                  <Text style={styles.submitBtnText}>
                    {sellingBusy ? "Procesando..." : "Confirmar Venta"}
                  </Text>
                </Pressable>
              </BottomSheetScrollView>
            </KeyboardAvoidingView>
          )}
        </BottomSheetView>
      </BottomSheet>
    </SafeAreaView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, backgroundColor: theme.color.surface },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 28, fontWeight: "700", color: theme.color.onSurface },
  brand: { fontSize: 12, fontWeight: "800", color: theme.color.brandPrimary, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.color.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.color.surfaceTertiary,
    paddingHorizontal: 12, borderRadius: theme.radius.md,
    marginTop: theme.spacing.md, height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, color: theme.color.onSurface },
  chipRow: { gap: 8, paddingVertical: theme.spacing.md, paddingRight: theme.spacing.lg },
  chip: {
    paddingHorizontal: 14, height: 36, borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceSecondary,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  chipActive: { backgroundColor: theme.color.brandPrimary, borderColor: theme.color.brandPrimary },
  chipText: { fontSize: 13, fontWeight: "600", color: theme.color.onSurface },
  chipTextActive: { color: "#fff" },
  empty: { alignItems: "center", paddingVertical: 64 },
  emptyText: { fontSize: 15, color: theme.color.onSurface, fontWeight: "600", marginTop: 10 },
  emptySubtext: { fontSize: 13, color: theme.color.muted, marginTop: 4 },
  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: theme.color.surfaceSecondary,
    padding: theme.spacing.md, borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1, borderColor: theme.color.border,
  },
  phoneImage: {
    width: 64, height: 64, borderRadius: 12,
    backgroundColor: theme.color.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: theme.color.onSurface },
  cardSubtitle: { fontSize: 12, color: theme.color.muted, marginTop: 2 },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.pill },
  badgeText: { fontSize: 11, fontWeight: "700" },
  stockText: { fontSize: 12, color: theme.color.muted, fontWeight: "500" },
  price: { fontSize: 15, fontWeight: "800", color: theme.color.brandPrimary },
  sellBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: theme.color.brandPrimary,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: theme.radius.pill, marginTop: 6,
  },
  sellBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  sellSummary: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: theme.color.brandTertiary,
    padding: theme.spacing.md, borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
  },
  sellInfoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: theme.color.brandTertiary,
    padding: theme.spacing.md, borderRadius: theme.radius.md,
    marginTop: theme.spacing.lg,
  },
  sellInfoText: { flex: 1, fontSize: 12, color: theme.color.onBrandTertiary, lineHeight: 17 },
  sheetContent: { flex: 1, paddingHorizontal: theme.spacing.lg },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: theme.color.onSurface, marginBottom: theme.spacing.md, marginTop: 4 },
  photoPicker: {
    height: 140, borderRadius: 16,
    backgroundColor: theme.color.surfaceTertiary,
    borderWidth: 1, borderColor: theme.color.border, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  photoPickerText: { fontSize: 13, color: theme.color.muted, marginTop: 6 },
  label: { fontSize: 13, fontWeight: "600", color: theme.color.onSurfaceTertiary, marginTop: theme.spacing.md, marginBottom: 6 },
  input: {
    backgroundColor: theme.color.surfaceTertiary,
    borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: theme.color.onSurface,
    borderWidth: 1, borderColor: theme.color.border,
  },
  submitBtn: {
    backgroundColor: theme.color.brandPrimary,
    paddingVertical: 16, borderRadius: theme.radius.md,
    alignItems: "center", marginTop: theme.spacing.xl,
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
