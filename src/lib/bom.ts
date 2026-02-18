import { makeId } from "@/lib/costing";

export type BomItemType = "part" | "product";
export type BomComponentType = "material" | "bom_item";

export type BomLine = {
  id: string;
  sortOrder: number;
  componentType: BomComponentType;
  materialId: string | null;
  componentBomId: string | null;
  componentName: string;
  quantity: number;
  unit: string;
  unitCostCents: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type BomRecord = {
  id: string;
  name: string;
  code: string;
  itemType: BomItemType;
  outputQty: number;
  outputUnit: string;
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  lines: BomLine[];
};

type BlankBomDefaults = {
  name?: string;
  code?: string;
  itemType?: BomItemType;
  outputQty?: number;
  outputUnit?: string;
};

type BlankBomLineDefaults = {
  sortOrder?: number;
  componentType?: BomComponentType;
  materialId?: string | null;
  componentBomId?: string | null;
  componentName?: string;
  quantity?: number;
  unit?: string;
  unitCostCents?: number;
  notes?: string;
};

function asFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function makeBlankBomLine(id: string, defaults?: BlankBomLineDefaults): BomLine {
  const now = new Date().toISOString();
  return {
    id,
    sortOrder: Math.max(0, Math.trunc(asFiniteNumber(defaults?.sortOrder, 0))),
    componentType: defaults?.componentType === "bom_item" ? "bom_item" : "material",
    materialId: defaults?.materialId ?? null,
    componentBomId: defaults?.componentBomId ?? null,
    componentName: defaults?.componentName ?? "",
    quantity: Math.max(0, asFiniteNumber(defaults?.quantity, 1)),
    unit: defaults?.unit ?? "ea",
    unitCostCents: Math.max(0, Math.round(asFiniteNumber(defaults?.unitCostCents, 0))),
    notes: defaults?.notes ?? "",
    createdAt: now,
    updatedAt: now,
  };
}

export function makeBlankBom(id: string, defaults?: BlankBomDefaults): BomRecord {
  const now = new Date().toISOString();
  return {
    id,
    name: defaults?.name ?? "Untitled BOM",
    code: defaults?.code ?? "",
    itemType: defaults?.itemType === "product" ? "product" : "part",
    outputQty: Math.max(0, asFiniteNumber(defaults?.outputQty, 1)),
    outputUnit: defaults?.outputUnit ?? "ea",
    isActive: true,
    notes: "",
    createdAt: now,
    updatedAt: now,
    lines: [makeBlankBomLine(makeId("bomline"), { sortOrder: 0 })],
  };
}

function normalizeLine(raw: Partial<BomLine>, fallbackIdPrefix: string): BomLine {
  const fallback = makeBlankBomLine(
    typeof raw.id === "string" && raw.id ? raw.id : makeId(fallbackIdPrefix),
  );
  const quantityRaw = asFiniteNumber(raw.quantity, fallback.quantity);
  const unitCostRaw = asFiniteNumber(raw.unitCostCents, fallback.unitCostCents);
  const sortOrderRaw = asFiniteNumber(raw.sortOrder, fallback.sortOrder);
  return {
    ...fallback,
    ...raw,
    componentType: raw.componentType === "bom_item" ? "bom_item" : "material",
    materialId: typeof raw.materialId === "string" && raw.materialId ? raw.materialId : null,
    componentBomId:
      typeof raw.componentBomId === "string" && raw.componentBomId ? raw.componentBomId : null,
    componentName: typeof raw.componentName === "string" ? raw.componentName : fallback.componentName,
    quantity: Math.max(0, quantityRaw),
    unit: typeof raw.unit === "string" ? raw.unit : fallback.unit,
    unitCostCents: Math.max(0, Math.round(unitCostRaw)),
    notes: typeof raw.notes === "string" ? raw.notes : fallback.notes,
    sortOrder: Math.max(0, Math.trunc(sortOrderRaw)),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : fallback.createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : fallback.updatedAt,
  };
}

export function parseBomRecords(raw: unknown): BomRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Partial<BomRecord>;
      const fallback = makeBlankBom(typeof row.id === "string" && row.id ? row.id : makeId("bom"));
      const outputQtyRaw = asFiniteNumber(row.outputQty, fallback.outputQty);
      const linesRaw = Array.isArray(row.lines) ? row.lines : fallback.lines;
      const lines = linesRaw
        .filter((line) => line && typeof line === "object")
        .map((line, index) =>
          normalizeLine(line as Partial<BomLine>, `bomline_${index}`),
        )
        .sort((a, b) => a.sortOrder - b.sortOrder || Date.parse(a.createdAt) - Date.parse(b.createdAt))
        .map((line, index) => ({ ...line, sortOrder: index }));
      return {
        ...fallback,
        ...row,
        name: typeof row.name === "string" ? row.name : fallback.name,
        code: typeof row.code === "string" ? row.code : fallback.code,
        itemType: row.itemType === "product" ? "product" : "part",
        outputQty: Math.max(0, outputQtyRaw),
        outputUnit: typeof row.outputUnit === "string" ? row.outputUnit : fallback.outputUnit,
        isActive: row.isActive !== undefined ? Boolean(row.isActive) : true,
        notes: typeof row.notes === "string" ? row.notes : fallback.notes,
        createdAt: typeof row.createdAt === "string" ? row.createdAt : fallback.createdAt,
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : fallback.updatedAt,
        lines: lines.length ? lines : [makeBlankBomLine(makeId("bomline"), { sortOrder: 0 })],
      } satisfies BomRecord;
    });
}

export function sortBomsByUpdatedAtDesc(items: BomRecord[]): BomRecord[] {
  return [...items].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function createDemoBoms(
  materials: Array<{ id: string; name: string; unit: string; unitCostCents: number }>,
): BomRecord[] {
  const t = "2026-02-10T00:00:00.000Z";
  const canvas = materials[0] ?? {
    id: "material_demo_canvas",
    name: "Canvas fabric",
    unit: "yd",
    unitCostCents: 625,
  };
  const thread = materials[1] ?? {
    id: "material_demo_thread",
    name: "Thread",
    unit: "spool",
    unitCostCents: 399,
  };

  const handlePart: BomRecord = {
    id: "bom_demo_handle_set",
    name: "Handle Set",
    code: "PART-HANDLE-SET",
    itemType: "part",
    outputQty: 1,
    outputUnit: "set",
    isActive: true,
    notes: "Reusable part used across multiple bags.",
    createdAt: t,
    updatedAt: t,
    lines: [
      {
        id: "bomline_demo_handle_canvas",
        sortOrder: 0,
        componentType: "material",
        materialId: canvas.id,
        componentBomId: null,
        componentName: canvas.name,
        quantity: 1.2,
        unit: canvas.unit,
        unitCostCents: canvas.unitCostCents,
        notes: "",
        createdAt: t,
        updatedAt: t,
      },
      {
        id: "bomline_demo_handle_thread",
        sortOrder: 1,
        componentType: "material",
        materialId: thread.id,
        componentBomId: null,
        componentName: thread.name,
        quantity: 0.2,
        unit: thread.unit,
        unitCostCents: thread.unitCostCents,
        notes: "",
        createdAt: t,
        updatedAt: t,
      },
    ],
  };

  const toteProduct: BomRecord = {
    id: "bom_demo_tote_bag",
    name: "Canvas Tote Bag (BOM)",
    code: "PROD-TOTE-001",
    itemType: "product",
    outputQty: 1,
    outputUnit: "bag",
    isActive: true,
    notes: "Demonstrates a multi-level BOM with a reusable subassembly.",
    createdAt: t,
    updatedAt: t,
    lines: [
      {
        id: "bomline_demo_tote_part",
        sortOrder: 0,
        componentType: "bom_item",
        materialId: null,
        componentBomId: handlePart.id,
        componentName: handlePart.name,
        quantity: 1,
        unit: handlePart.outputUnit,
        unitCostCents: 0,
        notes: "",
        createdAt: t,
        updatedAt: t,
      },
      {
        id: "bomline_demo_tote_canvas",
        sortOrder: 1,
        componentType: "material",
        materialId: canvas.id,
        componentBomId: null,
        componentName: canvas.name,
        quantity: 1.8,
        unit: canvas.unit,
        unitCostCents: canvas.unitCostCents,
        notes: "",
        createdAt: t,
        updatedAt: t,
      },
    ],
  };

  return [toteProduct, handlePart];
}
