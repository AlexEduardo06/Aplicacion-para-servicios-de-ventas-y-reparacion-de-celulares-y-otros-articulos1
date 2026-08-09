const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const API = `${BASE}/api`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status}: ${t}`);
  }
  return res.json();
}

export type TxType = "ingreso" | "egreso";
export type PhoneCondition = "nuevo" | "usado" | "reacondicionado";
export type PhoneStatus = "disponible" | "vendido";
export type RepairStatus = "recibido" | "en_progreso" | "listo" | "entregado";

export interface RepairPhoto {
  type: "antes" | "despues";
  data: string; // base64 data URI
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  category: string;
  description: string;
  related_phone_id?: string | null;
  related_repair_id?: string | null;
  date: string;
}

export interface Phone {
  id: string;
  brand: string;
  model: string;
  imei?: string;
  color?: string;
  condition: PhoneCondition;
  buy_price: number;
  sell_price: number;
  stock: number;
  photo?: string;
  status: PhoneStatus;
  notes?: string;
  created_at: string;
}

export interface Repair {
  id: string;
  client_name: string;
  client_phone?: string;
  device: string;
  fault: string;
  cost: number;
  status: RepairStatus;
  notes?: string;
  photos?: RepairPhoto[];
  created_at: string;
  listo_at?: string | null;
  delivered_at?: string | null;
  due_date?: string | null;
}

export type DebtStatus = "pendiente" | "pagado_parcial" | "pagado";
export type DebtSource = "venta" | "reparacion" | "otro";

export interface DebtPayment {
  amount: number;
  date: string;
  method: string;
  transaction_id?: string;
}

export interface Debt {
  id: string;
  client_name: string;
  client_phone?: string;
  concept: string;
  source: DebtSource;
  original_amount: number;
  paid_amount: number;
  balance: number;
  status: DebtStatus;
  payments: DebtPayment[];
  due_date?: string | null;
  notes?: string;
  related_phone_id?: string | null;
  related_repair_id?: string | null;
  created_at: string;
}

export interface DailySummary {
  ingresos: number;
  egresos: number;
  balance: number;
  count: number;
}

export const api = {
  // Transactions
  listTransactions: () => request<Transaction[]>("/transactions"),
  createTransaction: (data: Partial<Transaction>) =>
    request<Transaction>("/transactions", { method: "POST", body: JSON.stringify(data) }),
  deleteTransaction: (id: string) =>
    request<{ ok: boolean }>(`/transactions/${id}`, { method: "DELETE" }),
  summaryToday: () => request<DailySummary>("/summary/today"),
  summaryRange: (days: number, start?: string, end?: string) => {
    const q = start && end ? `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` : `days=${days}`;
    return request<{ days: number; start: string; end: string; ingresos: number; egresos: number; balance: number }>(
      `/summary/range?${q}`
    );
  },
  summaryByCategory: (days: number, start?: string, end?: string) => {
    const q = start && end ? `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` : `days=${days}`;
    return request<{
      days: number;
      start: string;
      end: string;
      ingresos: { category: string; amount: number; percent: number }[];
      egresos: { category: string; amount: number; percent: number }[];
      total_ingresos: number;
      total_egresos: number;
    }>(`/summary/by-category?${q}`);
  },
  topClients: (days: number, start?: string, end?: string) => {
    const q = start && end ? `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` : `days=${days}`;
    return request<{ client_name: string; count: number; total: number }[]>(`/stats/top-clients?${q}`);
  },
  topPhones: (days: number, start?: string, end?: string) => {
    const q = start && end ? `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` : `days=${days}`;
    return request<{ label: string; brand: string; model: string; count: number; total: number }[]>(`/stats/top-phones?${q}`);
  },
  backup: () => request<{
    exported_at: string;
    app: string;
    version: number;
    counts: { transactions: number; phones: number; repairs: number };
    transactions: Transaction[];
    phones: Phone[];
    repairs: Repair[];
  }>("/backup"),
  restore: (data: { transactions?: Transaction[]; phones?: Phone[]; repairs?: Repair[]; mode?: "replace" | "merge" }) =>
    request<{ ok: boolean; mode: string; inserted: { transactions: number; phones: number; repairs: number } }>(
      "/restore",
      { method: "POST", body: JSON.stringify(data) }
    ),
  search: (q: string) =>
    request<{ transactions: Transaction[]; phones: Phone[]; repairs: Repair[] }>(
      `/search?q=${encodeURIComponent(q)}`
    ),

  // Debts
  listDebts: () => request<Debt[]>("/debts"),
  createDebt: (data: Partial<Debt>) =>
    request<Debt>("/debts", { method: "POST", body: JSON.stringify(data) }),
  updateDebt: (id: string, data: Partial<Debt>) =>
    request<Debt>(`/debts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDebt: (id: string) =>
    request<{ ok: boolean }>(`/debts/${id}`, { method: "DELETE" }),
  payDebt: (id: string, amount: number, method: string = "efectivo") =>
    request<Debt>(`/debts/${id}/pay`, {
      method: "POST",
      body: JSON.stringify({ amount, method }),
    }),
  debtsSummary: () =>
    request<{ total_pending: number; total_paid: number; total_original: number; count_pending: number; count_paid: number }>(
      "/debts/summary/totals"
    ),

  // Phones
  listPhones: () => request<Phone[]>("/phones"),
  createPhone: (data: Partial<Phone>) =>
    request<Phone>("/phones", { method: "POST", body: JSON.stringify(data) }),
  updatePhone: (id: string, data: Partial<Phone>) =>
    request<Phone>(`/phones/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deletePhone: (id: string) =>
    request<{ ok: boolean }>(`/phones/${id}`, { method: "DELETE" }),
  sellPhone: (
    id: string,
    args: { price?: number; paid?: number; method?: string; client_name?: string; client_phone?: string; description?: string }
  ) =>
    request<{
      phone: Phone;
      transaction: Transaction | null;
      debt: Debt | null;
      pending: number;
      paid: number;
      price: number;
    }>(`/phones/${id}/sell`, {
      method: "POST",
      body: JSON.stringify(args),
    }),
  deliverRepair: (id: string, paid: number, method: string = "efectivo") =>
    request<{
      repair: Repair;
      transaction: Transaction | null;
      debt: Debt | null;
      pending: number;
      paid: number;
      cost: number;
    }>(`/repairs/${id}/deliver`, {
      method: "POST",
      body: JSON.stringify({ paid, method }),
    }),

  // Repairs
  listRepairs: () => request<Repair[]>("/repairs"),
  createRepair: (data: Partial<Repair>) =>
    request<Repair>("/repairs", { method: "POST", body: JSON.stringify(data) }),
  updateRepair: (id: string, data: Partial<Repair>) =>
    request<Repair>(`/repairs/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRepair: (id: string) =>
    request<{ ok: boolean }>(`/repairs/${id}`, { method: "DELETE" }),
};

export function formatCurrency(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `RD$ ${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-DO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86400000);
}

export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

export function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  d.setUTCHours(23, 59, 59, 999);
  return d.getTime() < Date.now();
}

export function daysUntil(iso: string | null | undefined): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  d.setUTCHours(23, 59, 59, 999);
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}
