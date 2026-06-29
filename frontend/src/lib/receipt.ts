import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform, Linking } from "react-native";
import { formatCurrency, formatDate, Transaction, Repair } from "./api";

const COMPANY = "THE FAMILY SOLUTIONS";
const TAGLINE = "Venta y reparación de celulares";

function baseHtml(title: string, bodyRows: string, total: number, footer?: string): string {
  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, system-ui, sans-serif; padding: 28px; color: #111827; }
  .brand { font-size: 13px; letter-spacing: 2px; color: #047857; font-weight: 800; }
  .tagline { font-size: 11px; color: #6B7280; margin-bottom: 18px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { font-size: 11px; color: #6B7280; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  td { padding: 8px 0; font-size: 13px; border-bottom: 1px dashed #E5E7EB; }
  .label { color: #6B7280; }
  .value { text-align: right; font-weight: 600; }
  .total-row td { border-top: 2px solid #111827; border-bottom: none; font-size: 16px; font-weight: 800; padding-top: 12px; }
  .total-amount { color: #047857; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E7EB; font-size: 11px; color: #6B7280; text-align: center; }
  .stamp { margin-top: 24px; text-align: center; font-size: 11px; color: #6B7280; }
</style>
</head>
<body>
  <div class="brand">${COMPANY}</div>
  <div class="tagline">${TAGLINE}</div>
  <h1>${title}</h1>
  <div class="meta">Fecha: ${new Date().toLocaleString("es-DO")}</div>
  <table>
    ${bodyRows}
    <tr class="total-row">
      <td>TOTAL</td>
      <td class="value total-amount">${formatCurrency(total)}</td>
    </tr>
  </table>
  ${footer ? `<div class="footer">${footer}</div>` : ""}
  <div class="stamp">Gracias por su preferencia.</div>
</body>
</html>`;
}

function row(label: string, value: string): string {
  return `<tr><td class="label">${label}</td><td class="value">${value}</td></tr>`;
}

async function generateAndShare(html: string, filename: string) {
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (Platform.OS === "web") {
    // On web, open the PDF in a new tab
    Linking.openURL(uri);
    return;
  }
  const can = await Sharing.isAvailableAsync();
  if (can) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: `Compartir ${filename}`,
      UTI: "com.adobe.pdf",
    });
  }
}

export async function shareTransactionReceipt(tx: Transaction) {
  const isSale = tx.type === "ingreso";
  const title = isSale ? "Recibo de Venta" : "Comprobante de Egreso";
  const body =
    row("Tipo", tx.type === "ingreso" ? "Ingreso" : "Egreso") +
    row("Categoría", tx.category) +
    row("Fecha", formatDate(tx.date)) +
    (tx.description ? row("Descripción", tx.description) : "") +
    row("ID", tx.id.slice(0, 8).toUpperCase());
  const html = baseHtml(title, body, tx.amount);
  await generateAndShare(html, `recibo-${tx.id.slice(0, 8)}.pdf`);
}

export async function shareRepairReceipt(r: Repair) {
  const body =
    row("Cliente", r.client_name) +
    (r.client_phone ? row("Teléfono", r.client_phone) : "") +
    row("Equipo", r.device) +
    row("Falla", r.fault) +
    row("Estado", r.status.replace("_", " ")) +
    row("Recibido", formatDate(r.created_at)) +
    (r.delivered_at ? row("Entregado", formatDate(r.delivered_at)) : "") +
    (r.notes ? row("Notas", r.notes) : "");
  const html = baseHtml(
    "Orden de Reparación",
    body,
    r.cost,
    "Conserve este comprobante para retirar su equipo."
  );
  await generateAndShare(html, `reparacion-${r.id.slice(0, 8)}.pdf`);
}
