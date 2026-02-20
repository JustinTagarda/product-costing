"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { DataSelectionModal } from "@/components/DataSelectionModal";
import { GlobalAppToast } from "@/components/GlobalAppToast";
import { MainContentStatusFooter } from "@/components/MainContentStatusFooter";
import { MainNavMenu } from "@/components/MainNavMenu";
import { ShareSheetModal } from "@/components/ShareSheetModal";
import { formatCentsWithSettingsSymbol } from "@/lib/currency";
import { handleDraftRowBlurCapture, handleDraftRowKeyDownCapture } from "@/lib/tableDraftEntry";
import {
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
import { signOutAndClearClientAuth } from "@/lib/supabase/auth";
import { useAccountDataScope } from "@/lib/useAccountDataScope";
import { goToWelcomePage } from "@/lib/navigation";

type Notice = { kind: "info" | "success" | "error"; message: string };
type DraftMaterialRow = {
  name: string;
  unit: string;
  isActive: boolean;
};

const inputBase =
  "w-full rounded-xl border border-border bg-paper/65 px-3 py-2 text-sm text-ink placeholder:text-muted/80 outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15";
const inputMono = "tabular-nums font-mono tracking-tight";
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

function makeDraftMaterial(): DraftMaterialRow {
  return {
    name: "",
    unit: "",
    isActive: true,
  };
}

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function getObjectString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string") return value;
  }
  return "";
}

function getObjectNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (!(key in source)) continue;
    const value = toFiniteNumber(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function computeWeightedAverageCostByMaterialId(
  rows: unknown[],
): Record<string, number> {
  const totals = new Map<string, { costCents: number; usableQuantity: number }>();

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const materialId = getObjectString(row, ["material_id", "materialId"]).trim();
    if (!materialId) continue;

    const quantity = Math.max(0, getObjectNumber(row, ["quantity"]) ?? 0);
    const usableRaw = getObjectNumber(row, ["usable_quantity", "usableQuantity"]);
    const usableQuantity = Math.max(0, usableRaw ?? quantity);
    if (usableQuantity <= 0) continue;

    const costFromCost = getObjectNumber(row, ["cost_cents", "costCents"]);
    const costFromTotal = getObjectNumber(row, ["total_cost_cents", "totalCostCents"]);
    const unitCostCents = Math.max(0, getObjectNumber(row, ["unit_cost_cents", "unitCostCents"]) ?? 0);
    const quantityForCost = quantity > 0 ? quantity : usableQuantity;
    const derivedCostFromUnitCost = unitCostCents > 0 ? Math.round(unitCostCents * quantityForCost) : 0;
    const rawCost = costFromCost ?? costFromTotal ?? derivedCostFromUnitCost;
    const costCents = Math.max(0, Math.round(rawCost));

    const current = totals.get(materialId) ?? { costCents: 0, usableQuantity: 0 };
    current.costCents += costCents;
    current.usableQuantity += usableQuantity;
    totals.set(materialId, current);
  }

  const computed: Record<string, number> = {};
  for (const [materialId, total] of totals.entries()) {
    if (total.usableQuantity <= 0) continue;
    computed[materialId] = Math.max(0, Math.round(total.costCents / total.usableQuantity));
  }
  return computed;
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
  const [draftMaterial, setDraftMaterial] = useState<DraftMaterialRow>(() => makeDraftMaterial());
  const [savingDraftMaterial, setSavingDraftMaterial] = useState(false);
  const [duplicateNameModal, setDuplicateNameModal] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const user = session?.user ?? null;

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

  const {
    signedInUserId,
    signedInEmail,
    activeOwnerUserId,
    canEditActiveData,
    scopeReady,
    sharedAccounts,
    showSelectionModal,
    setShowSelectionModal,
    selectOwnData,
    selectSharedData,
  } = useAccountDataScope({
    supabase,
    session,
    authReady,
    onError: (message) => toast("error", message),
  });

  const userId = signedInUserId;
  const isCloudMode = Boolean(supabase && signedInUserId && activeOwnerUserId);
  const isReadOnlyData = isCloudMode && !canEditActiveData;
  const waitingForScope = Boolean(supabase && signedInUserId && !scopeReady);
  const dataAuthReady = authReady && !waitingForScope;

  const { settings } = useAppSettings({
    supabase,
    userId: activeOwnerUserId,
    authReady: dataAuthReady,
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
    setDraftMaterial(makeDraftMaterial());
  }, []);

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
    if (session) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/calculator") return;
    window.location.assign("/calculator");
  }, [authReady, session]);

  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!dataAuthReady) return;
    let cancelled = false;

    async function loadMaterials() {
      hasHydratedRef.current = false;
      setLoading(true);

      if (!isCloudMode || !activeOwnerUserId || !supabase) {
        if (cancelled) return;
        setMaterials([]);
        hasHydratedRef.current = true;
        setLoading(false);
        return;
      }

      const [materialsRes, purchasesRes] = await Promise.all([
        supabase
          .from("materials")
          .select("*")
          .eq("user_id", activeOwnerUserId)
          .order("name", { ascending: true }),
        supabase
          .from("purchases")
          .select("material_id, quantity, usable_quantity, unit_cost_cents, total_cost_cents, cost_cents, currency")
          .eq("user_id", activeOwnerUserId)
          .not("material_id", "is", null),
      ]);

      if (cancelled) return;
      if (materialsRes.error) {
        toast("error", materialsRes.error.message);
        setMaterials([]);
        hasHydratedRef.current = true;
        setLoading(false);
        return;
      }

      if (purchasesRes.error) toast("error", purchasesRes.error.message);

      const weightedAverageCostByMaterialId = computeWeightedAverageCostByMaterialId(
        purchasesRes.data ?? [],
      );

      setMaterials(
        sortMaterialsByNameAsc(
          (materialsRes.data ?? []).map((row) => {
            const material = rowToMaterial(row as DbMaterialRow);
            return {
              ...material,
              unit: normalizeUsableUnit(material.unit),
              unitCostCents: weightedAverageCostByMaterialId[material.id] ?? 0,
            };
          }),
        ),
      );
      hasHydratedRef.current = true;
      setLoading(false);
    }

    void loadMaterials();
    return () => {
      cancelled = true;
    };
  }, [activeOwnerUserId, dataAuthReady, isCloudMode, supabase, toast]);

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
    if (!isCloudMode || !supabase || isReadOnlyData) return;
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
    if (isReadOnlyData) return;
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
    if (isReadOnlyData) {
      toast("error", "Viewer access is read-only. Ask the owner for Editor access.");
      return;
    }
    const trimmedName = draftMaterial.name.trim();
    if (!trimmedName || savingDraftMaterialRef.current || duplicateNameModal) return;
    if (!isCloudMode || !supabase || !activeOwnerUserId) {
      toast("error", "Sign in with Google to add materials.");
      return;
    }

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
    const unitCostCents = 0;
    const isActive = true;

    savingDraftMaterialRef.current = true;
    setSavingDraftMaterial(true);

    try {
      const nextCodeNumber = getNextCodeNumber(
        materials.map((row) => row.code),
        MATERIAL_CODE_PREFIX,
      );

      for (let offset = 0; offset < 1000; offset += 1) {
        const code = formatCode(MATERIAL_CODE_PREFIX, nextCodeNumber + offset);
        const { data: existing, error: lookupError } = await supabase
          .from("materials")
          .select("id")
          .eq("user_id", activeOwnerUserId)
          .eq("code", code)
          .limit(1);
        if (lookupError) {
          toast("error", lookupError.message);
          return;
        }
        if ((existing ?? []).length > 0) continue;

        const insert = makeBlankMaterialInsert(activeOwnerUserId, { defaultUnit: normalizedUnit });
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
          setDraftMaterial(makeDraftMaterial());
          window.setTimeout(() => focusDraftNameInput("auto"), 0);
          toast("success", "Material added.");
          return;
        }

        if (error && isDuplicateKeyError(error)) continue;
        toast("error", error?.message || "Could not create material.");
        return;
      }

      toast("error", "Could not create material. Failed to generate a unique code.");
    } finally {
      savingDraftMaterialRef.current = false;
      setSavingDraftMaterial(false);
    }
  }

  async function deleteMaterial(id: string) {
    if (isReadOnlyData) {
      toast("error", "Viewer access is read-only. Ask the owner for Editor access.");
      return;
    }
    if (!isCloudMode || !supabase) {
      toast("error", "Sign in with Google to delete materials.");
      return;
    }
    const { error } = await supabase.from("materials").delete().eq("id", id);
    if (error) {
      toast("error", error.message);
      return;
    }
    setMaterials((prev) => prev.filter((row) => row.id !== id));
    toast("success", "Material deleted.");
  }

  async function signOut() {
    const errorMessage = await signOutAndClearClientAuth(supabase);
    if (errorMessage) {
      toast("error", errorMessage);
      return;
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

  if (!dataAuthReady) {
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
        onShare={() => setShowShareModal(true)}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search materials..."
        viewerMode={isReadOnlyData}
        profileLabel={session?.user?.email || "Profile"}
      />

      <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
        <div className="flex min-h-[calc(100dvh-var(--app-shell-topbar-height)-2rem)] sm:min-h-[calc(100dvh-var(--app-shell-topbar-height)-2.5rem)] lg:min-h-[calc(100dvh-var(--app-shell-topbar-height)-3rem)] w-full flex-col animate-[fadeUp_.55s_ease-out]">
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-serif text-4xl leading-[1.08] tracking-tight text-ink">Materials</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Central material list for costing. Weighted average cost is computed from purchases as total cost
                divided by total usable quantity.
              </p>
              {!supabase ? (
                <p className="mt-2 text-xs text-muted">
                  {supabaseError || "Supabase is required for this app."}
                </p>
              ) : null}
              {isReadOnlyData ? (
                <p className="mt-2 text-xs text-muted">
                  Viewer access: this shared dataset is read-only.
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
                disabled={isReadOnlyData}
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
              <p className="font-mono text-xs text-muted">Cloud mode</p>
            </div>

            <div className="overflow-x-auto">
              <table data-input-layout className="min-w-[760px] w-full text-left text-sm">
                <thead className="bg-paper/55">
                  <tr>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Name</th>
                    <th className="app-col-strict-150 px-3 py-2 font-mono text-xs font-semibold text-muted">Unit</th>
                    <th className="app-col-strict-150 px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Weighted Average Cost (Computed)</th>
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
                          disabled={isReadOnlyData}
                        />
                      </td>
                      <td className="app-col-strict-150 p-2">
                        <select
                          className={inputBase}
                          value={row.unit}
                          onChange={(e) => updateMaterial(row.id, (x) => ({ ...x, unit: e.target.value }))}
                          disabled={isReadOnlyData}
                        >
                          {STANDARD_USABLE_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="app-col-strict-150 p-2">
                        <p className={"px-3 py-2 text-sm text-ink " + inputMono}>
                          {formatSettingsMoney(row.unitCostCents)}
                        </p>
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
                              disabled={isReadOnlyData}
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
                            disabled={isReadOnlyData}
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
                    className="app-table-new-entry-row align-top"
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
                        disabled={savingDraftMaterial || isReadOnlyData}
                      />
                    </td>
                    <td className="app-col-strict-150 p-2">
                      <select
                        className={inputBase}
                        value={draftMaterial.unit}
                        onChange={(e) =>
                          setDraftMaterial((prev) => ({ ...prev, unit: e.target.value }))
                        }
                        disabled={savingDraftMaterial || isReadOnlyData}
                      >
                        <option value="">Select Unit</option>
                        {STANDARD_USABLE_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="app-col-strict-150 p-2">
                      <p className={"px-3 py-2 text-sm text-muted " + inputMono}>Auto</p>
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
                            disabled={savingDraftMaterial || isReadOnlyData}
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
            guestLabel="Google sign-in required"
          />

          <ShareSheetModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            supabase={supabase}
            currentUserId={userId}
            activeOwnerUserId={activeOwnerUserId}
            onNotify={toast}
          />

          <DataSelectionModal
            isOpen={showSelectionModal}
            ownEmail={signedInEmail || session?.user?.email || ""}
            activeOwnerUserId={activeOwnerUserId}
            signedInUserId={signedInUserId}
            sharedAccounts={sharedAccounts}
            onSelectOwn={selectOwnData}
            onSelectShared={selectSharedData}
            onClose={() => setShowSelectionModal(false)}
          />
        </div>
      </div>
    </div>
  );
}

