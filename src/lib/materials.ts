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
