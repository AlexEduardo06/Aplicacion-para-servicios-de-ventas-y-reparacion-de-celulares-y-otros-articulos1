import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Platform, Linking } from "react-native";
import { api } from "./api";

export async function shareBackupJson() {
  const data = await api.backup();
  const json = JSON.stringify(data, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `tfs-backup-${date}.json`;

  if (Platform.OS === "web") {
    const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
    Linking.openURL(url);
    return data.counts;
  }

  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(path, {
      mimeType: "application/json",
      dialogTitle: `Compartir respaldo (${data.counts.transactions + data.counts.phones + data.counts.repairs} registros)`,
      UTI: "public.json",
    });
  }
  return data.counts;
}

export interface RestoreResult {
  inserted: { transactions: number; phones: number; repairs: number };
  mode: string;
}

export async function pickAndRestoreJson(mode: "replace" | "merge" = "replace"): Promise<RestoreResult | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets || res.assets.length === 0) return null;
  const file = res.assets[0];

  let text: string;
  if (Platform.OS === "web") {
    const resp = await fetch(file.uri);
    text = await resp.text();
  } else {
    text = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
  }

  let parsed: { transactions?: unknown; phones?: unknown; repairs?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("El archivo no es un JSON válido.");
  }

  const payload = {
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    phones: Array.isArray(parsed.phones) ? parsed.phones : [],
    repairs: Array.isArray(parsed.repairs) ? parsed.repairs : [],
    mode,
  };

  if (payload.transactions.length === 0 && payload.phones.length === 0 && payload.repairs.length === 0) {
    throw new Error("El archivo no contiene datos para restaurar.");
  }

  // Cast for the type checker; backend validates the schema.
  const result = await api.restore(payload as Parameters<typeof api.restore>[0]);
  return { mode: result.mode, inserted: result.inserted };
}
