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
