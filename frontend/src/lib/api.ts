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

  // Phones
  listPhones: () => request<Phone[]>("/phones"),
  createPhone: (data: Partial<Phone>) =>
    request<Phone>("/phones", { method: "POST", body: JSON.stringify(data) }),
  updatePhone: (id: string, data: Partial<Phone>) =>
    request<Phone>(`/phones/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deletePhone: (id: string) =>
    request<{ ok: boolean }>(`/phones/${id}`, { method: "DELETE" }),
  sellPhone: (id: string, price?: number, description?: string) =>
    request<{ phone: Phone; transaction: Transaction }>(`/phones/${id}/sell`, {
      method: "POST",
      body: JSON.stringify({ price, description }),
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
