"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { DeferredMoneyInput } from "@/components/DeferredNumericInput";
import { GlobalAppToast } from "@/components/GlobalAppToast";
import { MainContentStatusFooter } from "@/components/MainContentStatusFooter";
import { MainNavMenu } from "@/components/MainNavMenu";
import { makeId } from "@/lib/costing";
import { formatCentsWithSettingsSymbol } from "@/lib/currency";
import { handleDraftRowBlurCapture, handleDraftRowKeyDownCapture } from "@/lib/tableDraftEntry";
import {
  createDemoMaterials,
  makeBlankMaterial,
  sortMaterialsByNameAsc,
  type MaterialRecord,
} from "@/lib/materials";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAppSettings } from "@/lib/useAppSettings";
import { formatCode, getNextCodeNumber, isDuplicateKeyError } from "@/lib/itemCodes";
import {
  makeBlankMaterialInsert,
  materialToRowUpdate,
  rowToMaterial,
  type DbMaterialRow,
} from "@/lib/supabase/materials";
import { goToWelcomePage } from "@/lib/navigation";

type Notice = { kind: "info" | "success" | "error"; message: string };
type DraftMaterialRow = {
  name: string;
  unit: string;
  unitCostCents: number;
  isActive: boolean;
};

const inputBase =
  "w-full rounded-xl border border-border bg-paper/65 px-3 py-2 text-sm text-ink placeholder:text-muted/80 outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15";
const inputMono = "tabular-nums font-mono tracking-tight";
const LOCAL_STORAGE_KEY = "product-costing:materials:local:v1";
const MATERIAL_CODE_PREFIX = "MA-";
const STANDARD_USABLE_UNITS = [
  "each",
  "piece",
  "pack",
  "set",
  "box",
  "kilogram",
  "gram",
  "pound",
  "ounce",
  "liter",
  "milliliter",
  "meter",
  "centimeter",
  "millimeter",
  "yard",
  "foot",
  "inch",
  "sheet",
  "roll",
  "spool",
  "pair",
  "dozen",
] as const;

const USABLE_UNIT_ALIASES: Record<string, string> = {
  ea: "each",
  each: "each",
  pc: "piece",
  pcs: "piece",
  piece: "piece",
  pieces: "piece",
  pack: "pack",
  packs: "pack",
  set: "set",
  sets: "set",
  box: "box",
  boxes: "box",
  kg: "kilogram",
  kilogram: "kilogram",
  kilograms: "kilogram",
  g: "gram",
  gram: "gram",
  grams: "gram",
  lb: "pound",
  lbs: "pound",
  pound: "pound",
  pounds: "pound",
  oz: "ounce",
  ounce: "ounce",
  ounces: "ounce",
  l: "liter",
  liter: "liter",
  liters: "liter",
  ml: "milliliter",
  milliliter: "milliliter",
  milliliters: "milliliter",
  m: "meter",
  meter: "meter",
  meters: "meter",
  cm: "centimeter",
  centimeter: "centimeter",
  centimeters: "centimeter",
  mm: "millimeter",
  millimeter: "millimeter",
  millimeters: "millimeter",
  yd: "yard",
  yard: "yard",
  yards: "yard",
  ft: "foot",
  feet: "foot",
  foot: "foot",
  in: "inch",
  inch: "inch",
  inches: "inch",
  sheet: "sheet",
  sheets: "sheet",
  roll: "roll",
  rolls: "roll",
  spool: "spool",
  spools: "spool",
  pair: "pair",
  pairs: "pair",
  dozen: "dozen",
};

function normalizeUsableUnit(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase();
  return USABLE_UNIT_ALIASES[key] ?? raw;
}

function makeDraftMaterial(defaultUnit: string): DraftMaterialRow {
  return {
    name: "",
    unit: normalizeUsableUnit(defaultUnit) || STANDARD_USABLE_UNITS[0],
    unitCostCents: 0,
    isActive: true,
  };
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
        unit: normalizeUsableUnit(typeof row.unit === "string" ? row.unit : fallback.unit),
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
  const [draftMaterial, setDraftMaterial] = useState<DraftMaterialRow>(() => makeDraftMaterial("each"));
  const [savingDraftMaterial, setSavingDraftMaterial] = useState(false);
  const [duplicateNameModal, setDuplicateNameModal] = useState<string | null>(null);

  const user = session?.user ?? null;
  const userId = user?.id ?? null;
  const isCloudMode = Boolean(userId && supabase);

  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const hasHydratedRef = useRef(false);
  const pendingScrollMaterialIdRef = useRef<string | null>(null);
  const savingDraftMaterialRef = useRef(false);
  const draftRowRef = useRef<HTMLTableRowElement | null>(null);
  const draftNameInputRef = useRef<HTMLInputElement | null>(null);

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

  const focusDraftNameInput = useCallback((scrollBehavior: ScrollBehavior = "smooth") => {
    const row = draftRowRef.current;
    if (row) {
      const rect = row.getBoundingClientRect();
      const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
      if (!isVisible) {
        row.scrollIntoView({ behavior: scrollBehavior, block: "nearest" });
      }
    }
    window.requestAnimationFrame(() => {
      const input = draftNameInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });
  }, []);

  const resetDraftMaterial = useCallback(() => {
    setDraftMaterial(makeDraftMaterial(settings.defaultMaterialUnit));
  }, [settings.defaultMaterialUnit]);

  useEffect(() => {
    const normalizedDefault =
      normalizeUsableUnit(settings.defaultMaterialUnit) || STANDARD_USABLE_UNITS[0];
    setDraftMaterial((prev) => {
      const isPristine = prev.name.trim().length === 0 && prev.unitCostCents === 0 && prev.isActive;
      if (!isPristine) return prev;
      if (prev.unit === normalizedDefault) return prev;
      return { ...prev, unit: normalizedDefault };
    });
  }, [settings.defaultMaterialUnit]);

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
          .order("name", { ascending: true });

        if (cancelled) return;
        if (error) {
          toast("error", error.message);
          setMaterials([]);
          hasHydratedRef.current = true;
          setLoading(false);
          return;
        }

        setMaterials(
          sortMaterialsByNameAsc(
            (data ?? []).map((row) => {
              const material = rowToMaterial(row as DbMaterialRow);
              return { ...material, unit: normalizeUsableUnit(material.unit) };
            }),
          ),
        );
        hasHydratedRef.current = true;
        setLoading(false);
        return;
      }

      const local = readLocalMaterials();
      const next = sortMaterialsByNameAsc(
        (local.length ? local : createDemoMaterials()).map((row) => ({
          ...row,
          unit: normalizeUsableUnit(row.unit),
        })),
      );
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

  useEffect(() => {
    const pendingId = pendingScrollMaterialIdRef.current;
    if (!pendingId) return;
    const row = document.getElementById(`material-row-${pendingId}`);
    pendingScrollMaterialIdRef.current = null;
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!isVisible) {
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [materials]);

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
      return next;
    });
  }

  async function commitDraftMaterial(): Promise<void> {
    const trimmedName = draftMaterial.name.trim();
    if (!trimmedName || savingDraftMaterialRef.current || duplicateNameModal) return;

    const normalizedName = trimmedName.toLowerCase();
    const hasDuplicateName = materials.some(
      (row) => row.name.trim().toLowerCase() === normalizedName,
    );
    if (hasDuplicateName) {
      setDuplicateNameModal(trimmedName);
      return;
    }

    const normalizedUnit =
      normalizeUsableUnit(draftMaterial.unit) ||
      normalizeUsableUnit(settings.defaultMaterialUnit) ||
      STANDARD_USABLE_UNITS[0];
    const unitCostCents = Math.max(0, Math.round(draftMaterial.unitCostCents));
    const isActive = draftMaterial.isActive;

    savingDraftMaterialRef.current = true;
    setSavingDraftMaterial(true);

    try {
      const nextCodeNumber = getNextCodeNumber(
        materials.map((row) => row.code),
        MATERIAL_CODE_PREFIX,
      );

      if (isCloudMode && supabase && userId) {
        for (let offset = 0; offset < 1000; offset += 1) {
          const code = formatCode(MATERIAL_CODE_PREFIX, nextCodeNumber + offset);
          const { data: existing, error: lookupError } = await supabase
            .from("materials")
            .select("id")
            .eq("user_id", userId)
            .eq("code", code)
            .limit(1);
          if (lookupError) {
            toast("error", lookupError.message);
            return;
          }
          if ((existing ?? []).length > 0) continue;

          const insert = makeBlankMaterialInsert(userId, { defaultUnit: normalizedUnit });
          insert.code = code;
          insert.name = trimmedName;
          insert.unit = normalizedUnit;
          insert.weighted_average_cost_cents = unitCostCents;
          insert.is_active = isActive;

          const { data, error } = await supabase.from("materials").insert(insert).select("*");
          if (!error && data?.[0]) {
            const row = rowToMaterial(data[0] as DbMaterialRow);
            pendingScrollMaterialIdRef.current = row.id;
            setMaterials((prev) => [...prev, row]);
            setDraftMaterial(makeDraftMaterial(settings.defaultMaterialUnit));
            window.setTimeout(() => focusDraftNameInput("auto"), 0);
            return;
          }

          if (error && isDuplicateKeyError(error)) continue;
          toast("error", error?.message || "Could not create material.");
          return;
        }

        toast("error", "Could not create material. Failed to generate a unique code.");
        return;
      }

      setMaterials((prev) => {
        const row = makeBlankMaterial(makeId("mat"));
        row.name = trimmedName;
        row.unit = normalizedUnit;
        row.unitCostCents = unitCostCents;
        row.isActive = isActive;
        row.code = formatCode(
          MATERIAL_CODE_PREFIX,
          getNextCodeNumber(
            prev.map((item) => item.code),
            MATERIAL_CODE_PREFIX,
          ),
        );
        pendingScrollMaterialIdRef.current = row.id;
        return [...prev, row];
      });
      setDraftMaterial(makeDraftMaterial(settings.defaultMaterialUnit));
      window.setTimeout(() => focusDraftNameInput("auto"), 0);
    } finally {
      savingDraftMaterialRef.current = false;
      setSavingDraftMaterial(false);
    }
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
    goToWelcomePage();
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
    <div className="min-h-[calc(100dvh-var(--app-shell-topbar-height))]">
      <MainNavMenu
        activeItem="Materials"
        onUnimplementedNavigate={(section) => toast("info", `${section} section coming soon.`)}
        onSettings={openSettings}
        onLogout={() => void signOut()}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search materials..."
        profileLabel={session?.user?.email || "Profile"}
      />

      <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
        <div className="flex min-h-[calc(100dvh-var(--app-shell-topbar-height)-2rem)] sm:min-h-[calc(100dvh-var(--app-shell-topbar-height)-2.5rem)] lg:min-h-[calc(100dvh-var(--app-shell-topbar-height)-3rem)] w-full flex-col animate-[fadeUp_.55s_ease-out]">
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-serif text-4xl leading-[1.08] tracking-tight text-ink">Materials</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Central material list for costing. Maintain weighted average costs, last purchase prices, suppliers, and
                active status.
              </p>
              {!supabase ? (
                <p className="mt-2 text-xs text-muted">
                  {supabaseError || "Supabase is not configured. Materials will stay local in this browser."}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
                onClick={() => focusDraftNameInput()}
              >
                New material
              </button>
            </div>
          </header>

          <GlobalAppToast notice={notice} />

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
              <table data-input-layout className="min-w-[760px] w-full text-left text-sm">
                <thead className="bg-paper/55">
                  <tr>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Name</th>
                    <th className="w-[150px] min-w-[150px] max-w-[150px] px-3 py-2 font-mono text-xs font-semibold text-muted">Unit</th>
                    <th className="w-[150px] min-w-[150px] max-w-[150px] px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Weighted Average Cost</th>
                    <th className="w-[75px] min-w-[75px] max-w-[75px] px-3 py-2 text-center font-mono text-xs font-semibold text-muted">Active</th>
                    <th className="w-[75px] min-w-[75px] max-w-[75px] px-3 py-2 text-center font-mono text-xs font-semibold text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaterials.map((row) => (
                    <tr key={row.id} id={`material-row-${row.id}`} className="align-top">
                      <td className="p-2">
                        <input
                          className={inputBase}
                          value={row.name}
                          onChange={(e) => updateMaterial(row.id, (x) => ({ ...x, name: e.target.value }))}
                          placeholder="e.g., Canvas fabric"
                        />
                      </td>
                      <td className="w-[150px] min-w-[150px] max-w-[150px] p-2">
                        <select
                          className={inputBase}
                          value={row.unit}
                          onChange={(e) => updateMaterial(row.id, (x) => ({ ...x, unit: e.target.value }))}
                        >
                          {STANDARD_USABLE_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="w-[150px] min-w-[150px] max-w-[150px] p-2">
                        <DeferredMoneyInput
                          className={inputBase + " " + inputMono}
                          valueCents={row.unitCostCents}
                          onCommitCents={(valueCents) =>
                            updateMaterial(row.id, (x) => ({
                              ...x,
                              unitCostCents: valueCents,
                            }))
                          }
                        />
                      </td>
                      <td className="w-[75px] min-w-[75px] max-w-[75px] p-2 text-center">
                        <div className="flex justify-center">
                          <label className="inline-flex items-center gap-2 rounded-lg bg-paper/55 px-2 py-1.5 text-xs text-ink">
                            <input
                              type="checkbox"
                              checked={row.isActive}
                              onChange={(e) =>
                                updateMaterial(row.id, (x) => ({ ...x, isActive: e.target.checked }))
                              }
                            />
                            {row.isActive ? "Yes" : "No"}
                          </label>
                        </div>
                      </td>
                      <td className="w-[75px] min-w-[75px] max-w-[75px] p-2 text-center">
                        <div className="flex justify-center">
                          <button
                            type="button"
                            className="rounded-lg border border-border bg-danger/10 px-2 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/15"
                            onClick={() => void deleteMaterial(row.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {!loading && filteredMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">
                        No materials found. Create one using <span className="font-semibold">New material</span>.
                      </td>
                    </tr>
                  ) : null}

                  <tr
                    ref={draftRowRef}
                    className="align-top"
                    onBlurCapture={(e) =>
                      handleDraftRowBlurCapture(e, () => {
                        void commitDraftMaterial();
                      })
                    }
                    onKeyDownCapture={(e) =>
                      handleDraftRowKeyDownCapture(e, {
                        commit: () => {
                          void commitDraftMaterial();
                        },
                        reset: resetDraftMaterial,
                        focusAfterReset: () => focusDraftNameInput("auto"),
                      })
                    }
                  >
                    <td className="p-2">
                      <input
                        ref={draftNameInputRef}
                        className={inputBase}
                        value={draftMaterial.name}
                        onChange={(e) =>
                          setDraftMaterial((prev) => ({ ...prev, name: e.target.value }))
                        }
                        placeholder="New material name"
                        disabled={savingDraftMaterial}
                      />
                    </td>
                    <td className="w-[150px] min-w-[150px] max-w-[150px] p-2">
                      <select
                        className={inputBase}
                        value={draftMaterial.unit}
                        onChange={(e) =>
                          setDraftMaterial((prev) => ({ ...prev, unit: e.target.value }))
                        }
                        disabled={savingDraftMaterial}
                      >
                        {STANDARD_USABLE_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="w-[150px] min-w-[150px] max-w-[150px] p-2">
                      <DeferredMoneyInput
                        className={inputBase + " " + inputMono}
                        valueCents={draftMaterial.unitCostCents}
                        onCommitCents={(valueCents) =>
                          setDraftMaterial((prev) => ({
                            ...prev,
                            unitCostCents: valueCents,
                          }))
                        }
                        disabled={savingDraftMaterial}
                      />
                    </td>
                    <td className="w-[75px] min-w-[75px] max-w-[75px] p-2 text-center">
                      <div className="flex justify-center">
                        <label className="inline-flex items-center gap-2 rounded-lg bg-paper/55 px-2 py-1.5 text-xs text-ink">
                          <input
                            type="checkbox"
                            checked={draftMaterial.isActive}
                            onChange={(e) =>
                              setDraftMaterial((prev) => ({ ...prev, isActive: e.target.checked }))
                            }
                            disabled={savingDraftMaterial}
                          />
                          {draftMaterial.isActive ? "Yes" : "No"}
                        </label>
                      </div>
                    </td>
                    <td className="w-[75px] min-w-[75px] max-w-[75px] p-2 text-center">
                      <span className="font-mono text-[11px] text-muted">
                        {savingDraftMaterial ? "Saving..." : "Auto"}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="border-t border-border bg-paper/40 px-4 py-3 text-xs text-muted">
              Average weighted average cost (active only):{" "}
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

          {duplicateNameModal ? (
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4">
              <div
                className="w-full max-w-md rounded-2xl border border-border bg-card/95 p-5 shadow-[0_18px_55px_rgba(0,0,0,.22)] backdrop-blur-md"
                role="dialog"
                aria-modal="true"
                aria-labelledby="duplicate-material-title"
              >
                <h2 id="duplicate-material-title" className="font-serif text-xl tracking-tight text-ink">
                  Duplicate material name
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  A material named <span className="font-semibold text-ink">{duplicateNameModal}</span> already exists.
                  Enter a different name before saving.
                </p>
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95 active:translate-y-px"
                    onClick={() => {
                      setDuplicateNameModal(null);
                      focusDraftNameInput("auto");
                    }}
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <MainContentStatusFooter
            userLabel={session ? user?.email || user?.id : null}
            syncLabel="materials sync via Supabase"
            guestLabel="saved in this browser (localStorage)"
          />
        </div>
      </div>
    </div>
  );
}

