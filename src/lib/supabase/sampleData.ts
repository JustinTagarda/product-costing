import type { SupabaseClient } from "@supabase/supabase-js";
import { isDuplicateKeyError } from "@/lib/itemCodes";
import { hasExistingAccountData } from "@/lib/supabase/accountData";
import { makeBlankMaterialInsert } from "@/lib/supabase/materials";
import { makeBlankPurchaseInsert } from "@/lib/supabase/purchases";
import {
  makeBlankBomItemInsert,
  makeBlankBomLineInsert,
} from "@/lib/supabase/bom";
import { makeBlankSheetInsert } from "@/lib/supabase/costSheets";

const SAMPLE_NOTES = "Sample product — feel free to edit or delete.";

/**
 * Seeds one realistic, fully-worked example product (materials, purchases,
 * BOM, and a cost sheet) for a new account, so a first-time visitor has
 * something to look at instead of an empty screen. Runs at most once per
 * account: `account_bootstrap` has a primary key on `user_id`, so this claims
 * the seed with an insert first and silently no-ops if that insert loses a
 * race or the account was already seeded. On the account's first-ever claim
 * (which also covers pre-existing accounts logging in after this feature
 * shipped), it additionally skips the actual seed — while still leaving the
 * claim in place — if the account already has any of its own data, so an
 * existing user's real records are never touched.
 */
export async function seedSampleAccountData(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error: claimError } = await supabase
    .from("account_bootstrap")
    .insert({ user_id: userId });

  if (claimError) {
    if (!isDuplicateKeyError(claimError)) {
      console.error("Failed to claim sample data seed:", claimError.message);
    }
    return;
  }

  if (await hasExistingAccountData(supabase, userId)) {
    return;
  }

  try {
    const leatherInsert = makeBlankMaterialInsert(userId, { defaultUnit: "sqft" });
    Object.assign(leatherInsert, {
      name: "Full-Grain Leather (Sample)",
      code: "MAT-0001",
      category: "Raw Material",
      supplier: "Local Tannery",
    });
    const buckleInsert = makeBlankMaterialInsert(userId, { defaultUnit: "piece" });
    Object.assign(buckleInsert, {
      name: "Brass Buckle Hardware (Sample)",
      code: "MAT-0002",
      category: "Hardware",
      supplier: "Hardware Supplier Co.",
    });

    const { data: materialRows, error: materialsError } = await supabase
      .from("materials")
      .insert([leatherInsert, buckleInsert])
      .select("id, name");
    if (materialsError || !materialRows || materialRows.length !== 2) {
      console.error("Failed to seed sample materials:", materialsError?.message);
      return;
    }

    const leatherId = (materialRows as Array<{ id: string; name: string }>).find((row) =>
      row.name.startsWith("Full-Grain Leather"),
    )?.id;
    const buckleId = (materialRows as Array<{ id: string; name: string }>).find((row) =>
      row.name.startsWith("Brass Buckle"),
    )?.id;
    if (!leatherId || !buckleId) {
      console.error("Failed to resolve seeded sample material ids.");
      return;
    }

    const leatherPurchase = makeBlankPurchaseInsert(userId, {
      materialId: leatherId,
      materialName: "Full-Grain Leather (Sample)",
      supplier: "Local Tannery",
      store: "Local Tannery",
      unit: "sqft",
      marketplace: "local",
    });
    Object.assign(leatherPurchase, { quantity: 10, usable_quantity: 10, unit_cost_cents: 450, total_cost_cents: 4500, cost_cents: 4500 });

    const bucklePurchase = makeBlankPurchaseInsert(userId, {
      materialId: buckleId,
      materialName: "Brass Buckle Hardware (Sample)",
      supplier: "Hardware Supplier Co.",
      store: "Hardware Supplier Co.",
      unit: "piece",
      marketplace: "other",
    });
    Object.assign(bucklePurchase, { quantity: 50, usable_quantity: 50, unit_cost_cents: 150, total_cost_cents: 7500, cost_cents: 7500 });

    const { error: purchasesError } = await supabase
      .from("purchases")
      .insert([leatherPurchase, bucklePurchase]);
    if (purchasesError) {
      console.error("Failed to seed sample purchases:", purchasesError.message);
      return;
    }

    const bomItemInsert = makeBlankBomItemInsert(userId, {
      name: "Leather Wallet (Sample)",
      code: "BOM-0001",
      itemType: "product",
      outputQty: 1,
      outputUnit: "unit",
    });
    const { data: bomItemRow, error: bomItemError } = await supabase
      .from("bom_items")
      .insert(bomItemInsert)
      .select("id")
      .single();
    if (bomItemError || !bomItemRow) {
      console.error("Failed to seed sample BOM item:", bomItemError?.message);
      return;
    }
    const bomItemId = (bomItemRow as { id: string }).id;

    const bomLine1 = makeBlankBomLineInsert(userId, bomItemId, 0, {
      componentType: "material",
      materialId: leatherId,
      componentName: "Full-Grain Leather (Sample)",
      quantity: 2,
      unit: "sqft",
      unitCostCents: 450,
    });
    const bomLine2 = makeBlankBomLineInsert(userId, bomItemId, 1, {
      componentType: "material",
      materialId: buckleId,
      componentName: "Brass Buckle Hardware (Sample)",
      quantity: 1,
      unit: "piece",
      unitCostCents: 150,
    });
    const { error: bomLinesError } = await supabase
      .from("bom_item_lines")
      .insert([bomLine1, bomLine2]);
    if (bomLinesError) {
      console.error("Failed to seed sample BOM lines:", bomLinesError.message);
      return;
    }

    const sheetInsert = makeBlankSheetInsert(userId, {
      currency: "USD",
      wastePct: 5,
      markupPct: 45,
      taxPct: 0,
    });
    Object.assign(sheetInsert, {
      name: "Sample: Leather Wallet",
      sku: "SAMPLE-0001",
      unit_name: "wallet",
      batch_size: 10,
      materials: [
        {
          id: "sample_m_leather",
          materialId: leatherId,
          name: "Full-Grain Leather (Sample)",
          qty: 2,
          unit: "sqft",
          unitCostCents: 450,
        },
        {
          id: "sample_m_buckle",
          materialId: buckleId,
          name: "Brass Buckle Hardware (Sample)",
          qty: 1,
          unit: "piece",
          unitCostCents: 150,
        },
      ],
      labor: [
        { id: "sample_l_assembly", role: "Stitching & Assembly", hours: 1.5, rateCents: 800 },
      ],
      overhead: [
        { id: "sample_o_workshop", name: "Workshop Overhead", kind: "percent", percent: 10 },
      ],
      notes: SAMPLE_NOTES,
    });

    const { error: sheetError } = await supabase.from("cost_sheets").insert(sheetInsert);
    if (sheetError) {
      console.error("Failed to seed sample cost sheet:", sheetError.message);
    }
  } catch (err) {
    console.error("Unexpected error seeding sample account data:", err);
  }
}
