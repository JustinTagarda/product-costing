export type PurchaseRecord = {
  id: string;
  purchaseDate: string;
  materialId: string | null;
  materialName: string;
  supplier: string;
  quantity: number;
  unit: string;
  unitCostCents: number;
  totalCostCents: number;
  currency: string;
  referenceNo: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

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

type BlankPurchaseDefaults = {
  currency?: string;
  purchaseDate?: string;
  materialId?: string | null;
  materialName?: string;
  supplier?: string;
  unit?: string;
};

export function makeBlankPurchase(id: string, defaults?: BlankPurchaseDefaults): PurchaseRecord {
  const now = new Date().toISOString();
  const purchaseDate = defaults?.purchaseDate || currentDateInputValue();
  const currency = defaults?.currency ? defaults.currency.toUpperCase() : "USD";
  const quantity = 1;
  const unitCostCents = 0;
  return {
    id,
    purchaseDate,
    materialId: defaults?.materialId ?? null,
    materialName: defaults?.materialName ?? "",
    supplier: defaults?.supplier ?? "",
    quantity,
    unit: defaults?.unit ?? "ea",
    unitCostCents,
    totalCostCents: computePurchaseTotalCents(quantity, unitCostCents),
    currency,
    referenceNo: "",
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDemoPurchases(
  seed?: Array<{ id: string; name: string; supplier?: string; unit?: string }>,
): PurchaseRecord[] {
  const t = "2026-02-10T00:00:00.000Z";
  const base = seed?.[0];
  return [
    {
      id: "purchase_demo_1",
      purchaseDate: "2026-02-10",
      materialId: base?.id ?? null,
      materialName: base?.name ?? "Canvas fabric",
      supplier: base?.supplier ?? "Metro Textile",
      quantity: 10,
      unit: base?.unit ?? "yd",
      unitCostCents: 600,
      totalCostCents: computePurchaseTotalCents(10, 600),
      currency: "USD",
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
