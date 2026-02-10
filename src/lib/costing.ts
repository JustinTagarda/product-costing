export type MaterialItem = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  unitCostCents: number;
};

export type LaborItem = {
  id: string;
  role: string;
  hours: number;
  rateCents: number;
};

export type OverheadItem =
  | {
      id: string;
      name: string;
      kind: "flat";
      amountCents: number;
    }
  | {
      id: string;
      name: string;
      kind: "percent";
      percent: number;
    };

export type CostSheet = {
  id: string;
  name: string;
  sku: string;
  currency: string;

  unitName: string;
  batchSize: number;

  wastePct: number;
  markupPct: number;
  taxPct: number;

  materials: MaterialItem[];
  labor: LaborItem[];
  overhead: OverheadItem[];
  notes: string;

  createdAt: string;
  updatedAt: string;
};

export type StoredDataV1 = {
  version: 1;
  sheets: CostSheet[];
  selectedId?: string;
};

export type StoredData = StoredDataV1;

export function clampNumber(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function roundCents(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.round(cents);
}

export function makeId(prefix: string): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  const uuid = g.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function makeBlankSheet(id: string): CostSheet {
  const now = new Date().toISOString();
  return {
    id,
    name: "Untitled",
    sku: "",
    currency: "USD",
    unitName: "unit",
    batchSize: 1,
    wastePct: 0,
    markupPct: 40,
    taxPct: 0,
    materials: [
      { id: makeId("m"), name: "", qty: 1, unit: "", unitCostCents: 0 },
    ],
    labor: [{ id: makeId("l"), role: "", hours: 0, rateCents: 0 }],
    overhead: [],
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDemoSheet(): CostSheet {
  // Keep this deterministic to avoid SSR/client hydration mismatches.
  const t = "2026-02-09T00:00:00.000Z";
  return {
    id: "demo",
    name: "Demo: Canvas Tote Bag",
    sku: "TOTE-001",
    currency: "USD",
    unitName: "bag",
    batchSize: 10,
    wastePct: 6,
    markupPct: 55,
    taxPct: 0,
    materials: [
      {
        id: "m_canvas",
        name: "Canvas fabric",
        qty: 6.2,
        unit: "yd",
        unitCostCents: 625,
      },
      {
        id: "m_thread",
        name: "Thread",
        qty: 1,
        unit: "spool",
        unitCostCents: 399,
      },
      {
        id: "m_label",
        name: "Woven label",
        qty: 10,
        unit: "ea",
        unitCostCents: 28,
      },
    ],
    labor: [
      { id: "l_cut", role: "Cut + sew", hours: 2.5, rateCents: 2200 },
    ],
    overhead: [
      { id: "o_shop", name: "Shop overhead", kind: "percent", percent: 12 },
      { id: "o_pack", name: "Packaging", kind: "flat", amountCents: 600 },
    ],
    notes:
      "This demo is stored in your browser. Create a new sheet to start costing your own products.",
    createdAt: t,
    updatedAt: t,
  };
}

export type SheetTotals = {
  materialsSubtotalCents: number;
  materialsWithWasteCents: number;
  laborSubtotalCents: number;
  overheadFlatCents: number;
  overheadPercentCents: number;
  overheadTotalCents: number;
  batchTotalCents: number;
  costPerUnitCents: number | null;
  pricePerUnitCents: number | null;
  profitPerUnitCents: number | null;
  marginPct: number | null;
  pricePerUnitWithTaxCents: number | null;
};

function sumMaterialCents(items: MaterialItem[]): number {
  let total = 0;
  for (const it of items) total += Math.round((it.qty || 0) * (it.unitCostCents || 0));
  return roundCents(total);
}

function sumLaborCents(items: LaborItem[]): number {
  let total = 0;
  for (const it of items) total += Math.round((it.hours || 0) * (it.rateCents || 0));
  return roundCents(total);
}

function sumOverheadFlatCents(items: OverheadItem[]): number {
  let total = 0;
  for (const it of items) {
    if (it.kind === "flat") total += it.amountCents || 0;
  }
  return roundCents(total);
}

function sumOverheadPercentCents(items: OverheadItem[], baseCents: number): number {
  let total = 0;
  for (const it of items) {
    if (it.kind !== "percent") continue;
    const pct = clampNumber(it.percent || 0, 0, 1000);
    total += Math.round((baseCents * pct) / 100);
  }
  return roundCents(total);
}

export function computeTotals(sheet: CostSheet): SheetTotals {
  const materialsSubtotalCents = sumMaterialCents(sheet.materials || []);
  const wastePct = clampNumber(sheet.wastePct || 0, 0, 1000);
  const materialsWithWasteCents = Math.round(
    materialsSubtotalCents * (1 + wastePct / 100),
  );

  const laborSubtotalCents = sumLaborCents(sheet.labor || []);
  const baseCents = roundCents(materialsWithWasteCents + laborSubtotalCents);

  const overheadFlatCents = sumOverheadFlatCents(sheet.overhead || []);
  const overheadPercentCents = sumOverheadPercentCents(sheet.overhead || [], baseCents);
  const overheadTotalCents = roundCents(overheadFlatCents + overheadPercentCents);

  const batchTotalCents = roundCents(baseCents + overheadTotalCents);

  const batchSize = clampNumber(sheet.batchSize || 0, 0, Number.MAX_SAFE_INTEGER);
  const costPerUnitCents =
    batchSize > 0 ? Math.round(batchTotalCents / batchSize) : null;

  const markupPct = clampNumber(sheet.markupPct || 0, 0, 10000);
  const pricePerUnitCents =
    costPerUnitCents === null
      ? null
      : Math.round(costPerUnitCents * (1 + markupPct / 100));

  const profitPerUnitCents =
    pricePerUnitCents === null || costPerUnitCents === null
      ? null
      : roundCents(pricePerUnitCents - costPerUnitCents);

  const marginPct =
    pricePerUnitCents && profitPerUnitCents !== null
      ? Math.round((profitPerUnitCents / pricePerUnitCents) * 1000) / 10
      : null;

  const taxPct = clampNumber(sheet.taxPct || 0, 0, 1000);
  const pricePerUnitWithTaxCents =
    pricePerUnitCents === null
      ? null
      : roundCents(pricePerUnitCents + Math.round((pricePerUnitCents * taxPct) / 100));

  return {
    materialsSubtotalCents,
    materialsWithWasteCents: roundCents(materialsWithWasteCents),
    laborSubtotalCents,
    overheadFlatCents,
    overheadPercentCents,
    overheadTotalCents,
    batchTotalCents,
    costPerUnitCents,
    pricePerUnitCents,
    profitPerUnitCents,
    marginPct,
    pricePerUnitWithTaxCents,
  };
}

