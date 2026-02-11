import type { MaterialRecord } from "@/lib/materials";
import { makeBlankMaterial } from "@/lib/materials";

export type DbMaterialRow = {
  id: string;
  user_id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  unit_cost_cents: number | string;
  supplier: string;
  last_purchase_cost_cents: number | string;
  last_purchase_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DbMaterialInsert = Omit<DbMaterialRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type DbMaterialUpdate = Partial<
  Omit<DbMaterialRow, "id" | "user_id" | "created_at" | "updated_at">
> & {
  updated_at?: string;
};

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function rowToMaterial(row: DbMaterialRow): MaterialRecord {
  return {
    id: row.id,
    name: row.name ?? "",
    code: row.code ?? "",
    category: row.category ?? "",
    unit: row.unit ?? "ea",
    unitCostCents: Math.max(0, Math.round(asNumber(row.unit_cost_cents, 0))),
    supplier: row.supplier ?? "",
    lastPurchaseCostCents: Math.max(0, Math.round(asNumber(row.last_purchase_cost_cents, 0))),
    lastPurchaseDate: row.last_purchase_date ?? "",
    isActive: Boolean(row.is_active),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function materialToRowUpdate(material: MaterialRecord): DbMaterialUpdate {
  return {
    name: material.name,
    code: material.code,
    category: material.category,
    unit: material.unit,
    unit_cost_cents: material.unitCostCents,
    supplier: material.supplier,
    last_purchase_cost_cents: material.lastPurchaseCostCents,
    last_purchase_date: material.lastPurchaseDate || null,
    is_active: material.isActive,
    updated_at: new Date().toISOString(),
  };
}

export function makeBlankMaterialInsert(userId: string): DbMaterialInsert {
  const blank = makeBlankMaterial("tmp");
  return {
    user_id: userId,
    name: blank.name,
    code: blank.code,
    category: blank.category,
    unit: blank.unit,
    unit_cost_cents: blank.unitCostCents,
    supplier: blank.supplier,
    last_purchase_cost_cents: blank.lastPurchaseCostCents,
    last_purchase_date: blank.lastPurchaseDate || null,
    is_active: blank.isActive,
  };
}
