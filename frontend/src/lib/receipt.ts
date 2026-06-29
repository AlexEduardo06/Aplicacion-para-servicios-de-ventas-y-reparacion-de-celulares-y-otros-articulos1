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

interface FullReportInput {
  rangeLabel: string;
  totals: { ingresos: number; egresos: number; balance: number };
  ingresosCat: { category: string; amount: number; percent: number }[];
  egresosCat: { category: string; amount: number; percent: number }[];
  topPhones: { label: string; count: number; total: number }[];
  topClients: { client_name: string; count: number; total: number }[];
  inventory: { phones: number; available: number; sold: number };
  repairs: { total: number; active: number; delivered: number };
}

function catLabel(c: string) {
  const m: Record<string, string> = {
    venta: "Ventas",
    reparacion: "Reparaciones",
    compra: "Compras",
    gasto: "Gastos",
    otro: "Otros",
  };
  return m[c] || c;
}

export async function shareFullReport(data: FullReportInput) {
  const totalRows =
    row("Ingresos", `<span style="color:#047857">${formatCurrency(data.totals.ingresos)}</span>`) +
    row("Egresos", `<span style="color:#DC2626">${formatCurrency(data.totals.egresos)}</span>`) +
    row("<b>Balance</b>", `<b style="color:${data.totals.balance >= 0 ? "#047857" : "#DC2626"}">${formatCurrency(data.totals.balance)}</b>`);

  const renderCat = (rows: { category: string; amount: number; percent: number }[], color: string) =>
    rows.length
      ? rows
          .map(
            (r) => `
        <tr>
          <td class="label">${catLabel(r.category)} <span style="color:#9CA3AF;font-weight:500">(${r.percent.toFixed(1)}%)</span></td>
          <td class="value" style="color:${color}">${formatCurrency(r.amount)}</td>
        </tr>`
          )
          .join("")
      : `<tr><td class="label" colspan="2" style="text-align:center;color:#9CA3AF">Sin datos</td></tr>`;

  const renderRank = (rows: { title: string; subtitle: string; amount: number }[]) =>
    rows.length
      ? rows
          .map(
            (r, i) => `
        <tr>
          <td class="label" style="width:24px"><b>${i + 1}</b></td>
          <td class="label"><b style="color:#111827">${r.title}</b><br/><span style="color:#9CA3AF;font-size:11px">${r.subtitle}</span></td>
          <td class="value" style="color:#047857">${formatCurrency(r.amount)}</td>
        </tr>`
          )
          .join("")
      : `<tr><td class="label" colspan="3" style="text-align:center;color:#9CA3AF">Sin datos</td></tr>`;

  const html = `
<!doctype html>
<html><head><meta charset="utf-8" /><style>
  body { font-family: -apple-system, system-ui, sans-serif; padding: 28px; color: #111827; }
  .brand { font-size: 13px; letter-spacing: 2px; color: #047857; font-weight: 800; }
  .tagline { font-size: 11px; color: #6B7280; margin-bottom: 14px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { font-size: 11px; color: #6B7280; margin-bottom: 24px; }
  h2 { font-size: 12px; letter-spacing: 1.2px; color: #6B7280; text-transform: uppercase; margin-top: 22px; margin-bottom: 6px; border-bottom: 2px solid #047857; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 0; font-size: 13px; border-bottom: 1px dashed #E5E7EB; }
  .label { color: #374151; }
  .value { text-align: right; font-weight: 700; }
  .footer { margin-top: 32px; padding-top: 14px; border-top: 1px solid #E5E7EB; font-size: 11px; color: #6B7280; text-align: center; }
</style></head><body>
  <div class="brand">THE FAMILY SOLUTIONS</div>
  <div class="tagline">Venta y reparación de celulares</div>
  <h1>Reporte de Operaciones</h1>
  <div class="meta">Rango: ${data.rangeLabel} · Generado: ${new Date().toLocaleString("es-DO")}</div>

  <h2>Resumen</h2>
  <table>${totalRows}</table>

  <h2>Ingresos por categoría</h2>
  <table>${renderCat(data.ingresosCat, "#047857")}</table>

  <h2>Egresos por categoría</h2>
  <table>${renderCat(data.egresosCat, "#DC2626")}</table>

  <h2>Top celulares vendidos</h2>
  <table>${renderRank(data.topPhones.map((p) => ({ title: p.label, subtitle: `${p.count} unidad${p.count > 1 ? "es" : ""}`, amount: p.total })))}</table>

  <h2>Top clientes (reparaciones)</h2>
  <table>${renderRank(data.topClients.map((c) => ({ title: c.client_name, subtitle: `${c.count} reparación${c.count > 1 ? "es" : ""}`, amount: c.total })))}</table>

  <h2>Inventario actual</h2>
  <table>
    <tr><td class="label">Total equipos</td><td class="value">${data.inventory.phones}</td></tr>
    <tr><td class="label">Disponibles</td><td class="value" style="color:#047857">${data.inventory.available}</td></tr>
    <tr><td class="label">Vendidos</td><td class="value">${data.inventory.sold}</td></tr>
  </table>

  <h2>Reparaciones</h2>
  <table>
    <tr><td class="label">Total</td><td class="value">${data.repairs.total}</td></tr>
    <tr><td class="label">Activas</td><td class="value" style="color:#D97706">${data.repairs.active}</td></tr>
    <tr><td class="label">Entregadas</td><td class="value" style="color:#16A34A">${data.repairs.delivered}</td></tr>
  </table>

  <div class="footer">THE FAMILY SOLUTIONS · Reporte generado automáticamente</div>
</body></html>`;
  await generateAndShare(html, `reporte-${Date.now()}.pdf`);
}
