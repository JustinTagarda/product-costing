import type { CostSheet, OverheadItem } from "@/lib/costing";
import { clampNumber, makeBlankSheet } from "@/lib/costing";

export type DbCostSheetRow = {
  id: string;
  user_id: string;
  name: string;
  sku: string;
  currency: string;
  unit_name: string;
  batch_size: number;
  waste_pct: number | string;
  markup_pct: number | string;
  tax_pct: number | string;
  materials: unknown;
  labor: unknown;
  overhead: unknown;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type DbCostSheetInsert = Omit<DbCostSheetRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type DbCostSheetUpdate = Partial<Omit<DbCostSheetRow, "id" | "user_id" | "created_at">>;

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeOverhead(items: unknown): OverheadItem[] {
  return asArray(items)
    .map((o) => {
      if (!o || typeof o !== "object") return null;
      const r = o as Record<string, unknown>;
      const id = asString(r.id);
      if (!id) return null;
      const name = asString(r.name);
      const kind = asString(r.kind);
      if (kind === "flat") {
        return {
          id,
          name,
          kind: "flat" as const,
          amountCents: Math.round(asNumber(r.amountCents, 0)),
        };
      }
      if (kind === "percent") {
        return {
          id,
          name,
          kind: "percent" as const,
          percent: asNumber(r.percent, 0),
        };
      }
      return null;
    })
    .filter(Boolean) as OverheadItem[];
}

export function rowToSheet(row: DbCostSheetRow): CostSheet {
  const createdAt = new Date(row.created_at).toISOString();
  const updatedAt = new Date(row.updated_at).toISOString();

  return {
    id: row.id,
    name: row.name ?? "Untitled",
    sku: row.sku ?? "",
    currency: row.currency ?? "USD",
    unitName: row.unit_name ?? "unit",
    batchSize: clampNumber(asNumber(row.batch_size, 1), 0, Number.MAX_SAFE_INTEGER),
    wastePct: clampNumber(asNumber(row.waste_pct, 0), 0, 1000),
    markupPct: clampNumber(asNumber(row.markup_pct, 40), 0, 10000),
    taxPct: clampNumber(asNumber(row.tax_pct, 0), 0, 1000),
    materials: (asArray(row.materials) as CostSheet["materials"]) || [],
    labor: (asArray(row.labor) as CostSheet["labor"]) || [],
    overhead: normalizeOverhead(row.overhead),
    notes: row.notes ?? "",
    createdAt,
    updatedAt,
  };
}

export function sheetToRowUpdate(sheet: CostSheet): DbCostSheetUpdate {
  return {
    name: sheet.name,
    sku: sheet.sku,
    currency: sheet.currency,
    unit_name: sheet.unitName,
    batch_size: sheet.batchSize,
    waste_pct: sheet.wastePct,
    markup_pct: sheet.markupPct,
    tax_pct: sheet.taxPct,
    materials: sheet.materials,
    labor: sheet.labor,
    overhead: sheet.overhead,
    notes: sheet.notes,
    updated_at: new Date().toISOString(),
  };
}

export function makeBlankSheetInsert(userId: string): DbCostSheetInsert {
  const blank = makeBlankSheet("temp");
  return {
    user_id: userId,
    name: blank.name,
    sku: blank.sku,
    currency: blank.currency,
    unit_name: blank.unitName,
    batch_size: blank.batchSize,
    waste_pct: blank.wastePct,
    markup_pct: blank.markupPct,
    tax_pct: blank.taxPct,
    materials: blank.materials,
    labor: blank.labor,
    overhead: blank.overhead,
    notes: blank.notes,
  };
}

