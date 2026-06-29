import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
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
