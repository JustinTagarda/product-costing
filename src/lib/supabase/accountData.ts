import type { SupabaseClient } from "@supabase/supabase-js";

const ACCOUNT_DATA_TABLES = ["cost_sheets", "materials", "purchases", "bom_items"] as const;

/**
 * True if this account already has any of its own rows in the core domain
 * tables. Errs conservative: a failed count query is treated as "has data"
 * so callers never assume an account is empty when they couldn't actually
 * verify it.
 */
export async function hasExistingAccountData(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const results = await Promise.all(
    ACCOUNT_DATA_TABLES.map((table) =>
      supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId),
    ),
  );
  return results.some(({ count, error }) => error || (count ?? 0) > 0);
}
