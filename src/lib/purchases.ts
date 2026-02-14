export type PurchaseRecord = {
  id: string;
  purchaseDate: string;
  materialId: string | null;
  materialName: string;
  description: string;
  variation: string;
  quantity: number;
  usableQuantity: number;
  unit: string;
  unitCostCents: number;
  costCents: number;
  totalCostCents: number;
  currency: string;
  marketplace: PurchaseMarketplace;
  store: string;
  supplier: string;
  referenceNo: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export const PURCHASE_MARKETPLACES = ["shopee", "lazada", "local", "other"] as const;
export type PurchaseMarketplace = (typeof PURCHASE_MARKETPLACES)[number];

export const LOCAL_PURCHASES_STORAGE_KEY = "product-costing:purchases:local:v1";
export const LOCAL_MATERIALS_STORAGE_KEY = "product-costing:materials:local:v1";

export function currentDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export function computePurchaseTotalCents(quantity: number, unitCostCents: number): number {
  const qty = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  const unitCost = Number.isFinite(unitCostCents) ? Math.max(0, unitCostCents) : 0;
  return Math.max(0, Math.round(qty * unitCost));
}

export function computeUnitCostCentsFromCost(quantity: number, costCents: number): number {
  const qty = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  const cost = Number.isFinite(costCents) ? Math.max(0, costCents) : 0;
  if (qty <= 0) return 0;
  return Math.max(0, Math.round(cost / qty));
}

export function normalizePurchaseMarketplace(
  value: string | null | undefined,
  fallback: PurchaseMarketplace = "other",
): PurchaseMarketplace {
  const normalized = (value || "").toLowerCase().trim();
  return PURCHASE_MARKETPLACES.includes(normalized as PurchaseMarketplace)
    ? (normalized as PurchaseMarketplace)
    : fallback;
}

type BlankPurchaseDefaults = {
  currency?: string;
  purchaseDate?: string;
  materialId?: string | null;
  materialName?: string;
  description?: string;
  variation?: string;
  usableQuantity?: number;
  costCents?: number;
  marketplace?: PurchaseMarketplace | string;
  store?: string;
  supplier?: string;
  unit?: string;
};

export function makeBlankPurchase(id: string, defaults?: BlankPurchaseDefaults): PurchaseRecord {
  const now = new Date().toISOString();
  const purchaseDate = defaults?.purchaseDate || currentDateInputValue();
  const currency = defaults?.currency ? defaults.currency.toUpperCase() : "USD";
  const quantity = 1;
  const usableQuantityRaw = Number(defaults?.usableQuantity);
  const usableQuantity = Number.isFinite(usableQuantityRaw)
    ? Math.max(0, usableQuantityRaw)
    : quantity;
  const costRaw = Number(defaults?.costCents);
  const costCents = Number.isFinite(costRaw) ? Math.max(0, Math.round(costRaw)) : 0;
  const unitCostCents = computeUnitCostCentsFromCost(quantity, costCents);
  const store = defaults?.store ?? defaults?.supplier ?? "";
  const supplier = defaults?.supplier ?? defaults?.store ?? "";
  return {
    id,
    purchaseDate,
    materialId: defaults?.materialId ?? null,
    materialName: defaults?.materialName ?? "",
    description: defaults?.description ?? "",
    variation: defaults?.variation ?? "",
    quantity,
    usableQuantity,
    unit: defaults?.unit ?? "ea",
    unitCostCents,
    costCents,
    totalCostCents: costCents,
    currency,
    marketplace: normalizePurchaseMarketplace(defaults?.marketplace, "local"),
    store,
    supplier,
    referenceNo: "",
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDemoPurchases(
  seed?: Array<{ id: string; name: string; supplier?: string; unit?: string }>,
  options?: { currency?: string },
): PurchaseRecord[] {
  const t = "2026-02-10T00:00:00.000Z";
  const base = seed?.[0];
  const currency = options?.currency ? options.currency.toUpperCase() : "USD";
  return [
    {
      id: "purchase_demo_1",
      purchaseDate: "2026-02-10",
      materialId: base?.id ?? null,
      materialName: base?.name ?? "Canvas fabric",
      description: "12oz cotton canvas",
      variation: "Natural",
      quantity: 10,
      usableQuantity: 9.5,
      unit: base?.unit ?? "yd",
      unitCostCents: 600,
      costCents: computePurchaseTotalCents(10, 600),
      totalCostCents: computePurchaseTotalCents(10, 600),
      currency,
      marketplace: "local",
      store: base?.supplier ?? "Metro Textile",
      supplier: base?.supplier ?? "Metro Textile",
      referenceNo: "PO-1001",
      notes: "Initial stock order",
      createdAt: t,
      updatedAt: t,
    },
  ];
}

export function sortPurchasesByDateDesc(items: PurchaseRecord[]): PurchaseRecord[] {
  return [...items].sort((a, b) => {
    const da = Date.parse(`${a.purchaseDate}T00:00:00.000Z`);
    const db = Date.parse(`${b.purchaseDate}T00:00:00.000Z`);
    if (db !== da) return db - da;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}
