"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { MainNavMenu } from "@/components/MainNavMenu";
import { makeId } from "@/lib/costing";
import { formatShortDate } from "@/lib/format";
import { currencySymbolFromSettings, formatCentsWithSettingsSymbol } from "@/lib/currency";
import {
  createDemoMaterials,
  makeBlankMaterial,
  sortMaterialsByUpdatedAtDesc,
  type MaterialRecord,
} from "@/lib/materials";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAppSettings } from "@/lib/useAppSettings";
import {
  makeBlankMaterialInsert,
  materialToRowUpdate,
  rowToMaterial,
  type DbMaterialRow,
} from "@/lib/supabase/materials";

type Notice = { kind: "info" | "success" | "error"; message: string };

const inputBase =
  "w-full rounded-xl border border-border bg-paper/65 px-3 py-2 text-sm text-ink placeholder:text-muted/80 outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15";
const inputMono = "tabular-nums font-mono tracking-tight";
const LOCAL_STORAGE_KEY = "product-costing:materials:local:v1";

function parseMoneyToCents(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

function centsToMoneyString(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  return (safe / 100).toFixed(2);
}

function parseLocalMaterials(raw: unknown): MaterialRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Partial<MaterialRecord>;
      const fallback = makeBlankMaterial(typeof row.id === "string" ? row.id : makeId("mat"));
      return {
        ...fallback,
        ...row,
        unitCostCents: (() => {
          const n = Number(row.unitCostCents);
          return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback.unitCostCents;
        })(),
        lastPurchaseCostCents: (() => {
          const n = Number(row.lastPurchaseCostCents);
          return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback.lastPurchaseCostCents;
        })(),
        isActive: row.isActive !== undefined ? Boolean(row.isActive) : true,
      };
    });
}

function readLocalMaterials(): MaterialRecord[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return parseLocalMaterials(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeLocalMaterials(materials: MaterialRecord[]) {
  try {
    if (!materials.length) {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(materials));
  } catch {
    // Ignore localStorage failures.
  }
}

function cardClassName(): string {
  return [
    "rounded-2xl border border-border bg-card/80",
    "shadow-[0_18px_55px_rgba(0,0,0,.08)]",
    "backdrop-blur-md",
  ].join(" ");
}

export default function MaterialsApp() {
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
  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

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

  const formatAppDate = useCallback(
    (iso: string) =>
      formatShortDate(iso, {
        dateFormat: settings.dateFormat,
        timezone: settings.timezone,
      }),
    [settings.dateFormat, settings.timezone],
  );

  const currencyPrefix = useMemo(
    () => currencySymbolFromSettings(settings.baseCurrency),
    [settings.baseCurrency],
  );

  const formatSettingsMoney = useCallback(
    (cents: number) =>
      formatCentsWithSettingsSymbol(
        cents,
        settings.baseCurrency,
        settings.currencyRoundingIncrement,
        settings.currencyRoundingMode,
      ),
    [
      settings.baseCurrency,
      settings.currencyRoundingIncrement,
      settings.currencyRoundingMode,
    ],
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

    async function loadMaterials() {
      hasHydratedRef.current = false;
      setLoading(true);

      if (isCloudMode && userId && supabase) {
        const { data, error } = await supabase
          .from("materials")
          .select("*")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });

        if (cancelled) return;
        if (error) {
          toast("error", error.message);
          setMaterials([]);
          hasHydratedRef.current = true;
          setLoading(false);
          return;
        }

        setMaterials(sortMaterialsByUpdatedAtDesc((data ?? []).map((row) => rowToMaterial(row as DbMaterialRow))));
        hasHydratedRef.current = true;
        setLoading(false);
        return;
      }

      const local = readLocalMaterials();
      const next = local.length ? sortMaterialsByUpdatedAtDesc(local) : createDemoMaterials();
      if (!local.length) writeLocalMaterials(next);
      if (cancelled) return;
      setMaterials(next);
      hasHydratedRef.current = true;
      setLoading(false);
    }

    void loadMaterials();
    return () => {
      cancelled = true;
    };
  }, [authReady, isCloudMode, supabase, toast, userId]);

  useEffect(() => {
    if (!authReady || isCloudMode || !hasHydratedRef.current) return;
    writeLocalMaterials(materials);
  }, [authReady, isCloudMode, materials]);

  async function persistMaterial(next: MaterialRecord) {
    if (!isCloudMode || !supabase) return;
    const { error } = await supabase
      .from("materials")
      .update(materialToRowUpdate(next))
      .eq("id", next.id);
    if (error) toast("error", `Save failed: ${error.message}`);
  }

  function schedulePersist(next: MaterialRecord): void {
    const currentTimer = saveTimersRef.current.get(next.id);
    if (currentTimer) window.clearTimeout(currentTimer);
    const timer = window.setTimeout(() => void persistMaterial(next), 420);
    saveTimersRef.current.set(next.id, timer);
  }

  function updateMaterial(id: string, updater: (row: MaterialRecord) => MaterialRecord): void {
    const now = new Date().toISOString();
    setMaterials((prev) => {
      let changed: MaterialRecord | null = null;
      const next = prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...updater(row), updatedAt: now };
        changed = updated;
        return updated;
      });
      if (changed && isCloudMode) schedulePersist(changed);
      return sortMaterialsByUpdatedAtDesc(next);
    });
  }

  async function addMaterial() {
    if (isCloudMode && supabase && userId) {
      const insert = makeBlankMaterialInsert(userId, {
        defaultUnit: settings.defaultMaterialUnit,
      });
      const { data, error } = await supabase.from("materials").insert(insert).select("*");
      if (error || !data?.[0]) {
        toast("error", error?.message || "Could not create material.");
        return;
      }
      const row = rowToMaterial(data[0] as DbMaterialRow);
      setMaterials((prev) => sortMaterialsByUpdatedAtDesc([row, ...prev]));
      toast("success", "Material created.");
      return;
    }

    const row = makeBlankMaterial(makeId("mat"));
    row.unit = settings.defaultMaterialUnit;
    setMaterials((prev) => sortMaterialsByUpdatedAtDesc([row, ...prev]));
    toast("success", "Local material created.");
  }

  async function deleteMaterial(id: string) {
    if (isCloudMode && supabase) {
      const { error } = await supabase.from("materials").delete().eq("id", id);
      if (error) {
        toast("error", error.message);
        return;
      }
    }
    setMaterials((prev) => prev.filter((row) => row.id !== id));
    toast("info", "Material deleted.");
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

  const filteredMaterials = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materials.filter((row) => {
      if (!showInactive && !row.isActive) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.code.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q) ||
        row.supplier.toLowerCase().includes(q) ||
        row.unit.toLowerCase().includes(q)
      );
    });
  }, [materials, query, showInactive]);

  if (!authReady) {
    return (
      <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
        <div className="w-full animate-[fadeUp_.45s_ease-out]">
          <div className="h-6 w-40 rounded bg-ink/10" />
          <div className={cardClassName() + " mt-6 h-[420px]"} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <MainNavMenu
        activeItem="Materials"
        onUnimplementedNavigate={(section) => toast("info", `${section} section coming soon.`)}
        onSettings={openSettings}
        onLogout={() => void signOut()}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search materials..."
        onQuickAdd={() => void addMaterial()}
        quickAddLabel="+ New Material"
        profileLabel={session?.user?.email || "Profile"}
      />

      <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
        <div className="w-full animate-[fadeUp_.55s_ease-out]">
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-mono text-xs text-muted">
                {session ? (
                  <>
                    Signed in as <span className="select-all">{user?.email || user?.id}</span>{" "}
                    <span className="text-muted">- materials sync via Supabase</span>
                  </>
                ) : (
                  <>
                    Guest mode <span className="text-muted">- saved in this browser (localStorage)</span>
                  </>
                )}
              </p>
              <h1 className="mt-2 font-serif text-4xl leading-[1.08] tracking-tight text-ink">Materials</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Central material list for costing. Maintain standard unit costs, last purchase prices, suppliers, and
                active status.
              </p>
              {!supabase ? (
                <p className="mt-2 text-xs text-muted">
                  {supabaseError || "Supabase is not configured. Materials will stay local in this browser."}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                className={inputBase + " w-[220px]"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search materials..."
                aria-label="Search materials"
              />
              <label className="inline-flex items-center gap-2 rounded-xl border border-border bg-paper/55 px-3 py-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
                Show inactive
              </label>
              <button
                type="button"
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95 active:translate-y-px"
                onClick={() => void addMaterial()}
              >
                New material
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
                {loading ? "Loading materials..." : `${filteredMaterials.length} material(s)`}
              </p>
              <p className="font-mono text-xs text-muted">
                {isCloudMode ? "Cloud mode" : "Local mode"}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table data-input-layout className="min-w-[1160px] w-full text-left text-sm">
                <thead className="bg-paper/55">
                  <tr>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Name</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Code</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Category</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Unit</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Unit Cost</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Supplier</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">
                      Last Purchase Cost
                    </th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Last Purchase Date</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Active</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Updated</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaterials.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="p-2">
                        <input
                          className={inputBase}
                          value={row.name}
                          onChange={(e) => updateMaterial(row.id, (x) => ({ ...x, name: e.target.value }))}
                          placeholder="e.g., Canvas fabric"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className={inputBase + " " + inputMono}
                          value={row.code}
                          onChange={(e) =>
                            updateMaterial(row.id, (x) => ({ ...x, code: e.target.value.toUpperCase() }))
                          }
                          placeholder="e.g., FAB-001"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className={inputBase}
                          value={row.category}
                          onChange={(e) => updateMaterial(row.id, (x) => ({ ...x, category: e.target.value }))}
                          placeholder="e.g., Fabric"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className={inputBase}
                          value={row.unit}
                          onChange={(e) => updateMaterial(row.id, (x) => ({ ...x, unit: e.target.value }))}
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
                              updateMaterial(row.id, (x) => ({
                                ...x,
                                unitCostCents: parseMoneyToCents(e.target.value),
                              }))
                            }
                          />
                        </div>
                      </td>
                      <td className="p-2">
                        <input
                          className={inputBase}
                          value={row.supplier}
                          onChange={(e) => updateMaterial(row.id, (x) => ({ ...x, supplier: e.target.value }))}
                          placeholder="Supplier"
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
                            value={centsToMoneyString(row.lastPurchaseCostCents)}
                            onChange={(e) =>
                              updateMaterial(row.id, (x) => ({
                                ...x,
                                lastPurchaseCostCents: parseMoneyToCents(e.target.value),
                              }))
                            }
                          />
                        </div>
                      </td>
                      <td className="p-2">
                        <input
                          className={inputBase + " " + inputMono}
                          type="date"
                          value={row.lastPurchaseDate}
                          onChange={(e) =>
                            updateMaterial(row.id, (x) => ({ ...x, lastPurchaseDate: e.target.value }))
                          }
                        />
                      </td>
                      <td className="p-2">
                        <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-paper/55 px-2 py-1.5 text-xs text-ink">
                          <input
                            type="checkbox"
                            checked={row.isActive}
                            onChange={(e) =>
                              updateMaterial(row.id, (x) => ({ ...x, isActive: e.target.checked }))
                            }
                          />
                          {row.isActive ? "Yes" : "No"}
                        </label>
                      </td>
                      <td className="p-2 font-mono text-xs text-muted">{formatAppDate(row.updatedAt)}</td>
                      <td className="p-2">
                        <button
                          type="button"
                          className="rounded-lg border border-border bg-danger/10 px-2 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/15"
                          onClick={() => void deleteMaterial(row.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}

                  {!loading && filteredMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-sm text-muted">
                        No materials found. Create one using <span className="font-semibold">New material</span>.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="border-t border-border bg-paper/40 px-4 py-3 text-xs text-muted">
              Average unit cost (active only):{" "}
              <span className="font-mono text-ink">
                {formatSettingsMoney(
                  (() => {
                    const active = materials.filter((row) => row.isActive);
                    if (!active.length) return 0;
                    const total = active.reduce((sum, row) => sum + row.unitCostCents, 0);
                    return Math.round(total / active.length);
                  })(),
                )}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

