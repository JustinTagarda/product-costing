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
