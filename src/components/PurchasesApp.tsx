"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { MainNavMenu } from "@/components/MainNavMenu";
import { makeId } from "@/lib/costing";
import { currencySymbol, formatCents, formatShortDate } from "@/lib/format";
import {
  createDemoMaterials,
  readLocalMaterialRecords,
  writeLocalMaterialRecords,
  type MaterialRecord,
} from "@/lib/materials";
import {
  computePurchaseTotalCents,
  createDemoPurchases,
  currentDateInputValue,
  LOCAL_PURCHASES_STORAGE_KEY,
  makeBlankPurchase,
  sortPurchasesByDateDesc,
  type PurchaseRecord,
} from "@/lib/purchases";
import { getSupabaseClient } from "@/lib/supabase/client";
import { type DbMaterialRow, rowToMaterial } from "@/lib/supabase/materials";
import {
  makeBlankPurchaseInsert,
  purchaseToRowUpdate,
  rowToPurchase,
  type DbPurchaseRow,
} from "@/lib/supabase/purchases";
import { useAppSettings } from "@/lib/useAppSettings";

type Notice = { kind: "info" | "success" | "error"; message: string };

type MaterialOption = Pick<
  MaterialRecord,
  "id" | "name" | "supplier" | "unit" | "isActive" | "lastPurchaseCostCents" | "lastPurchaseDate"
>;

const inputBase =
  "w-full rounded-xl border border-border bg-paper/65 px-3 py-2 text-sm text-ink placeholder:text-muted/80 outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15";
const inputMono = "tabular-nums font-mono tracking-tight";

function parseNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseMoneyToCents(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

function centsToMoneyString(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  return (safe / 100).toFixed(2);
}

function cardClassName(): string {
  return [
    "rounded-2xl border border-border bg-card/80",
    "shadow-[0_18px_55px_rgba(0,0,0,.08)]",
    "backdrop-blur-md",
  ].join(" ");
}

function toMaterialOption(material: MaterialRecord): MaterialOption {
  return {
    id: material.id,
    name: material.name,
    supplier: material.supplier,
    unit: material.unit,
    isActive: material.isActive,
    lastPurchaseCostCents: material.lastPurchaseCostCents,
    lastPurchaseDate: material.lastPurchaseDate,
  };
}

function parseLocalPurchases(raw: unknown): PurchaseRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Partial<PurchaseRecord>;
      const id = typeof row.id === "string" ? row.id : makeId("pur");
      const fallback = makeBlankPurchase(id);
      const quantityRaw = Number(row.quantity);
      const unitCostRaw = Number(row.unitCostCents);
      const quantity = Number.isFinite(quantityRaw) ? Math.max(0, quantityRaw) : fallback.quantity;
      const unitCostCents = Number.isFinite(unitCostRaw)
        ? Math.max(0, Math.round(unitCostRaw))
        : fallback.unitCostCents;
      return {
        ...fallback,
        ...row,
        id,
        purchaseDate:
          typeof row.purchaseDate === "string" && row.purchaseDate
            ? row.purchaseDate
            : fallback.purchaseDate,
        materialId: typeof row.materialId === "string" ? row.materialId : null,
        materialName: typeof row.materialName === "string" ? row.materialName : fallback.materialName,
        supplier: typeof row.supplier === "string" ? row.supplier : fallback.supplier,
        quantity,
        unit: typeof row.unit === "string" ? row.unit : fallback.unit,
        unitCostCents,
        totalCostCents: computePurchaseTotalCents(quantity, unitCostCents),
        currency: typeof row.currency === "string" ? row.currency.toUpperCase() : fallback.currency,
        referenceNo: typeof row.referenceNo === "string" ? row.referenceNo : fallback.referenceNo,
        notes: typeof row.notes === "string" ? row.notes : fallback.notes,
      };
    });
}

function readLocalPurchases(): PurchaseRecord[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_PURCHASES_STORAGE_KEY);
    if (!raw) return [];
    return parseLocalPurchases(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeLocalPurchases(purchases: PurchaseRecord[]): void {
  try {
    if (!purchases.length) {
      window.localStorage.removeItem(LOCAL_PURCHASES_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(LOCAL_PURCHASES_STORAGE_KEY, JSON.stringify(purchases));
  } catch {
    // Ignore storage failures.
  }
}

export default function PurchasesApp() {
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
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [query, setQuery] = useState("");

  const user = session?.user ?? null;
  const userId = user?.id ?? null;
  const isCloudMode = Boolean(userId && supabase);

  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const hasHydratedRef = useRef(false);

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

  const materialById = useMemo(() => {
    return new Map(materials.map((item) => [item.id, item]));
  }, [materials]);

  const formatAppDate = useCallback(
    (iso: string) =>
      formatShortDate(iso, {
        dateFormat: settings.dateFormat,
        timezone: settings.timezone,
      }),
    [settings.dateFormat, settings.timezone],
  );

  const formatMoney = useCallback(
    (cents: number, currency = settings.baseCurrency) =>
      formatCents(cents, currency, {
        currencyDisplay: settings.currencyDisplay,
        roundingIncrementCents: settings.currencyRoundingIncrement,
        roundingMode: settings.currencyRoundingMode,
      }),
    [
      settings.baseCurrency,
      settings.currencyDisplay,
      settings.currencyRoundingIncrement,
      settings.currencyRoundingMode,
    ],
  );

  const currencyPrefix = useMemo(
    () =>
      settings.currencyDisplay === "code"
        ? settings.baseCurrency
        : currencySymbol(settings.baseCurrency),
    [settings.baseCurrency, settings.currencyDisplay],
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
    const timers = saveTimersRef.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;

    async function loadData() {
      hasHydratedRef.current = false;
      setLoading(true);

      if (isCloudMode && userId && supabase) {
        const [purchasesRes, materialsRes] = await Promise.all([
          supabase
            .from("purchases")
            .select("*")
            .eq("user_id", userId)
            .order("purchase_date", { ascending: false })
            .order("updated_at", { ascending: false }),
          supabase.from("materials").select("*").eq("user_id", userId).order("name", { ascending: true }),
        ]);

        if (cancelled) return;

        if (purchasesRes.error) {
          toast("error", purchasesRes.error.message);
          setPurchases([]);
        } else {
          const rows = (purchasesRes.data ?? [])
            .map((row) => rowToPurchase(row as DbPurchaseRow))
            .map((row) => ({ ...row, currency: settings.baseCurrency }));
          setPurchases(sortPurchasesByDateDesc(rows));
        }

        if (materialsRes.error) {
          toast("error", materialsRes.error.message);
          setMaterials([]);
        } else {
          const mats = (materialsRes.data ?? []).map((row) => rowToMaterial(row as DbMaterialRow));
          setMaterials(
            mats.map((m) => ({
              id: m.id,
              name: m.name,
              supplier: m.supplier,
              unit: m.unit,
              isActive: m.isActive,
              lastPurchaseCostCents: m.lastPurchaseCostCents,
              lastPurchaseDate: m.lastPurchaseDate,
            })),
          );
        }

        hasHydratedRef.current = true;
        setLoading(false);
        return;
      }

      const localMaterialRecords = readLocalMaterialRecords();
      const baseMaterialRecords = localMaterialRecords.length ? localMaterialRecords : createDemoMaterials();
      const baseMaterials = baseMaterialRecords.map(toMaterialOption);
      if (!localMaterialRecords.length) writeLocalMaterialRecords(baseMaterialRecords);

      const localPurchases = readLocalPurchases();
      const nextPurchases = (
        localPurchases.length
          ? sortPurchasesByDateDesc(localPurchases)
          : createDemoPurchases(baseMaterials, { currency: settings.baseCurrency })
      ).map((row) => ({ ...row, currency: settings.baseCurrency }));
      if (!localPurchases.length) writeLocalPurchases(nextPurchases);

      if (cancelled) return;
      setMaterials(baseMaterials);
      setPurchases(nextPurchases);
      hasHydratedRef.current = true;
      setLoading(false);
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [authReady, isCloudMode, settings.baseCurrency, supabase, toast, userId]);

  useEffect(() => {
    if (!authReady || isCloudMode || !hasHydratedRef.current) return;
    writeLocalPurchases(purchases);
  }, [authReady, isCloudMode, purchases]);

  async function syncMaterialFromPurchase(next: PurchaseRecord): Promise<void> {
    if (!next.materialId) return;
    const updatedAt = new Date().toISOString();

    if (isCloudMode && supabase) {
      const { error } = await supabase
        .from("materials")
        .update({
          supplier: next.supplier,
          unit: next.unit,
          last_purchase_cost_cents: next.unitCostCents,
          last_purchase_date: next.purchaseDate || null,
          updated_at: updatedAt,
        })
        .eq("id", next.materialId);
      if (error) {
        toast("error", `Material sync failed: ${error.message}`);
      }
      return;
    }

    setMaterials((prev) => {
      const updated = prev.map((item) =>
        item.id === next.materialId
          ? {
              ...item,
              supplier: next.supplier,
              unit: next.unit,
              lastPurchaseCostCents: next.unitCostCents,
              lastPurchaseDate: next.purchaseDate,
            }
          : item,
      );
      return updated;
    });

    const localMaterials = readLocalMaterialRecords();
    if (!localMaterials.length) return;
    const nextMaterials = localMaterials.map((item) =>
      item.id === next.materialId
        ? {
            ...item,
            supplier: next.supplier,
            unit: next.unit,
            lastPurchaseCostCents: next.unitCostCents,
            lastPurchaseDate: next.purchaseDate,
            updatedAt,
          }
        : item,
    );
    writeLocalMaterialRecords(nextMaterials);
  }

  async function persistPurchase(next: PurchaseRecord): Promise<void> {
    if (!isCloudMode || !supabase) return;
    const { error } = await supabase
      .from("purchases")
      .update(purchaseToRowUpdate(next))
      .eq("id", next.id);
    if (error) {
      toast("error", `Save failed: ${error.message}`);
      return;
    }
    await syncMaterialFromPurchase(next);
  }

  function schedulePersist(next: PurchaseRecord): void {
    const currentTimer = saveTimersRef.current.get(next.id);
    if (currentTimer) window.clearTimeout(currentTimer);
    const timer = window.setTimeout(() => void persistPurchase(next), 420);
    saveTimersRef.current.set(next.id, timer);
  }

  function updatePurchase(id: string, updater: (row: PurchaseRecord) => PurchaseRecord): void {
    const now = new Date().toISOString();
    setPurchases((prev) => {
      let changed: PurchaseRecord | null = null;
      const next = prev.map((row) => {
        if (row.id !== id) return row;
        const updated = updater(row);
        const total = computePurchaseTotalCents(updated.quantity, updated.unitCostCents);
        const normalized: PurchaseRecord = {
          ...updated,
          quantity: Math.max(0, updated.quantity),
          unitCostCents: Math.max(0, Math.round(updated.unitCostCents)),
          totalCostCents: total,
          currency: settings.baseCurrency,
          updatedAt: now,
        };
        changed = normalized;
        return normalized;
      });

      if (changed && isCloudMode) schedulePersist(changed);
      if (changed && !isCloudMode) void syncMaterialFromPurchase(changed);
      return sortPurchasesByDateDesc(next);
    });
  }

  async function addPurchase() {
    const firstMaterial = materials[0] ?? null;
    const defaults = {
      currency: settings.baseCurrency,
      purchaseDate: currentDateInputValue(),
      materialId: firstMaterial?.id ?? null,
      materialName: firstMaterial?.name ?? "",
      supplier: firstMaterial?.supplier ?? "",
      unit: firstMaterial?.unit ?? settings.defaultMaterialUnit,
    };

    if (isCloudMode && supabase && userId) {
      const insert = makeBlankPurchaseInsert(userId, defaults);
      const { data, error } = await supabase.from("purchases").insert(insert).select("*");
      if (error || !data?.[0]) {
        toast("error", error?.message || "Could not create purchase.");
        return;
      }
      const row = rowToPurchase(data[0] as DbPurchaseRow);
      setPurchases((prev) => sortPurchasesByDateDesc([row, ...prev]));
      await syncMaterialFromPurchase(row);
      toast("success", "Purchase created.");
      return;
    }

    const row = makeBlankPurchase(makeId("pur"), defaults);
    setPurchases((prev) => sortPurchasesByDateDesc([row, ...prev]));
    await syncMaterialFromPurchase(row);
    toast("success", "Local purchase created.");
  }

  async function deletePurchase(id: string) {
    if (isCloudMode && supabase) {
      const { error } = await supabase.from("purchases").delete().eq("id", id);
      if (error) {
        toast("error", error.message);
        return;
      }
    }
    setPurchases((prev) => prev.filter((row) => row.id !== id));
    toast("info", "Purchase deleted.");
  }

  async function signOut() {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast("error", error.message);
        return;
      }
    }
    setSession(null);
    window.location.assign("/");
  }

  function openSettings() {
    window.location.assign("/settings");
  }

  const filteredPurchases = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter((row) => {
      return (
        row.purchaseDate.toLowerCase().includes(q) ||
        row.materialName.toLowerCase().includes(q) ||
        row.supplier.toLowerCase().includes(q) ||
        row.referenceNo.toLowerCase().includes(q) ||
        row.notes.toLowerCase().includes(q)
      );
    });
  }, [purchases, query]);

  if (!authReady) {
    return (
      <div className="px-4 py-10">
        <div className="mx-auto max-w-[1400px] animate-[fadeUp_.45s_ease-out]">
          <div className="h-6 w-40 rounded bg-ink/10" />
          <div className={cardClassName() + " mt-6 h-[420px]"} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <MainNavMenu
        activeItem="Purchases"
        onUnimplementedNavigate={(section) => toast("info", `${section} section coming soon.`)}
        onSettings={openSettings}
        onLogout={() => void signOut()}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search purchases..."
        onQuickAdd={() => void addPurchase()}
        quickAddLabel="+ New Purchase"
        profileLabel={session?.user?.email || "Profile"}
      />

      <div className="px-4 py-10">
        <div className="mx-auto max-w-[1400px] animate-[fadeUp_.55s_ease-out]">
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-mono text-xs text-muted">
                {session ? (
                  <>
                    Signed in as <span className="select-all">{user?.email || user?.id}</span>{" "}
                    <span className="text-muted">- purchases sync via Supabase</span>
                  </>
                ) : (
                  <>
                    Guest mode <span className="text-muted">- saved in this browser (localStorage)</span>
                  </>
                )}
              </p>
              <h1 className="mt-2 font-serif text-4xl leading-[1.08] tracking-tight text-ink">Purchases</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Record material purchases with supplier, quantity, unit cost, and references. Total cost is calculated
                automatically.
              </p>
              {!supabase ? (
                <p className="mt-2 text-xs text-muted">
                  {supabaseError || "Supabase is not configured. Purchases will stay local in this browser."}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                className={inputBase + " w-[240px]"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search purchases..."
                aria-label="Search purchases"
              />
              <button
                type="button"
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95 active:translate-y-px"
                onClick={() => void addPurchase()}
              >
                New purchase
              </button>
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

          <section className={cardClassName() + " mt-6 overflow-hidden"}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="font-mono text-xs text-muted">
                {loading ? "Loading purchases..." : `${filteredPurchases.length} purchase(s)`}
              </p>
              <p className="font-mono text-xs text-muted">
                {isCloudMode ? "Cloud mode" : "Local mode"}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1360px] w-full text-left text-sm">
                <thead className="bg-paper/55">
                  <tr>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Date</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Material</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Supplier</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Quantity</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Unit</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Unit Cost</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Total Cost</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Reference No</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Notes</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Updated</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.map((row) => (
                    <tr key={row.id} className="border-t border-border align-top">
                      <td className="p-2">
                        <input
                          className={inputBase + " " + inputMono}
                          type="date"
                          value={row.purchaseDate}
                          onChange={(e) =>
                            updatePurchase(row.id, (x) => ({
                              ...x,
                              purchaseDate: e.target.value || currentDateInputValue(),
                            }))
                          }
                        />
                      </td>
                      <td className="p-2">
                        <div className="space-y-2">
                          <select
                            className={inputBase}
                            value={row.materialId ?? ""}
                            onChange={(e) => {
                              const materialId = e.target.value || null;
                              const material = materialId ? materialById.get(materialId) : null;
                              updatePurchase(row.id, (x) => ({
                                ...x,
                                materialId,
                                materialName: material ? material.name : x.materialName,
                                supplier: material ? material.supplier : x.supplier,
                                unit: material ? material.unit : x.unit,
                              }));
                            }}
                          >
                            <option value="">Unlinked material</option>
                            {materials.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                                {item.isActive ? "" : " (inactive)"}
                              </option>
                            ))}
                          </select>
                          {row.materialId ? null : (
                            <input
                              className={inputBase}
                              value={row.materialName}
                              onChange={(e) =>
                                updatePurchase(row.id, (x) => ({ ...x, materialName: e.target.value }))
                              }
                              placeholder="Material name"
                            />
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        <input
                          className={inputBase}
                          value={row.supplier}
                          onChange={(e) =>
                            updatePurchase(row.id, (x) => ({ ...x, supplier: e.target.value }))
                          }
                          placeholder="Supplier"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className={inputBase + " " + inputMono}
                          type="number"
                          step={0.001}
                          min={0}
                          value={row.quantity}
                          onChange={(e) =>
                            updatePurchase(row.id, (x) => ({
                              ...x,
                              quantity: Math.max(0, parseNumber(e.target.value)),
                            }))
                          }
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className={inputBase}
                          value={row.unit}
                          onChange={(e) => updatePurchase(row.id, (x) => ({ ...x, unit: e.target.value }))}
                          placeholder="ea / kg / yd"
                        />
                      </td>
                      <td className="p-2">
                        <div className="relative">
                          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-xs text-muted">
                            {currencyPrefix}
                          </span>
                          <input
                            className={inputBase + " pl-7 " + inputMono}
                            type="number"
                            step={0.01}
                            min={0}
                            value={centsToMoneyString(row.unitCostCents)}
                            onChange={(e) =>
                              updatePurchase(row.id, (x) => ({
                                ...x,
                                unitCostCents: parseMoneyToCents(e.target.value),
                                currency: settings.baseCurrency,
                              }))
                            }
                          />
                        </div>
                      </td>
                      <td className="p-2">
                        <p className="rounded-xl border border-border bg-paper/50 px-3 py-2 font-mono text-sm text-ink">
                          {formatMoney(row.totalCostCents, settings.baseCurrency)}
                        </p>
                      </td>
                      <td className="p-2">
                        <input
                          className={inputBase + " " + inputMono}
                          value={row.referenceNo}
                          onChange={(e) =>
                            updatePurchase(row.id, (x) => ({ ...x, referenceNo: e.target.value }))
                          }
                          placeholder="PO-1001"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className={inputBase}
                          value={row.notes}
                          onChange={(e) => updatePurchase(row.id, (x) => ({ ...x, notes: e.target.value }))}
                          placeholder="Optional notes"
                        />
                      </td>
                      <td className="p-2 font-mono text-xs text-muted">{formatAppDate(row.updatedAt)}</td>
                      <td className="p-2">
                        <button
                          type="button"
                          className="rounded-lg border border-border bg-danger/10 px-2 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/15"
                          onClick={() => void deletePurchase(row.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}

                  {!loading && filteredPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-sm text-muted">
                        No purchases found. Create one using <span className="font-semibold">New purchase</span>.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="border-t border-border bg-paper/40 px-4 py-3 text-xs text-muted">
              Total purchases value:{" "}
              <span className="font-mono text-ink">
                {formatMoney(
                  filteredPurchases.reduce((sum, row) => sum + row.totalCostCents, 0),
                  settings.baseCurrency,
                )}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
