import { describe, expect, it } from "vitest";
import { clampNumber, computeTotals, makeBlankSheet } from "@/lib/costing";
import type { CostSheet } from "@/lib/costing";

function sheetWith(overrides: Partial<CostSheet>): CostSheet {
  return { ...makeBlankSheet("test"), materials: [], labor: [], ...overrides };
}

describe("computeTotals", () => {
  it("computes materials, waste, labor, overhead, and per-unit price", () => {
    const totals = computeTotals(
      sheetWith({
        batchSize: 10,
        wastePct: 10,
        markupPct: 50,
        taxPct: 12,
        materials: [
          { id: "m1", materialId: null, name: "Canvas", qty: 2, unit: "yd", unitCostCents: 500 },
        ],
        labor: [{ id: "l1", role: "Sew", hours: 2, rateCents: 1000 }],
        overhead: [
          { id: "o1", name: "Packaging", kind: "flat", amountCents: 300 },
          { id: "o2", name: "Shop", kind: "percent", percent: 10 },
        ],
      }),
    );

    expect(totals.materialsSubtotalCents).toBe(1000);
    expect(totals.materialsWithWasteCents).toBe(1100);
    expect(totals.laborSubtotalCents).toBe(2000);
    expect(totals.overheadFlatCents).toBe(300);
    expect(totals.overheadPercentCents).toBe(310);
    expect(totals.batchTotalCents).toBe(3710);
    expect(totals.costPerUnitCents).toBe(371);
    expect(totals.pricePerUnitCents).toBe(557);
    expect(totals.profitPerUnitCents).toBe(186);
    expect(totals.pricePerUnitWithTaxCents).toBe(624);
  });

  it("returns null per-unit values for a zero batch size", () => {
    const totals = computeTotals(sheetWith({ batchSize: 0 }));
    expect(totals.costPerUnitCents).toBeNull();
    expect(totals.pricePerUnitCents).toBeNull();
    expect(totals.marginPct).toBeNull();
  });

  it("does not throw on missing numeric fields", () => {
    const totals = computeTotals(
      sheetWith({
        materials: [
          { id: "m1", materialId: null, name: "", qty: Number.NaN, unit: "", unitCostCents: Number.NaN },
        ],
      }),
    );
    expect(Number.isFinite(totals.batchTotalCents)).toBe(true);
  });
});

describe("clampNumber", () => {
  it("clamps into range and maps non-finite to min", () => {
    expect(clampNumber(5, 0, 10)).toBe(5);
    expect(clampNumber(-1, 0, 10)).toBe(0);
    expect(clampNumber(11, 0, 10)).toBe(10);
    expect(clampNumber(Number.NaN, 0, 10)).toBe(0);
  });
});
