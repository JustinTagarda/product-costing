"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { computeTotals } from "@/lib/costing";
import type { CostSheet, StoredData } from "@/lib/costing";
import { formatShortDate } from "@/lib/format";
import { currencyCodeFromSettings, formatCentsWithSettingsSymbol } from "@/lib/currency";
import { parseStoredDataJson } from "@/lib/importExport";
import { GlobalAppToast } from "@/components/GlobalAppToast";
import { MainContentStatusFooter } from "@/components/MainContentStatusFooter";
import { MainNavMenu } from "@/components/MainNavMenu";
import { getSupabaseClient } from "@/lib/supabase/client";
import { goToWelcomePage } from "@/lib/navigation";
import { rowToSheet, type DbCostSheetRow } from "@/lib/supabase/costSheets";
import { useAppSettings } from "@/lib/useAppSettings";

type Notice = { kind: "info" | "success" | "error"; message: string };
type TabKey = "overview" | "cost-breakdown" | "history" | "notes";

const LOCAL_STORAGE_KEY = "product-costing:local:v1";

function cardClassName(): string {
  return [
    "rounded-2xl border border-border bg-card/80",
    "shadow-[0_18px_55px_rgba(0,0,0,.08)]",
    "backdrop-blur-md",
  ].join(" ");
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

export default function ProductDetailsApp() {
  const params = useParams<{ productId: string }>();
  const productId = typeof params?.productId === "string" ? decodeURIComponent(params.productId) : "";

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
  const [sheet, setSheet] = useState<CostSheet | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
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

  const settingsCurrencyCode = useMemo(
    () => currencyCodeFromSettings(settings.baseCurrency),
    [settings.baseCurrency],
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
    if (!authReady || !productId) return;
    let cancelled = false;

    async function loadProduct() {
      setLoading(true);

      if (isCloudMode && userId && supabase) {
        const { data, error } = await supabase
          .from("cost_sheets")
          .select("*")
          .eq("user_id", userId)
          .eq("id", productId)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          toast("error", error.message);
          setSheet(null);
          setLoading(false);
          return;
        }

        setSheet(data ? rowToSheet(data as DbCostSheetRow) : null);
        setLoading(false);
        return;
      }

      const local = readLocalSheets();
      const found = local?.sheets?.find((item) => item.id === productId) ?? null;
      if (cancelled) return;
      setSheet(found);
      setLoading(false);
    }

    void loadProduct();
    return () => {
      cancelled = true;
    };
  }, [authReady, isCloudMode, productId, supabase, toast, userId]);

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

  const totals = useMemo(() => (sheet ? computeTotals(sheet) : null), [sheet]);

  const breakdownRows = useMemo(() => {
    if (!sheet) return [] as Array<{
      category: "Material" | "Labor" | "Overhead";
      label: string;
      quantity: string;
      totalCents: number;
    }>;

    const q = query.trim().toLowerCase();

    const materialRows = sheet.materials.map((item) => ({
      category: "Material" as const,
      label: item.name || "Unnamed material",
      quantity: `${item.qty} ${item.unit}`,
      totalCents: Math.round(item.qty * item.unitCostCents),
    }));

    const laborRows = sheet.labor.map((item) => ({
      category: "Labor" as const,
      label: item.role || "Unnamed role",
      quantity: `${item.hours} hr`,
      totalCents: Math.round(item.hours * item.rateCents),
    }));

    const overheadRows = sheet.overhead.map((item) => ({
      category: "Overhead" as const,
      label: item.name || "Unnamed overhead",
      quantity: item.kind === "flat" ? "Flat" : `${item.percent}%`,
      totalCents: item.kind === "flat" ? item.amountCents : 0,
    }));

    const merged = [...materialRows, ...laborRows, ...overheadRows];
    if (!q) return merged;
    return merged.filter((row) => {
      return row.label.toLowerCase().includes(q) || row.category.toLowerCase().includes(q);
    });
  }, [query, sheet]);

  return (
    <div className="min-h-[calc(100dvh-var(--app-shell-topbar-height))]">
      <MainNavMenu
        activeItem="Products"
        onUnimplementedNavigate={(section) => toast("info", `${section} section coming soon.`)}
        onSettings={openSettings}
        onLogout={() => void signOut()}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Filter product lines, categories, notes"
        onQuickAdd={() => window.location.assign("/calculator")}
        quickAddLabel="+ New Product"
        profileLabel={session?.user?.email || "Profile"}
      />

      <div className="px-2 pb-6 pt-3 sm:px-3 sm:pb-7 sm:pt-4 lg:px-4 lg:pb-8 lg:pt-5">
        <div className="flex min-h-[calc(100dvh-var(--app-shell-topbar-height)-2.25rem)] sm:min-h-[calc(100dvh-var(--app-shell-topbar-height)-2.75rem)] lg:min-h-[calc(100dvh-var(--app-shell-topbar-height)-3.25rem)] w-full flex-col animate-[fadeUp_.45s_ease-out]">
          <header>
            <h1 className="font-serif text-4xl leading-[1.08] tracking-tight text-ink">Product Details</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Header information, cost breakdown, change history, and notes for a single product.
            </p>
            {!supabase ? (
              <p className="mt-2 text-xs text-muted">
                {supabaseError || "Supabase is not configured. Product detail data is local only."}
              </p>
            ) : null}
          </header>

          <GlobalAppToast notice={notice} />

          {loading ? (
            <section className={cardClassName() + " mt-6 p-6"}>
              <p className="font-mono text-xs text-muted">Loading product details...</p>
            </section>
          ) : null}

          {!loading && !sheet ? (
            <section className={cardClassName() + " mt-6 p-6"}>
              <h2 className="font-serif text-2xl tracking-tight text-ink">Product not found</h2>
              <p className="mt-2 text-sm text-muted">
                The requested product id was not found. Open the product list to pick an existing product.
              </p>
              <button
                type="button"
                className="mt-4 rounded-xl border border-border bg-paper/55 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-paper/70"
                onClick={() => window.location.assign("/products")}
              >
                Back to Products
              </button>
            </section>
          ) : null}

          {sheet && totals ? (
            <>
              <section className={cardClassName() + " mt-6 p-5"}>
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                  <div>
                    <p className="font-mono text-xs text-muted">Product ID: {sheet.id}</p>
                    <h2 className="mt-2 font-serif text-3xl tracking-tight text-ink">{sheet.name || "Untitled"}</h2>
                    <p className="mt-1 font-mono text-xs text-muted">SKU: {sheet.sku || "-"}</p>
                  </div>
                  <div className="grid gap-2 text-sm text-muted sm:grid-cols-2">
                    <div className="rounded-xl border border-border bg-paper/55 px-3 py-2">
                      <p className="font-mono text-xs">Batch</p>
                      <p className="mt-1 font-semibold text-ink">
                        {sheet.batchSize} {sheet.unitName}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-paper/55 px-3 py-2">
                      <p className="font-mono text-xs">Currency</p>
                      <p className="mt-1 font-semibold text-ink">{settingsCurrencyCode}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard label="Batch Total" value={formatMoney(totals.batchTotalCents)} />
                  <KpiCard
                    label="Unit Cost"
                    value={
                      totals.costPerUnitCents === null
                        ? "--"
                        : formatMoney(totals.costPerUnitCents)
                    }
                  />
                  <KpiCard
                    label="Suggested Price"
                    value={
                      totals.pricePerUnitCents === null
                        ? "--"
                        : formatMoney(totals.pricePerUnitCents)
                    }
                  />
                  <KpiCard
                    label="Profit Margin"
                    value={totals.marginPct === null ? "--" : `${totals.marginPct.toFixed(1)}%`}
                  />
                </div>
              </section>

              <section className={cardClassName() + " mt-6 p-4"}>
                <div className="flex flex-wrap gap-2">
                  <TabButton label="Overview" active={activeTab === "overview"} onClick={() => setActiveTab("overview")} />
                  <TabButton
                    label="Cost Breakdown"
                    active={activeTab === "cost-breakdown"}
                    onClick={() => setActiveTab("cost-breakdown")}
                  />
                  <TabButton label="History" active={activeTab === "history"} onClick={() => setActiveTab("history")} />
                  <TabButton label="Notes" active={activeTab === "notes"} onClick={() => setActiveTab("notes")} />
                </div>

                {activeTab === "overview" ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <InfoCard label="Materials + Waste" value={formatMoney(totals.materialsWithWasteCents)} />
                    <InfoCard label="Labor" value={formatMoney(totals.laborSubtotalCents)} />
                    <InfoCard label="Overhead" value={formatMoney(totals.overheadTotalCents)} />
                    <InfoCard label="Markup %" value={`${sheet.markupPct}%`} />
                    <InfoCard label="Tax %" value={`${sheet.taxPct}%`} />
                    <InfoCard label="Waste %" value={`${sheet.wastePct}%`} />
                  </div>
                ) : null}

                {activeTab === "cost-breakdown" ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-border bg-paper/45 px-3 py-2 text-sm text-muted">
                      Cost lines filtered by top bar search: <span className="font-mono text-ink">{query || "(none)"}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-[760px] w-full text-left text-sm">
                        <thead className="bg-paper/55">
                          <tr>
                            <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Category</th>
                            <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Line</th>
                            <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Qty / Basis</th>
                            <th className="px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {breakdownRows.map((row, index) => (
                            <tr key={`${row.category}-${row.label}-${index}`}>
                              <td className="p-2 font-mono text-xs text-muted">{row.category}</td>
                              <td className="p-2 text-ink">{row.label}</td>
                              <td className="p-2 font-mono text-xs text-muted">{row.quantity}</td>
                              <td className="p-2 font-mono text-xs text-ink">{formatMoney(row.totalCents)}</td>
                            </tr>
                          ))}

                          {!breakdownRows.length ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
                                No cost lines match your current search.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {activeTab === "history" ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <InfoCard label="Created" value={formatAppDate(sheet.createdAt)} />
                    <InfoCard label="Last Updated" value={formatAppDate(sheet.updatedAt)} />
                    <InfoCard
                      label="Mode"
                      value={isCloudMode ? "Cloud sync (Supabase)" : "Local browser storage"}
                    />
                    <InfoCard label="Items" value={`${sheet.materials.length + sheet.labor.length + sheet.overhead.length} line(s)`} />
                  </div>
                ) : null}

                {activeTab === "notes" ? (
                  <div className="mt-4 rounded-xl border border-border bg-paper/45 p-4 text-sm text-ink">
                    {sheet.notes ? (
                      <p className="whitespace-pre-wrap leading-6">{sheet.notes}</p>
                    ) : (
                      <p className="text-muted">No notes saved for this product yet.</p>
                    )}
                  </div>
                ) : null}
              </section>
            </>
          ) : null}

          <MainContentStatusFooter
            userLabel={session ? user?.email || user?.id : null}
            syncLabel="product detail sync via Supabase"
            guestLabel="product details loaded from localStorage"
          />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-border bg-paper/55 p-4">
      <p className="font-mono text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-ink">{value}</p>
    </article>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-border bg-paper/55 px-3 py-3">
      <p className="font-mono text-xs text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </article>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "rounded-lg border px-3 py-2 text-sm font-semibold transition",
        active
          ? "border-accent bg-accent/10 text-ink"
          : "border-border bg-paper/55 text-ink hover:bg-paper/70",
      ].join(" ")}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

