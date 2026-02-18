"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { computeTotals, createDemoSheet } from "@/lib/costing";
import type { CostSheet, StoredData } from "@/lib/costing";
import { formatCentsWithSettingsSymbol } from "@/lib/currency";
import { parseStoredDataJson } from "@/lib/importExport";
import { GlobalAppToast } from "@/components/GlobalAppToast";
import { MainContentStatusFooter } from "@/components/MainContentStatusFooter";
import { MainNavMenu } from "@/components/MainNavMenu";
import { getSupabaseClient } from "@/lib/supabase/client";
import { goToWelcomePage } from "@/lib/navigation";
import { rowToSheet, type DbCostSheetRow } from "@/lib/supabase/costSheets";
import { useAppSettings } from "@/lib/useAppSettings";

type Notice = { kind: "info" | "success" | "error"; message: string };

const LOCAL_STORAGE_KEY = "product-costing:local:v1";

function cardClassName(): string {
  return [
    "rounded-2xl border border-border bg-card/80",
    "shadow-[0_18px_55px_rgba(0,0,0,.08)]",
    "backdrop-blur-md",
  ].join(" ");
}

function sortSheetsByUpdatedAtDesc(items: CostSheet[]): CostSheet[] {
  return [...items].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function readLocalSheets(): StoredData | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    return parseStoredDataJson(raw);
  } catch {
    return null;
  }
}

function writeLocalSheets(sheets: CostSheet[], selectedId?: string | null): void {
  try {
    if (!sheets.length) {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
      return;
    }
    const payload: StoredData = {
      version: 1,
      sheets,
      selectedId: selectedId ?? undefined,
    };
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
}

export default function ProductsApp() {
  const [{ supabase, supabaseError }] = useState(() => {
    try {
      return { supabase: getSupabaseClient(), supabaseError: null as string | null };
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Supabase is not configured. Check your environment variables.";
      return {
        supabase: null as ReturnType<typeof getSupabaseClient> | null,
        supabaseError: msg,
      };
    }
  });

  const [notice, setNotice] = useState<Notice | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(() => !supabase);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<CostSheet[]>([]);
  const [query, setQuery] = useState("");
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  const user = session?.user ?? null;
  const userId = user?.id ?? null;
  const isCloudMode = Boolean(userId && supabase);

  const toast = useCallback((kind: Notice["kind"], message: string): void => {
    setNotice({ kind, message });
    window.setTimeout(() => setNotice(null), 2600);
  }, []);

  const { settings } = useAppSettings({
    supabase,
    userId,
    authReady,
    onError: (message) => toast("error", message),
  });

  const formatMoney = useCallback(
    (cents: number) =>
      formatCentsWithSettingsSymbol(
        cents,
        settings.baseCurrency,
        settings.currencyRoundingIncrement,
        settings.currencyRoundingMode,
      ),
    [settings.baseCurrency, settings.currencyRoundingIncrement, settings.currencyRoundingMode],
  );

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;

    async function loadSession() {
      const { data, error } = await client.auth.getSession();
      if (cancelled) return;
      if (error) toast("error", error.message);
      setSession(data.session);
      setAuthReady(true);
    }

    void loadSession();

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [supabase, toast]);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;

    async function loadProducts() {
      setLoading(true);

      if (isCloudMode && userId && supabase) {
        const { data, error } = await supabase
          .from("cost_sheets")
          .select("*")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });

        if (cancelled) return;

        if (error) {
          toast("error", error.message);
          setProducts([]);
          setLoading(false);
          return;
        }

        setProducts(sortSheetsByUpdatedAtDesc((data ?? []).map((row) => rowToSheet(row as DbCostSheetRow))));
        setLoading(false);
        return;
      }

      const local = readLocalSheets();
      const rows = local?.sheets?.length ? sortSheetsByUpdatedAtDesc(local.sheets) : [createDemoSheet()];
      if (cancelled) return;
      setProducts(rows);
      setLoading(false);
    }

    void loadProducts();
    return () => {
      cancelled = true;
    };
  }, [authReady, isCloudMode, supabase, toast, userId]);

  async function signOut() {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast("error", error.message);
        return;
      }
    }
    setSession(null);
    goToWelcomePage();
  }

  function openSettings() {
    window.location.assign("/settings");
  }

  async function deleteProduct(productId: string): Promise<void> {
    if (deletingProductId) return;
    setDeletingProductId(productId);

    try {
      if (isCloudMode && supabase) {
        const { error } = await supabase.from("cost_sheets").delete().eq("id", productId);
        if (error) {
          toast("error", error.message);
          return;
        }
      }

      setProducts((prev) => {
        const next = prev.filter((sheet) => sheet.id !== productId);
        if (!isCloudMode) {
          const local = readLocalSheets();
          const selectedId = local?.selectedId ?? null;
          const nextSelectedId =
            selectedId === productId ? (next[0]?.id ?? null) : selectedId;
          writeLocalSheets(next, nextSelectedId);
        }
        return next;
      });
      toast("success", "Product deleted.");
    } finally {
      setDeletingProductId(null);
    }
  }

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((sheet) => {
      return sheet.name.toLowerCase().includes(q) || sheet.sku.toLowerCase().includes(q);
    });
  }, [products, query]);

  return (
    <div className="min-h-[calc(100dvh-var(--app-shell-topbar-height))]">
      <MainNavMenu
        activeItem="Products"
        onUnimplementedNavigate={(section) => toast("info", `${section} section coming soon.`)}
        onSettings={openSettings}
        onLogout={() => void signOut()}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search products by name or code"
        profileLabel={session?.user?.email || "Profile"}
      />

      <div className="px-2 pb-6 pt-3 sm:px-3 sm:pb-7 sm:pt-4 lg:px-4 lg:pb-8 lg:pt-5">
        <div className="flex min-h-[calc(100dvh-var(--app-shell-topbar-height)-2.25rem)] sm:min-h-[calc(100dvh-var(--app-shell-topbar-height)-2.75rem)] lg:min-h-[calc(100dvh-var(--app-shell-topbar-height)-3.25rem)] w-full flex-col animate-[fadeUp_.45s_ease-out]">
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-serif text-4xl leading-[1.08] tracking-tight text-ink">Products</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Browse all product cost sheets, open details with tabbed insights, or jump into the calculator for edits.
              </p>
              {!supabase ? (
                <p className="mt-2 text-xs text-muted">
                  {supabaseError || "Supabase is not configured. Product data remains local in this browser."}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95 active:translate-y-px"
                onClick={() => window.location.assign("/calculator?new=1")}
              >
                New product
              </button>
            </div>
          </header>

          <GlobalAppToast notice={notice} />

          <section className={cardClassName() + " mt-6 overflow-hidden"}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="font-mono text-xs text-muted">
                {loading ? "Loading products..." : `${filteredProducts.length} product(s)`}
              </p>
              <p className="font-mono text-xs text-muted">{isCloudMode ? "Cloud mode" : "Local mode"}</p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-paper/55">
                  <tr>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Product</th>
                    <th className="w-[100px] min-w-[100px] max-w-[100px] px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Unit Cost</th>
                    <th className="w-[100px] min-w-[100px] max-w-[100px] px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Suggested Price</th>
                    <th className="w-[100px] min-w-[100px] max-w-[100px] px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Profit Margin</th>
                    <th className="w-[100px] min-w-[100px] max-w-[100px] px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Batch Total</th>
                    <th className="w-[200px] min-w-[200px] max-w-[200px] px-3 py-2 font-mono text-xs font-semibold text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((sheet) => {
                    const totals = computeTotals(sheet);
                    return (
                      <tr key={sheet.id}>
                        <td className="p-2 font-semibold text-ink">{sheet.name || "Untitled"}</td>
                        <td className="w-[100px] min-w-[100px] max-w-[100px] p-2 font-mono text-xs text-ink">
                          {totals.costPerUnitCents === null
                            ? "--"
                            : formatMoney(totals.costPerUnitCents)}
                        </td>
                        <td className="w-[100px] min-w-[100px] max-w-[100px] p-2 font-mono text-xs text-ink">
                          {totals.pricePerUnitCents === null
                            ? "--"
                            : formatMoney(totals.pricePerUnitCents)}
                        </td>
                        <td className="w-[100px] min-w-[100px] max-w-[100px] p-2 font-mono text-xs text-muted">
                          {totals.marginPct === null ? "--" : `${totals.marginPct.toFixed(1)}%`}
                        </td>
                        <td className="w-[100px] min-w-[100px] max-w-[100px] p-2 font-mono text-xs text-ink">{formatMoney(totals.batchTotalCents)}</td>
                        <td className="w-[200px] min-w-[200px] max-w-[200px] p-2">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              className="rounded-lg border border-border bg-paper/55 px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-paper/70"
                              onClick={() => window.location.assign(`/products/${sheet.id}`)}
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-border bg-paper/55 px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-paper/70"
                              onClick={() => window.location.assign("/calculator")}
                            >
                              Calculator
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-border bg-danger/10 px-2.5 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => void deleteProduct(sheet.id)}
                              disabled={deletingProductId === sheet.id}
                            >
                              {deletingProductId === sheet.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!loading && !filteredProducts.length ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                        No products found. Create one from the top bar quick action.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <MainContentStatusFooter
            userLabel={session ? user?.email || user?.id : null}
            syncLabel="products sync via Supabase"
            guestLabel="products saved in this browser (localStorage)"
          />
        </div>
      </div>
    </div>
  );
}

