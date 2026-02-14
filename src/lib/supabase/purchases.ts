import {
  computeUnitCostCentsFromCost,
  computePurchaseTotalCents,
  currentDateInputValue,
  makeBlankPurchase,
  normalizePurchaseMarketplace,
  type PurchaseRecord,
} from "@/lib/purchases";

export type DbPurchaseRow = {
  id: string;
  user_id: string;
  purchase_date: string;
  material_id: string | null;
  material_name: string;
  description: string | null;
  variation: string | null;
  supplier: string;
  store: string | null;
  quantity: number | string;
  usable_quantity: number | string | null;
  unit: string;
  unit_cost_cents: number | string;
  total_cost_cents: number | string;
  cost_cents: number | string | null;
  currency: string;
  marketplace: string | null;
  reference_no: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type DbPurchaseInsert = Omit<DbPurchaseRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type DbPurchaseUpdate = Partial<
  Omit<DbPurchaseRow, "id" | "user_id" | "created_at" | "updated_at">
> & {
  updated_at?: string;
};

type PurchaseDefaults = {
  currency?: string;
  purchaseDate?: string;
  materialId?: string | null;
  materialName?: string;
  description?: string;
  variation?: string;
  usableQuantity?: number;
  costCents?: number;
  marketplace?: string;
  store?: string;
  supplier?: string;
  unit?: string;
};

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function rowToPurchase(row: DbPurchaseRow): PurchaseRecord {
  const quantity = Math.max(0, asNumber(row.quantity, 0));
  const usableQuantity = Math.max(0, asNumber(row.usable_quantity, quantity));
  const storedTotal = Math.max(0, Math.round(asNumber(row.total_cost_cents, 0)));
  const storedCost = Math.max(0, Math.round(asNumber(row.cost_cents, storedTotal)));
  const fallbackUnitCost = computeUnitCostCentsFromCost(quantity, storedCost);
  const unitCostCents = Math.max(0, Math.round(asNumber(row.unit_cost_cents, fallbackUnitCost)));
  const costCents = storedCost || storedTotal || computePurchaseTotalCents(quantity, unitCostCents);
  const store = row.store ?? row.supplier ?? "";
  const supplier = row.supplier ?? row.store ?? "";
  return {
    id: row.id,
    purchaseDate: row.purchase_date || currentDateInputValue(),
    materialId: row.material_id ?? null,
    materialName: row.material_name ?? "",
    description: row.description ?? "",
    variation: row.variation ?? "",
    quantity,
    usableQuantity,
    unit: row.unit ?? "ea",
    unitCostCents,
    costCents,
    totalCostCents: costCents,
    currency: row.currency ?? "USD",
    marketplace: normalizePurchaseMarketplace(row.marketplace, "other"),
    store,
    supplier,
    referenceNo: row.reference_no ?? "",
    notes: row.notes ?? "",
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function purchaseToRowUpdate(purchase: PurchaseRecord): DbPurchaseUpdate {
  const quantity = Math.max(0, purchase.quantity);
  const usableQuantity = Math.max(0, purchase.usableQuantity);
  const costCents = Math.max(0, Math.round(asNumber(purchase.costCents, purchase.totalCostCents)));
  const unitCostCents = quantity > 0
    ? computeUnitCostCentsFromCost(quantity, costCents)
    : Math.max(0, Math.round(asNumber(purchase.unitCostCents, 0)));
  const supplier = purchase.supplier || purchase.store;
  const store = purchase.store || purchase.supplier;
  return {
    purchase_date: purchase.purchaseDate || currentDateInputValue(),
    material_id: purchase.materialId,
    material_name: purchase.materialName,
    description: purchase.description,
    variation: purchase.variation,
    supplier,
    store,
    quantity,
    usable_quantity: usableQuantity,
    unit: purchase.unit,
    unit_cost_cents: unitCostCents,
    total_cost_cents: costCents,
    cost_cents: costCents,
    currency: purchase.currency.toUpperCase() || "USD",
    marketplace: normalizePurchaseMarketplace(purchase.marketplace, "other"),
    reference_no: purchase.referenceNo,
    notes: purchase.notes,
    updated_at: new Date().toISOString(),
  };
}

export function makeBlankPurchaseInsert(userId: string, defaults?: PurchaseDefaults): DbPurchaseInsert {
  const blank = makeBlankPurchase("tmp", {
    currency: defaults?.currency,
    purchaseDate: defaults?.purchaseDate,
    materialId: defaults?.materialId,
    materialName: defaults?.materialName,
    description: defaults?.description,
    variation: defaults?.variation,
    usableQuantity: defaults?.usableQuantity,
    costCents: defaults?.costCents,
    marketplace: defaults?.marketplace,
    store: defaults?.store,
    supplier: defaults?.supplier,
    unit: defaults?.unit,
  });
  return {
    user_id: userId,
    purchase_date: blank.purchaseDate,
    material_id: blank.materialId,
    material_name: blank.materialName,
    description: blank.description,
    variation: blank.variation,
    supplier: blank.supplier,
    store: blank.store,
    quantity: blank.quantity,
    usable_quantity: blank.usableQuantity,
    unit: blank.unit,
    unit_cost_cents: blank.unitCostCents,
    total_cost_cents: blank.totalCostCents,
    cost_cents: blank.costCents,
    currency: blank.currency,
    marketplace: blank.marketplace,
    reference_no: blank.referenceNo,
    notes: blank.notes,
  };
}
