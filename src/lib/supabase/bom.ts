import {
  makeBlankBom,
  makeBlankBomLine,
  sortBomsByUpdatedAtDesc,
  type BomLine,
  type BomRecord,
} from "@/lib/bom";

export type DbBomItemRow = {
  id: string;
  user_id: string;
  name: string;
  code: string;
  item_type: string;
  output_qty: number | string;
  output_unit: string;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type DbBomLineRow = {
  id: string;
  user_id: string;
  bom_item_id: string;
  sort_order: number | string;
  component_type: string;
  material_id: string | null;
  component_bom_item_id: string | null;
  component_name: string;
  quantity: number | string;
  unit: string;
  unit_cost_cents: number | string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type DbBomItemInsert = Omit<DbBomItemRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type DbBomItemUpdate = Partial<Omit<DbBomItemRow, "id" | "user_id" | "created_at">> & {
  updated_at?: string;
};

export type DbBomLineInsert = Omit<DbBomLineRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type DbBomLineUpdate = Partial<Omit<DbBomLineRow, "id" | "user_id" | "bom_item_id" | "created_at">> & {
  updated_at?: string;
};

type BomItemDefaults = {
  name?: string;
  code?: string;
  itemType?: "part" | "product";
  outputQty?: number;
  outputUnit?: string;
};

type BomLineDefaults = {
  componentType?: "material" | "bom_item";
  materialId?: string | null;
  componentBomId?: string | null;
  componentName?: string;
  quantity?: number;
  unit?: string;
  unitCostCents?: number;
  notes?: string;
};

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function rowToBomWithoutLines(row: DbBomItemRow): Omit<BomRecord, "lines"> {
  const fallback = makeBlankBom(row.id);
  return {
    ...fallback,
    id: row.id,
    name: row.name ?? fallback.name,
    code: row.code ?? fallback.code,
    itemType: row.item_type === "product" ? "product" : "part",
    outputQty: Math.max(0, asNumber(row.output_qty, fallback.outputQty)),
    outputUnit: row.output_unit ?? fallback.outputUnit,
    isActive: Boolean(row.is_active),
    notes: row.notes ?? fallback.notes,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function rowToBomLine(row: DbBomLineRow): BomLine {
  const fallback = makeBlankBomLine(row.id);
  return {
    ...fallback,
    id: row.id,
    sortOrder: Math.max(0, Math.trunc(asNumber(row.sort_order, 0))),
    componentType: row.component_type === "bom_item" ? "bom_item" : "material",
    materialId: row.material_id ?? null,
    componentBomId: row.component_bom_item_id ?? null,
    componentName: row.component_name ?? "",
    quantity: Math.max(0, asNumber(row.quantity, 0)),
    unit: row.unit ?? fallback.unit,
    unitCostCents: Math.max(0, Math.round(asNumber(row.unit_cost_cents, 0))),
    notes: row.notes ?? "",
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function combineBomRows(itemRows: DbBomItemRow[], lineRows: DbBomLineRow[]): BomRecord[] {
  const lineGroups = new Map<string, BomLine[]>();
  for (const row of lineRows) {
    const bomId = row.bom_item_id;
    if (!lineGroups.has(bomId)) lineGroups.set(bomId, []);
    lineGroups.get(bomId)?.push(rowToBomLine(row));
  }

  const records = itemRows.map((itemRow) => {
    const base = rowToBomWithoutLines(itemRow);
    const lines = (lineGroups.get(itemRow.id) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder || Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .map((line, index) => ({ ...line, sortOrder: index }));
    return {
      ...base,
      lines: lines.length ? lines : [makeBlankBomLine(`bomline_${itemRow.id}`, { sortOrder: 0 })],
    } satisfies BomRecord;
  });

  return sortBomsByUpdatedAtDesc(records);
}

export function bomToItemUpdate(record: BomRecord): DbBomItemUpdate {
  return {
    name: record.name,
    code: record.code,
    item_type: record.itemType,
    output_qty: record.outputQty,
    output_unit: record.outputUnit,
    is_active: record.isActive,
    notes: record.notes,
    updated_at: new Date().toISOString(),
  };
}

export function lineToRowUpdate(line: BomLine): DbBomLineUpdate {
  return {
    sort_order: line.sortOrder,
    component_type: line.componentType,
    material_id: line.materialId,
    component_bom_item_id: line.componentBomId,
    component_name: line.componentName,
    quantity: line.quantity,
    unit: line.unit,
    unit_cost_cents: line.unitCostCents,
    notes: line.notes,
    updated_at: new Date().toISOString(),
  };
}

export function makeBlankBomItemInsert(userId: string, defaults?: BomItemDefaults): DbBomItemInsert {
  const blank = makeBlankBom("tmp", {
    name: defaults?.name,
    code: defaults?.code,
    itemType: defaults?.itemType,
    outputQty: defaults?.outputQty,
    outputUnit: defaults?.outputUnit,
  });
  return {
    user_id: userId,
    name: blank.name,
    code: blank.code,
    item_type: blank.itemType,
    output_qty: blank.outputQty,
    output_unit: blank.outputUnit,
    is_active: blank.isActive,
    notes: blank.notes,
  };
}

export function makeBlankBomLineInsert(
  userId: string,
  bomItemId: string,
  sortOrder: number,
  defaults?: BomLineDefaults,
): DbBomLineInsert {
  const blank = makeBlankBomLine("tmp", {
    sortOrder,
    componentType: defaults?.componentType,
    materialId: defaults?.materialId,
    componentBomId: defaults?.componentBomId,
    componentName: defaults?.componentName,
    quantity: defaults?.quantity,
    unit: defaults?.unit,
    unitCostCents: defaults?.unitCostCents,
    notes: defaults?.notes,
  });
  return {
    user_id: userId,
    bom_item_id: bomItemId,
    sort_order: blank.sortOrder,
    component_type: blank.componentType,
    material_id: blank.materialId,
    component_bom_item_id: blank.componentBomId,
    component_name: blank.componentName,
    quantity: blank.quantity,
    unit: blank.unit,
    unit_cost_cents: blank.unitCostCents,
    notes: blank.notes,
  };
}
