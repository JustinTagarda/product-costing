import { describe, expect, it } from "vitest";
import { rowToSheet, type DbCostSheetRow } from "@/lib/supabase/costSheets";

function baseRow(overrides: Partial<DbCostSheetRow>): DbCostSheetRow {
  return {
    id: "row-1",
    user_id: "user-1",
    name: "Sheet",
    sku: "PR-0001",
    currency: "USD",
    unit_name: "unit",
    batch_size: 1,
    waste_pct: 0,
    markup_pct: 40,
    tax_pct: 0,
    materials: [],
    labor: [],
    overhead: [],
    notes: "",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("rowToSheet", () => {
  it("drops malformed material/labor entries instead of crashing", () => {
    const sheet = rowToSheet(
      baseRow({
        materials: [
          null,
          "junk",
          { name: "no id" },
          { id: "m1", name: "Canvas", qty: "2", unitCostCents: "500", unit: "yd" },
        ],
        labor: [{ id: "l1", role: "Sew", hours: "1.5", rateCents: 2000 }, 42],
      }),
    );

    expect(sheet.materials).toHaveLength(1);
    expect(sheet.materials[0]).toMatchObject({ id: "m1", qty: 2, unitCostCents: 500 });
    expect(sheet.labor).toHaveLength(1);
    expect(sheet.labor[0]).toMatchObject({ id: "l1", hours: 1.5, rateCents: 2000 });
  });

  it("coerces negative and non-numeric amounts to safe values", () => {
    const sheet = rowToSheet(
      baseRow({
        materials: [{ id: "m1", qty: -5, unitCostCents: "abc" }],
      }),
    );
    expect(sheet.materials[0].qty).toBe(0);
    expect(sheet.materials[0].unitCostCents).toBe(0);
  });

  it("survives invalid timestamps", () => {
    const sheet = rowToSheet(baseRow({ created_at: "not-a-date", updated_at: "" }));
    expect(() => new Date(sheet.createdAt).toISOString()).not.toThrow();
  });

  it("keeps only well-formed overhead entries", () => {
    const sheet = rowToSheet(
      baseRow({
        overhead: [
          { id: "o1", name: "Pack", kind: "flat", amountCents: 100 },
          { id: "o2", name: "Bad", kind: "mystery" },
        ],
      }),
    );
    expect(sheet.overhead).toHaveLength(1);
  });
});
