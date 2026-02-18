import type { CostSheet, StoredData } from "@/lib/costing";
import { clampNumber } from "@/lib/costing";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function normalizeSheet(v: unknown): CostSheet | null {
  if (!isRecord(v)) return null;

  const id = asString(v.id);
  if (!id) return null;

  const materials = asArray(v.materials)
    .map((m) => {
      if (!isRecord(m)) return null;
      const mid = asString(m.id);
      if (!mid) return null;
      return {
        id: mid,
        materialId: asString(m.materialId ?? m.material_id) || null,
        name: asString(m.name),
        qty: asNumber(m.qty, 0),
        unit: asString(m.unit),
        unitCostCents: Math.round(asNumber(m.unitCostCents, 0)),
      };
    })
    .filter(Boolean) as CostSheet["materials"];

  const labor = asArray(v.labor)
    .map((l) => {
      if (!isRecord(l)) return null;
      const lid = asString(l.id);
      if (!lid) return null;
      return {
        id: lid,
        role: asString(l.role),
        hours: asNumber(l.hours, 0),
        rateCents: Math.round(asNumber(l.rateCents, 0)),
      };
    })
    .filter(Boolean) as CostSheet["labor"];

  const overhead = asArray(v.overhead)
    .map((o) => {
      if (!isRecord(o)) return null;
      const oid = asString(o.id);
      if (!oid) return null;
      const kind = asString(o.kind);
      if (kind === "flat") {
        return {
          id: oid,
          name: asString(o.name),
          kind: "flat" as const,
          amountCents: Math.round(asNumber(o.amountCents, 0)),
        };
      }
      if (kind === "percent") {
        return {
          id: oid,
          name: asString(o.name),
          kind: "percent" as const,
          percent: asNumber(o.percent, 0),
        };
      }
      return null;
    })
    .filter(Boolean) as CostSheet["overhead"];

  const createdAt = asString(v.createdAt) || new Date(0).toISOString();
  const updatedAt = asString(v.updatedAt) || createdAt;

  return {
    id,
    name: asString(v.name, "Untitled"),
    sku: asString(v.sku),
    currency: asString(v.currency, "USD"),
    unitName: asString(v.unitName, "unit"),
    batchSize: clampNumber(asNumber(v.batchSize, 1), 0, Number.MAX_SAFE_INTEGER),
    wastePct: clampNumber(asNumber(v.wastePct, 0), 0, 1000),
    markupPct: clampNumber(asNumber(v.markupPct, 0), 0, 10000),
    taxPct: clampNumber(asNumber(v.taxPct, 0), 0, 1000),
    materials,
    labor,
    overhead,
    notes: asString(v.notes),
    createdAt,
    updatedAt,
  };
}

export function parseStoredDataJson(jsonText: string): StoredData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  // Accept:
  // 1) Our canonical format: { version: 1, sheets: [...] }
  // 2) A bare array of sheets: [...]
  let sheetsRaw: unknown = null;
  let selectedId: string | undefined;

  if (Array.isArray(parsed)) {
    sheetsRaw = parsed;
  } else if (isRecord(parsed)) {
    const version = asNumber(parsed.version, 0);
    if (version !== 1) return null;
    sheetsRaw = parsed.sheets;
    selectedId = asString(parsed.selectedId) || undefined;
  } else {
    return null;
  }

  const sheets = asArray(sheetsRaw)
    .map(normalizeSheet)
    .filter(Boolean) as CostSheet[];

  if (!sheets.length) return null;

  const selectedOk = selectedId && sheets.some((s) => s.id === selectedId);
  return { version: 1, sheets, selectedId: selectedOk ? selectedId : sheets[0].id };
}
