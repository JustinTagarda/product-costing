import { makeId } from "@/lib/costing";

export type MaterialRecord = {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  unitCostCents: number;
  supplier: string;
  lastPurchaseCostCents: number;
  lastPurchaseDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export const MATERIALS_LOCAL_STORAGE_KEY = "product-costing:materials:local:v1";

export function makeBlankMaterial(id: string): MaterialRecord {
  const now = new Date().toISOString();
  return {
    id,
    name: "",
    code: "",
    category: "",
    unit: "ea",
    unitCostCents: 0,
    supplier: "",
    lastPurchaseCostCents: 0,
    lastPurchaseDate: "",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function createDemoMaterials(): MaterialRecord[] {
  const t = "2026-02-09T00:00:00.000Z";
  return [
    {
      id: "material_demo_canvas",
      name: "Canvas fabric",
      code: "CANVAS-10OZ",
      category: "Fabric",
      unit: "yd",
      unitCostCents: 625,
      supplier: "Metro Textile",
      lastPurchaseCostCents: 599,
      lastPurchaseDate: "2026-02-05",
      isActive: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "material_demo_thread",
      name: "Thread",
      code: "THREAD-BLK",
      category: "Accessories",
      unit: "spool",
      unitCostCents: 399,
      supplier: "Sewing Hub",
      lastPurchaseCostCents: 389,
      lastPurchaseDate: "2026-02-03",
      isActive: true,
      createdAt: t,
      updatedAt: t,
    },
  ];
}

export function sortMaterialsByUpdatedAtDesc(items: MaterialRecord[]): MaterialRecord[] {
  return [...items].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function sortMaterialsByNameAsc(items: MaterialRecord[]): MaterialRecord[] {
  return [...items].sort((a, b) => {
    const byName = (a.name || "").localeCompare((b.name || ""), undefined, {
      sensitivity: "base",
      numeric: true,
    });
    if (byName !== 0) return byName;
    return (a.id || "").localeCompare((b.id || ""));
  });
}

export function parseMaterialRecords(raw: unknown): MaterialRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Partial<MaterialRecord>;
      const fallback = makeBlankMaterial(typeof row.id === "string" ? row.id : makeId("mat"));
      const unitCostRaw = Number(row.unitCostCents);
      const lastPurchaseCostRaw = Number(row.lastPurchaseCostCents);
      return {
        ...fallback,
        ...row,
        unitCostCents: Number.isFinite(unitCostRaw)
          ? Math.max(0, Math.round(unitCostRaw))
          : fallback.unitCostCents,
        lastPurchaseCostCents: Number.isFinite(lastPurchaseCostRaw)
          ? Math.max(0, Math.round(lastPurchaseCostRaw))
          : fallback.lastPurchaseCostCents,
        isActive: row.isActive !== undefined ? Boolean(row.isActive) : true,
      };
    });
}

export function readLocalMaterialRecords(): MaterialRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MATERIALS_LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return parseMaterialRecords(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeLocalMaterialRecords(materials: MaterialRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    if (!materials.length) {
      window.localStorage.removeItem(MATERIALS_LOCAL_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(MATERIALS_LOCAL_STORAGE_KEY, JSON.stringify(materials));
  } catch {
    // Ignore storage failures.
  }
}
