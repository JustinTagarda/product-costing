import {
  computePurchaseTotalCents,
  currentDateInputValue,
  makeBlankPurchase,
  type PurchaseRecord,
} from "@/lib/purchases";

export type DbPurchaseRow = {
  id: string;
  user_id: string;
  purchase_date: string;
  material_id: string | null;
  material_name: string;
  supplier: string;
  quantity: number | string;
  unit: string;
  unit_cost_cents: number | string;
  total_cost_cents: number | string;
  currency: string;
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
  supplier?: string;
  unit?: string;
};

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function rowToPurchase(row: DbPurchaseRow): PurchaseRecord {
  const quantity = Math.max(0, asNumber(row.quantity, 0));
  const unitCostCents = Math.max(0, Math.round(asNumber(row.unit_cost_cents, 0)));
  const storedTotal = Math.max(0, Math.round(asNumber(row.total_cost_cents, 0)));
  return {
    id: row.id,
    purchaseDate: row.purchase_date || currentDateInputValue(),
    materialId: row.material_id ?? null,
    materialName: row.material_name ?? "",
    supplier: row.supplier ?? "",
    quantity,
    unit: row.unit ?? "ea",
    unitCostCents,
    totalCostCents: storedTotal || computePurchaseTotalCents(quantity, unitCostCents),
    currency: row.currency ?? "USD",
    referenceNo: row.reference_no ?? "",
    notes: row.notes ?? "",
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function purchaseToRowUpdate(purchase: PurchaseRecord): DbPurchaseUpdate {
  const total = computePurchaseTotalCents(purchase.quantity, purchase.unitCostCents);
  return {
    purchase_date: purchase.purchaseDate || currentDateInputValue(),
    material_id: purchase.materialId,
    material_name: purchase.materialName,
    supplier: purchase.supplier,
    quantity: purchase.quantity,
    unit: purchase.unit,
    unit_cost_cents: purchase.unitCostCents,
    total_cost_cents: total,
    currency: purchase.currency.toUpperCase() || "USD",
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
    supplier: defaults?.supplier,
    unit: defaults?.unit,
  });
  return {
    user_id: userId,
    purchase_date: blank.purchaseDate,
    material_id: blank.materialId,
    material_name: blank.materialName,
    supplier: blank.supplier,
    quantity: blank.quantity,
    unit: blank.unit,
    unit_cost_cents: blank.unitCostCents,
    total_cost_cents: blank.totalCostCents,
    currency: blank.currency,
    reference_no: blank.referenceNo,
    notes: blank.notes,
  };
}
