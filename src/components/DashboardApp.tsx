"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { computeTotals, createDemoSheet } from "@/lib/costing";
import type { CostSheet, StoredData } from "@/lib/costing";
import { formatShortDate } from "@/lib/format";
import { formatCentsWithSettingsSymbol } from "@/lib/currency";
import { parseStoredDataJson } from "@/lib/importExport";
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

export default function DashboardApp() {
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
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [sheets, setSheets] = useState<CostSheet[]>([]);
  const [query, setQuery] = useState("");

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

  const formatAppDate = useCallback(
    (iso: string) =>
      formatShortDate(iso, {
        dateFormat: settings.dateFormat,
        timezone: settings.timezone,
      }),
    [settings.dateFormat, settings.timezone],
  );

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

    async function loadSheets() {
      setLoadingSheets(true);

      if (isCloudMode && userId && supabase) {
        const { data, error } = await supabase
          .from("cost_sheets")
          .select("*")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });

        if (cancelled) return;
        if (error) {
          toast("error", error.message);
          setSheets([]);
          setLoadingSheets(false);
          return;
        }

        const nextSheets = sortSheetsByUpdatedAtDesc((data ?? []).map((row) => rowToSheet(row as DbCostSheetRow)));
        if (!nextSheets.length) {
          const demo = createDemoSheet();
          setSheets([demo]);
          setLoadingSheets(false);
          return;
        }

        setSheets(nextSheets);
        setLoadingSheets(false);
        return;
      }

      const local = readLocalSheets();
      const nextSheets = local?.sheets?.length ? sortSheetsByUpdatedAtDesc(local.sheets) : [createDemoSheet()];
      if (!local?.sheets?.length) {
        writeLocalSheets(nextSheets, nextSheets[0]?.id ?? null);
      }

      if (cancelled) return;
      setSheets(nextSheets);
      setLoadingSheets(false);
    }

    void loadSheets();
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

  const filteredSheets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sheets;
    return sheets.filter((sheet) => {
      return sheet.name.toLowerCase().includes(q) || sheet.sku.toLowerCase().includes(q);
    });
  }, [query, sheets]);

  const dashboardRows = useMemo(
    () => filteredSheets.map((sheet) => ({ sheet, totals: computeTotals(sheet) })),
    [filteredSheets],
  );

  const kpis = useMemo(() => {
    const base = {
      totalCostCents: 0,
      totalMaterialsCents: 0,
      totalLaborCents: 0,
      marginValues: [] as number[],
    };

    for (const row of dashboardRows) {
      base.totalCostCents += row.totals.batchTotalCents;
      base.totalMaterialsCents += row.totals.materialsWithWasteCents;
      base.totalLaborCents += row.totals.laborSubtotalCents;
      if (row.totals.marginPct !== null) base.marginValues.push(row.totals.marginPct);
    }

    const averageMarginPct =
      base.marginValues.length > 0
        ? Math.round(
            (base.marginValues.reduce((sum, value) => sum + value, 0) / base.marginValues.length) * 10,
          ) / 10
        : 0;

    return {
      totalCostCents: base.totalCostCents,
      totalMaterialsCents: base.totalMaterialsCents,
      totalLaborCents: base.totalLaborCents,
      averageMarginPct,
    };
  }, [dashboardRows]);

  const composition = useMemo(() => {
    const overhead = dashboardRows.reduce((sum, row) => sum + row.totals.overheadTotalCents, 0);
    const total = Math.max(kpis.totalMaterialsCents + kpis.totalLaborCents + overhead, 1);
    return {
      materialsPct: (kpis.totalMaterialsCents / total) * 100,
      laborPct: (kpis.totalLaborCents / total) * 100,
      overheadPct: (overhead / total) * 100,
      overheadCents: overhead,
    };
  }, [dashboardRows, kpis.totalLaborCents, kpis.totalMaterialsCents]);

  const marginLeaders = useMemo(() => {
    return dashboardRows
      .filter((row) => row.totals.marginPct !== null)
      .sort((a, b) => (b.totals.marginPct ?? 0) - (a.totals.marginPct ?? 0))
      .slice(0, 6);
  }, [dashboardRows]);

  const maxLeaderMargin = useMemo(
    () => Math.max(1, ...marginLeaders.map((row) => row.totals.marginPct ?? 0)),
    [marginLeaders],
  );

  const recentProducts = useMemo(
    () => [...dashboardRows].sort((a, b) => Date.parse(b.sheet.updatedAt) - Date.parse(a.sheet.updatedAt)).slice(0, 10),
    [dashboardRows],
  );

  return (
    <div className="min-h-dvh">
      <MainNavMenu
        activeItem="Dashboard"
        onUnimplementedNavigate={(section) => toast("info", `${section} section coming soon.`)}
        onSettings={openSettings}
        onLogout={() => void signOut()}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search products or SKU"
        onQuickAdd={() => window.location.assign("/calculator")}
        quickAddLabel="+ New Product"
        profileLabel={session?.user?.email || "Profile"}
      />

      <div className="px-2 pb-6 pt-3 sm:px-3 sm:pb-7 sm:pt-4 lg:px-4 lg:pb-8 lg:pt-5">
        <div className="flex min-h-[calc(100dvh-var(--app-shell-topbar-height)-2rem)] w-full flex-col animate-[fadeUp_.45s_ease-out]">
          <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <h1 className="font-serif text-4xl leading-[1.08] tracking-tight text-ink">Dashboard</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Overview of total costs, margin health, and recent products. Use the top bar to search and jump
                quickly into product details or the cost calculator.
              </p>
              {!supabase ? (
                <p className="mt-2 text-xs text-muted">
                  {supabaseError || "Supabase is not configured. Dashboard data remains local in this browser."}
                </p>
              ) : null}
            </div>
          </header>

          {notice ? (
            <div
              className={[
                "mt-6 rounded-2xl border border-border px-4 py-3 text-sm",
                notice.kind === "error"
                  ? "bg-danger/10 text-danger"
                  : notice.kind === "success"
                    ? "bg-accent/10 text-ink"
                    : "bg-paper/55 text-ink",
              ].join(" ")}
              role="status"
              aria-live="polite"
            >
              {notice.message}
            </div>
          ) : null}

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Total Cost" value={formatMoney(kpis.totalCostCents)} note={`${dashboardRows.length} product(s)`} />
            <KpiCard
              label="Profit Margin"
              value={`${kpis.averageMarginPct.toFixed(1)}%`}
              note={dashboardRows.length ? "Average across priced products" : "No product pricing yet"}
            />
            <KpiCard
              label="Material Cost"
              value={formatMoney(kpis.totalMaterialsCents)}
              note={dashboardRows.length ? "With waste applied" : "No materials recorded"}
            />
            <KpiCard
              label="Labor Cost"
              value={formatMoney(kpis.totalLaborCents)}
              note={dashboardRows.length ? "Total labor spend" : "No labor recorded"}
            />
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-2">
            <article className={cardClassName() + " p-5"}>
              <h2 className="font-serif text-2xl tracking-tight text-ink">Cost Composition</h2>
              <p className="mt-1 text-sm text-muted">Aggregate split across materials, labor, and overhead.</p>

              <div className="mt-6 overflow-hidden rounded-full border border-border bg-zinc-200/80">
                <div className="flex h-4 w-full">
                  <div className="bg-accent" style={{ width: `${composition.materialsPct}%` }} />
                  <div className="bg-emerald-500" style={{ width: `${composition.laborPct}%` }} />
                  <div className="bg-amber-500" style={{ width: `${composition.overheadPct}%` }} />
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-ink sm:grid-cols-3">
                <LegendRow label="Materials" value={formatMoney(kpis.totalMaterialsCents)} colorClass="bg-accent" />
                <LegendRow label="Labor" value={formatMoney(kpis.totalLaborCents)} colorClass="bg-emerald-500" />
                <LegendRow label="Overhead" value={formatMoney(composition.overheadCents)} colorClass="bg-amber-500" />
              </div>
            </article>

            <article className={cardClassName() + " p-5"}>
              <h2 className="font-serif text-2xl tracking-tight text-ink">Top Margins</h2>
              <p className="mt-1 text-sm text-muted">Highest margin products based on current pricing setup.</p>

              <div className="mt-5 space-y-3">
                {marginLeaders.length ? (
                  marginLeaders.map((row) => {
                    const margin = row.totals.marginPct ?? 0;
                    const width = (margin / maxLeaderMargin) * 100;
                    return (
                      <div key={row.sheet.id}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <p className="truncate font-semibold text-ink">{row.sheet.name || "Untitled"}</p>
                          <p className="font-mono text-xs text-muted">{margin.toFixed(1)}%</p>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-zinc-200/70">
                          <div className="h-2 rounded-full bg-accent2" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-xl border border-border bg-paper/55 px-3 py-2 text-sm text-muted">
                    No priced products yet. Set markup on a product in the calculator to populate this chart.
                  </p>
                )}
              </div>
            </article>
          </section>

          <section className={cardClassName() + " mt-6 overflow-hidden"}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="font-mono text-xs text-muted">
                {loadingSheets ? "Loading products..." : `${recentProducts.length} recent product(s)`}
              </p>
              <p className="font-mono text-xs text-muted">{isCloudMode ? "Cloud mode" : "Local mode"}</p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="bg-paper/55">
                  <tr>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Product</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">SKU</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Batch Total</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Margin</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Updated</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentProducts.map((row) => (
                    <tr key={row.sheet.id}>
                      <td className="p-2 font-semibold text-ink">{row.sheet.name || "Untitled"}</td>
                      <td className="p-2 font-mono text-xs text-muted">{row.sheet.sku || "-"}</td>
                      <td className="p-2 font-mono text-xs text-ink">
                        {formatMoney(row.totals.batchTotalCents)}
                      </td>
                      <td className="p-2 font-mono text-xs text-muted">
                        {row.totals.marginPct === null ? "--" : `${row.totals.marginPct.toFixed(1)}%`}
                      </td>
                      <td className="p-2 font-mono text-xs text-muted">{formatAppDate(row.sheet.updatedAt)}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-lg border border-border bg-paper/55 px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-paper/70"
                            onClick={() => window.location.assign(`/products/${row.sheet.id}`)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-border bg-paper/55 px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-paper/70"
                            onClick={() => window.location.assign("/calculator")}
                          >
                            Calculate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {!loadingSheets && !recentProducts.length ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                        No products matched your search. Try a different term or create a new product from the top bar.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <MainContentStatusFooter
            userLabel={session ? user?.email || user?.id : null}
            syncLabel="dashboard sync via Supabase"
            guestLabel="saved in this browser (localStorage)"
            className="-mb-6 sm:-mb-7 lg:-mb-8"
          />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
      <p className="font-mono text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-2 text-xs text-muted">{note}</p>
    </article>
  );
}

function LegendRow({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={["h-2.5 w-2.5 rounded-full", colorClass].join(" ")} />
      <p className="font-mono text-xs text-muted">{label}:</p>
      <p className="font-mono text-xs text-ink">{value}</p>
    </div>
  );
}

