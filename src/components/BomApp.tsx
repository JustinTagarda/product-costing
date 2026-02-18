"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { DataSelectionModal } from "@/components/DataSelectionModal";
import { DeferredMoneyInput, DeferredNumberInput } from "@/components/DeferredNumericInput";
import { GlobalAppToast } from "@/components/GlobalAppToast";
import { MainContentStatusFooter } from "@/components/MainContentStatusFooter";
import { MainNavMenu } from "@/components/MainNavMenu";
import { ShareSheetModal } from "@/components/ShareSheetModal";
import { makeId } from "@/lib/costing";
import { formatShortDate } from "@/lib/format";
import { formatCentsWithSettingsSymbol } from "@/lib/currency";
import {
  createDemoMaterials,
  readLocalMaterialRecords,
  writeLocalMaterialRecords,
  type MaterialRecord,
} from "@/lib/materials";
import {
  createDemoBoms,
  makeBlankBom,
  makeBlankBomLine,
  readLocalBoms,
  sortBomsByUpdatedAtDesc,
  writeLocalBoms,
  type BomLine,
  type BomRecord,
} from "@/lib/bom";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  bomToItemUpdate,
  combineBomRows,
  lineToRowUpdate,
  makeBlankBomItemInsert,
  makeBlankBomLineInsert,
  rowToBomLine,
  type DbBomItemRow,
  type DbBomLineRow,
} from "@/lib/supabase/bom";
import { type DbMaterialRow, rowToMaterial } from "@/lib/supabase/materials";
import { goToWelcomePage } from "@/lib/navigation";
import { useAccountDataScope } from "@/lib/useAccountDataScope";
import { useAppSettings } from "@/lib/useAppSettings";

type Notice = { kind: "info" | "success" | "error"; message: string };
type MaterialOption = Pick<MaterialRecord, "id" | "name" | "unit" | "unitCostCents" | "isActive">;
type BomCostSummary = {
  totalCostCents: number;
  unitCostCents: number | null;
  hasCycle: boolean;
  unresolved: boolean;
};

const inputBase =
  "w-full rounded-xl border border-border bg-paper/65 px-3 py-2 text-sm text-ink placeholder:text-muted/80 outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15";
const inputMono = "tabular-nums font-mono tracking-tight";

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
    unit: material.unit,
    unitCostCents: material.unitCostCents,
    isActive: material.isActive,
  };
}

function reindexLines(lines: BomLine[]): BomLine[] {
  return lines.map((line, index) => (line.sortOrder === index ? line : { ...line, sortOrder: index }));
}

function computeBomCostMap(boms: BomRecord[], materialById: Map<string, MaterialOption>): Map<string, BomCostSummary> {
  const bomById = new Map(boms.map((item) => [item.id, item]));
  const memo = new Map<string, BomCostSummary>();
  const visiting = new Set<string>();

  const compute = (bomId: string): BomCostSummary => {
    const cached = memo.get(bomId);
    if (cached) return cached;
    if (visiting.has(bomId)) return { totalCostCents: 0, unitCostCents: null, hasCycle: true, unresolved: true };
    const bom = bomById.get(bomId);
    if (!bom) return { totalCostCents: 0, unitCostCents: null, hasCycle: false, unresolved: true };

    visiting.add(bomId);
    let total = 0;
    let hasCycle = false;
    let unresolved = false;

    for (const line of bom.lines) {
      const qty = Number.isFinite(line.quantity) ? Math.max(0, line.quantity) : 0;
      let unitCost = Math.max(0, Math.round(line.unitCostCents));
      if (line.componentType === "material") {
        if (line.materialId) {
          const material = materialById.get(line.materialId);
          if (material) unitCost = material.unitCostCents;
          else unresolved = true;
        }
      } else if (line.componentBomId) {
        if (line.componentBomId === bomId) {
          unresolved = true;
          hasCycle = true;
          unitCost = 0;
        } else {
          const child = compute(line.componentBomId);
          unresolved = unresolved || child.unresolved || child.unitCostCents === null;
          hasCycle = hasCycle || child.hasCycle;
          unitCost = child.unitCostCents ?? 0;
        }
      } else {
        unresolved = true;
      }
      total += Math.round(qty * unitCost);
    }

    visiting.delete(bomId);
    const outputQty = Number.isFinite(bom.outputQty) ? Math.max(0, bom.outputQty) : 0;
    const result = {
      totalCostCents: Math.max(0, Math.round(total)),
      unitCostCents: outputQty > 0 ? Math.round(total / outputQty) : null,
      hasCycle,
      unresolved,
    } satisfies BomCostSummary;
    memo.set(bomId, result);
    return result;
  };

  for (const bom of boms) memo.set(bom.id, compute(bom.id));
  return memo;
}

function resolveLineUnitCost(
  parentBomId: string,
  line: BomLine,
  materialById: Map<string, MaterialOption>,
  bomCosts: Map<string, BomCostSummary>,
): number {
  if (line.componentType === "material") {
    if (!line.materialId) return line.unitCostCents;
    return materialById.get(line.materialId)?.unitCostCents ?? line.unitCostCents;
  }
  if (!line.componentBomId || line.componentBomId === parentBomId) return 0;
  return bomCosts.get(line.componentBomId)?.unitCostCents ?? line.unitCostCents;
}

export default function BomApp() {
  const [{ supabase, supabaseError }] = useState(() => {
    try {
      return { supabase: getSupabaseClient(), supabaseError: null as string | null };
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Supabase is not configured. Check your environment variables.";
      return { supabase: null as ReturnType<typeof getSupabaseClient> | null, supabaseError: msg };
    }
  });

  const [notice, setNotice] = useState<Notice | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(() => !supabase);
  const [loading, setLoading] = useState(false);
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const user = session?.user ?? null;
  const hasHydratedRef = useRef(false);
  const itemSaveTimersRef = useRef<Map<string, number>>(new Map());
  const lineSaveTimersRef = useRef<Map<string, number>>(new Map());

  const toast = useCallback((kind: Notice["kind"], message: string): void => {
    setNotice({ kind, message });
    window.setTimeout(() => setNotice(null), 2600);
  }, []);

  const {
    signedInUserId,
    signedInEmail,
    activeOwnerUserId,
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
  const waitingForScope = Boolean(supabase && signedInUserId && !scopeReady);
  const dataAuthReady = authReady && !waitingForScope;

  const { settings } = useAppSettings({
    supabase,
    userId: activeOwnerUserId,
    authReady: dataAuthReady,
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

  const formatAppDate = useCallback(
    (iso: string) =>
      formatShortDate(iso, {
        dateFormat: settings.dateFormat,
        timezone: settings.timezone,
      }),
    [settings.dateFormat, settings.timezone],
  );

  const materialById = useMemo(() => new Map(materials.map((item) => [item.id, item])), [materials]);
  const bomById = useMemo(() => new Map(boms.map((item) => [item.id, item])), [boms]);
  const bomCosts = useMemo(() => computeBomCostMap(boms, materialById), [boms, materialById]);

  const filteredBoms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return boms.filter((item) => {
      if (!showInactive && !item.isActive) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.itemType.toLowerCase().includes(q)
      );
    });
  }, [boms, query, showInactive]);

  const selectedBom = useMemo(() => {
    if (!boms.length) return null;
    const found = selectedId ? boms.find((item) => item.id === selectedId) : null;
    return found ?? boms[0];
  }, [boms, selectedId]);

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
    const itemTimers = itemSaveTimersRef.current;
    const lineTimers = lineSaveTimersRef.current;
    return () => {
      for (const timer of itemTimers.values()) window.clearTimeout(timer);
      itemTimers.clear();
      for (const timer of lineTimers.values()) window.clearTimeout(timer);
      lineTimers.clear();
    };
  }, []);

  useEffect(() => {
    if (!dataAuthReady) return;
    let cancelled = false;

    async function loadData() {
      hasHydratedRef.current = false;
      setLoading(true);

      if (isCloudMode && activeOwnerUserId && supabase) {
        const [itemsRes, linesRes, materialsRes] = await Promise.all([
          supabase
            .from("bom_items")
            .select("*")
            .eq("user_id", activeOwnerUserId)
            .order("updated_at", { ascending: false }),
          supabase
            .from("bom_item_lines")
            .select("*")
            .eq("user_id", activeOwnerUserId)
            .order("sort_order", { ascending: true }),
          supabase.from("materials").select("*").eq("user_id", activeOwnerUserId).order("name", { ascending: true }),
        ]);

        if (cancelled) return;

        if (materialsRes.error) {
          toast("error", materialsRes.error.message);
          setMaterials([]);
        } else {
          const nextMaterials = ((materialsRes.data ?? []) as DbMaterialRow[]).map((row) =>
            toMaterialOption(rowToMaterial(row)),
          );
          setMaterials(nextMaterials);
        }

        if (itemsRes.error || linesRes.error) {
          toast("error", itemsRes.error?.message || linesRes.error?.message || "Could not load BOM.");
          setBoms([]);
          setSelectedId(null);
        } else {
          const nextBoms = combineBomRows(
            (itemsRes.data ?? []) as DbBomItemRow[],
            (linesRes.data ?? []) as DbBomLineRow[],
          );
          setBoms(nextBoms);
          setSelectedId((prev) =>
            prev && nextBoms.some((item) => item.id === prev) ? prev : (nextBoms[0]?.id ?? null),
          );
        }

        hasHydratedRef.current = true;
        setLoading(false);
        return;
      }

      const localMaterials = readLocalMaterialRecords();
      const baseMaterialRecords = localMaterials.length ? localMaterials : createDemoMaterials();
      if (!localMaterials.length) writeLocalMaterialRecords(baseMaterialRecords);
      const baseMaterials = baseMaterialRecords.map(toMaterialOption);

      const localBoms = readLocalBoms();
      const nextBoms = localBoms.length ? sortBomsByUpdatedAtDesc(localBoms) : createDemoBoms(baseMaterials);
      if (!localBoms.length) writeLocalBoms(nextBoms);

      if (cancelled) return;
      setMaterials(baseMaterials);
      setBoms(nextBoms);
      setSelectedId(nextBoms[0]?.id ?? null);
      hasHydratedRef.current = true;
      setLoading(false);
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [activeOwnerUserId, dataAuthReady, isCloudMode, supabase, toast]);

  useEffect(() => {
    if (!dataAuthReady || isCloudMode || !hasHydratedRef.current) return;
    writeLocalBoms(boms);
  }, [boms, dataAuthReady, isCloudMode]);

  async function persistBomItem(next: BomRecord): Promise<void> {
    if (!isCloudMode || !supabase) return;
    const { error } = await supabase.from("bom_items").update(bomToItemUpdate(next)).eq("id", next.id);
    if (error) toast("error", `Save failed: ${error.message}`);
  }

  async function persistBomLine(bomId: string, line: BomLine): Promise<void> {
    if (!isCloudMode || !supabase) return;
    const { error } = await supabase
      .from("bom_item_lines")
      .update(lineToRowUpdate(line))
      .eq("id", line.id)
      .eq("bom_item_id", bomId);
    if (error) toast("error", `Line save failed: ${error.message}`);
  }

  function scheduleItemPersist(next: BomRecord): void {
    const timer = itemSaveTimersRef.current.get(next.id);
    if (timer) window.clearTimeout(timer);
    const nextTimer = window.setTimeout(() => void persistBomItem(next), 420);
    itemSaveTimersRef.current.set(next.id, nextTimer);
  }

  function scheduleLinePersist(bomId: string, line: BomLine): void {
    const key = `${bomId}:${line.id}`;
    const timer = lineSaveTimersRef.current.get(key);
    if (timer) window.clearTimeout(timer);
    const nextTimer = window.setTimeout(() => void persistBomLine(bomId, line), 420);
    lineSaveTimersRef.current.set(key, nextTimer);
  }

  function updateBom(id: string, updater: (row: BomRecord) => BomRecord): void {
    const now = new Date().toISOString();
    setBoms((prev) => {
      let changed: BomRecord | null = null;
      const next = prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...updater(item), updatedAt: now };
        changed = updated;
        return updated;
      });
      if (changed && isCloudMode) scheduleItemPersist(changed);
      return next;
    });
  }

  function updateLine(bomId: string, lineId: string, updater: (row: BomLine) => BomLine): void {
    const now = new Date().toISOString();
    setBoms((prev) => {
      let changedItem: BomRecord | null = null;
      let changedLine: BomLine | null = null;
      const next = prev.map((item) => {
        if (item.id !== bomId) return item;
        const lines = reindexLines(item.lines.map((line) => {
          if (line.id !== lineId) return line;
          const updated = { ...updater(line), updatedAt: now };
          changedLine = updated;
          return updated;
        }));
        const updatedItem = { ...item, lines, updatedAt: now };
        changedItem = updatedItem;
        return updatedItem;
      });
      if (changedItem && isCloudMode) scheduleItemPersist(changedItem);
      if (changedLine && isCloudMode) scheduleLinePersist(bomId, changedLine);
      return next;
    });
  }

  async function createBom(): Promise<void> {
    const defaults = {
      name: "New BOM",
      itemType: "part" as const,
      outputQty: 1,
      outputUnit: settings.defaultMaterialUnit,
    };

    if (isCloudMode && supabase && activeOwnerUserId) {
      const insert = makeBlankBomItemInsert(activeOwnerUserId, defaults);
      const { data, error } = await supabase.from("bom_items").insert(insert).select("*");
      if (error || !data?.[0]) {
        toast("error", error?.message || "Could not create BOM.");
        return;
      }
      const itemRow = data[0] as DbBomItemRow;
      const lineInsert = makeBlankBomLineInsert(activeOwnerUserId, itemRow.id, 0, {
        unit: settings.defaultMaterialUnit,
      });
      const { data: lineData, error: lineError } = await supabase
        .from("bom_item_lines")
        .insert(lineInsert)
        .select("*");
      if (lineError || !lineData?.[0]) {
        toast("error", lineError?.message || "Could not create BOM line.");
        return;
      }
      const next = combineBomRows([itemRow], [lineData[0] as DbBomLineRow])[0];
      if (!next) return;
      setBoms((prev) => [next, ...prev]);
      setSelectedId(next.id);
      toast("success", "BOM created.");
      return;
    }

    const row = makeBlankBom(makeId("bom"), defaults);
    setBoms((prev) => [row, ...prev]);
    setSelectedId(row.id);
    toast("success", "Local BOM created.");
  }

  async function deleteBom(id: string): Promise<void> {
    const row = bomById.get(id);
    const ok = window.confirm(`Delete "${row?.name || "Untitled BOM"}"?`);
    if (!ok) return;
    if (isCloudMode && supabase) {
      const { error } = await supabase.from("bom_items").delete().eq("id", id);
      if (error) {
        toast("error", error.message);
        return;
      }
    }
    setBoms((prev) => prev.filter((item) => item.id !== id));
    toast("success", "BOM deleted.");
  }

  async function addLine(): Promise<void> {
    if (!selectedBom) return;
    const now = new Date().toISOString();
    if (isCloudMode && supabase && activeOwnerUserId) {
      const insert = makeBlankBomLineInsert(activeOwnerUserId, selectedBom.id, selectedBom.lines.length, {
        unit: settings.defaultMaterialUnit,
      });
      const { data, error } = await supabase.from("bom_item_lines").insert(insert).select("*");
      if (error || !data?.[0]) {
        toast("error", error?.message || "Could not add line.");
        return;
      }
      const line = rowToBomLine(data[0] as DbBomLineRow);
      setBoms((prev) =>
        prev.map((item) =>
          item.id === selectedBom.id
            ? { ...item, lines: reindexLines([...item.lines, line]), updatedAt: now }
            : item,
        ),
      );
      toast("success", "BOM line added.");
      return;
    }

    const line = makeBlankBomLine(makeId("bomline"), {
      sortOrder: selectedBom.lines.length,
      unit: settings.defaultMaterialUnit,
    });
    setBoms((prev) =>
      prev.map((item) =>
        item.id === selectedBom.id
          ? { ...item, lines: reindexLines([...item.lines, line]), updatedAt: now }
          : item,
      ),
    );
    toast("success", "BOM line added.");
  }

  async function removeLine(lineId: string): Promise<void> {
    if (!selectedBom) return;
    if (isCloudMode && supabase) {
      const { error } = await supabase.from("bom_item_lines").delete().eq("id", lineId);
      if (error) {
        toast("error", error.message);
        return;
      }
    }
    const now = new Date().toISOString();
    setBoms((prev) =>
      prev.map((item) => {
        if (item.id !== selectedBom.id) return item;
        const nextLines = item.lines.filter((line) => line.id !== lineId);
        const lines = reindexLines(
          nextLines.length
            ? nextLines
            : [
                makeBlankBomLine(makeId("bomline"), {
                  sortOrder: 0,
                  unit: settings.defaultMaterialUnit,
                }),
              ],
        );
        return { ...item, lines, updatedAt: now };
      }),
    );
    toast("success", "BOM line deleted.");
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

  if (!dataAuthReady) {
    return (
      <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
        <div className="w-full animate-[fadeUp_.45s_ease-out]">
          <div className={cardClassName() + " h-[520px]"} />
        </div>
      </div>
    );
  }

  const selectedCost = selectedBom ? bomCosts.get(selectedBom.id) : null;

  return (
    <div className="min-h-[calc(100dvh-var(--app-shell-topbar-height))]">
      <MainNavMenu
        activeItem="BOM"
        onUnimplementedNavigate={(section) => toast("info", `${section} section coming soon.`)}
        onSettings={openSettings}
        onLogout={() => void signOut()}
        onShare={isCloudMode ? () => setShowShareModal(true) : undefined}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search BOM..."
        profileLabel={session?.user?.email || "Profile"}
      />
      <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
        <div className="flex min-h-[calc(100dvh-var(--app-shell-topbar-height)-2rem)] sm:min-h-[calc(100dvh-var(--app-shell-topbar-height)-2.5rem)] lg:min-h-[calc(100dvh-var(--app-shell-topbar-height)-3rem)] w-full flex-col animate-[fadeUp_.55s_ease-out]">
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-serif text-4xl leading-[1.08] tracking-tight text-ink">
                Bill of Materials
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Define reusable parts and product BOMs. Subassembly costs roll up into parent products automatically.
              </p>
              {!supabase ? (
                <p className="mt-2 text-xs text-muted">
                  {supabaseError || "Supabase is not configured. BOM records stay local in this browser."}
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
                onClick={() => void createBom()}
              >
                New BOM
              </button>
            </div>
          </header>

          <GlobalAppToast notice={notice} />

          <section className={cardClassName() + " mt-6 overflow-hidden"}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="font-mono text-xs text-muted">
                {loading ? "Loading BOM..." : `${filteredBoms.length} BOM record(s)`}
              </p>
              <p className="font-mono text-xs text-muted">{isCloudMode ? "Cloud mode" : "Local mode"}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-paper/55">
                  <tr>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Name</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Code</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Type</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Output</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Unit Cost</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Active</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Updated</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBoms.map((item) => {
                    const cost = bomCosts.get(item.id);
                    return (
                      <tr
                        key={item.id}
                        className={selectedBom?.id === item.id ? "bg-ink/5" : ""}
                      >
                        <td className="p-2">
                          <button className="text-left font-semibold text-ink hover:underline" onClick={() => setSelectedId(item.id)}>
                            {item.name || "Untitled BOM"}
                          </button>
                        </td>
                        <td className="p-2 font-mono text-xs text-muted">{item.code || "-"}</td>
                        <td className="p-2">{item.itemType === "product" ? "Product" : "Part"}</td>
                        <td className="p-2 font-mono text-xs text-muted">{item.outputQty} {item.outputUnit}</td>
                        <td className="p-2 font-mono text-xs text-ink">
                          {cost?.unitCostCents === null ? "--" : formatMoney(cost?.unitCostCents ?? 0)}
                        </td>
                        <td className="p-2">{item.isActive ? "Yes" : "No"}</td>
                        <td className="p-2 font-mono text-xs text-muted">{formatAppDate(item.updatedAt)}</td>
                        <td className="p-2">
                          <button
                            type="button"
                            className="rounded-lg border border-border bg-danger/10 px-2 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/15"
                            onClick={() => void deleteBom(item.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {selectedBom ? (
            <section className={cardClassName() + " mt-6 overflow-hidden"}>
              <div className="border-b border-border px-4 py-3">
                <h2 className="font-serif text-2xl tracking-tight text-ink">Edit BOM</h2>
              </div>
              <div className="grid gap-4 p-4 md:grid-cols-4">
                <div>
                  <label className="block font-mono text-xs text-muted">Name</label>
                  <input className={inputBase + " mt-1"} value={selectedBom.name} onChange={(e) => updateBom(selectedBom.id, (row) => ({ ...row, name: e.target.value }))} />
                </div>
                <div>
                  <label className="block font-mono text-xs text-muted">Code</label>
                  <input className={inputBase + " mt-1 " + inputMono} value={selectedBom.code} onChange={(e) => updateBom(selectedBom.id, (row) => ({ ...row, code: e.target.value.toUpperCase() }))} />
                </div>
                <div>
                  <label className="block font-mono text-xs text-muted">Type</label>
                  <select className={inputBase + " mt-1"} value={selectedBom.itemType} onChange={(e) => updateBom(selectedBom.id, (row) => ({ ...row, itemType: e.target.value === "product" ? "product" : "part" }))}>
                    <option value="part">Part</option>
                    <option value="product">Product</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 rounded-xl border border-border bg-paper/55 px-3 py-2 text-sm text-ink">
                    <input type="checkbox" checked={selectedBom.isActive} onChange={(e) => updateBom(selectedBom.id, (row) => ({ ...row, isActive: e.target.checked }))} />
                    Active
                  </label>
                </div>
                <div>
                  <label className="block font-mono text-xs text-muted">Output quantity</label>
                  <DeferredNumberInput
                    className={inputBase + " mt-1 " + inputMono}
                    value={selectedBom.outputQty}
                    onCommit={(value) =>
                      updateBom(selectedBom.id, (row) => ({ ...row, outputQty: Math.max(0, value) }))
                    }
                  />
                </div>
                <div>
                  <label className="block font-mono text-xs text-muted">Output unit</label>
                  <input className={inputBase + " mt-1"} value={selectedBom.outputUnit} onChange={(e) => updateBom(selectedBom.id, (row) => ({ ...row, outputUnit: e.target.value || settings.defaultMaterialUnit }))} />
                </div>
                <div className="md:col-span-2">
                  <label className="block font-mono text-xs text-muted">Notes</label>
                  <input className={inputBase + " mt-1"} value={selectedBom.notes} onChange={(e) => updateBom(selectedBom.id, (row) => ({ ...row, notes: e.target.value }))} />
                </div>
              </div>

              <div className="border-t border-border px-4 py-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-xl tracking-tight text-ink">Components</h3>
                  <button type="button" className="rounded-xl border border-border bg-paper/55 px-3 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-paper/70 active:translate-y-px" onClick={() => void addLine()}>
                    Add line
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto p-2">
                <table data-input-layout className="min-w-[1200px] w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="px-2 py-2 font-mono text-xs font-semibold text-muted">Type</th>
                      <th className="px-2 py-2 font-mono text-xs font-semibold text-muted">Component</th>
                      <th className="px-2 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Qty</th>
                      <th className="px-2 py-2 font-mono text-xs font-semibold text-muted">Unit</th>
                      <th className="px-2 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Unit cost</th>
                      <th className="px-2 py-2 font-mono text-xs font-semibold text-muted tabular-nums">Line total</th>
                      <th className="px-2 py-2 font-mono text-xs font-semibold text-muted">Notes</th>
                      <th className="px-2 py-2 font-mono text-xs font-semibold text-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBom.lines.map((line) => {
                      const lineUnitCost = resolveLineUnitCost(selectedBom.id, line, materialById, bomCosts);
                      const lineTotal = Math.round(Math.max(0, line.quantity) * lineUnitCost);
                      return (
                        <tr key={line.id} className="align-top">
                          <td className="p-2">
                            <select className={inputBase} value={line.componentType} onChange={(e) => updateLine(selectedBom.id, line.id, (row) => ({ ...row, componentType: e.target.value === "bom_item" ? "bom_item" : "material", materialId: null, componentBomId: null, componentName: "", unit: settings.defaultMaterialUnit, unitCostCents: 0 }))}>
                              <option value="material">Material</option>
                              <option value="bom_item">Subassembly BOM</option>
                            </select>
                          </td>
                          <td className="p-2">
                            {line.componentType === "material" ? (
                              <select className={inputBase} value={line.materialId ?? ""} onChange={(e) => {
                                const materialId = e.target.value || null;
                                const material = materialId ? materialById.get(materialId) : null;
                                updateLine(selectedBom.id, line.id, (row) => ({ ...row, materialId, componentBomId: null, componentName: material?.name ?? "", unit: material?.unit ?? row.unit, unitCostCents: material?.unitCostCents ?? row.unitCostCents }));
                              }}>
                                <option value="">Select material</option>
                                {materials.map((material) => (
                                  <option key={material.id} value={material.id}>
                                    {material.name}
                                    {material.isActive ? "" : " (inactive)"}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <select className={inputBase} value={line.componentBomId ?? ""} onChange={(e) => {
                                const componentBomId = e.target.value || null;
                                const nested = componentBomId ? bomById.get(componentBomId) : null;
                                const nestedCost = componentBomId ? (bomCosts.get(componentBomId)?.unitCostCents ?? 0) : 0;
                                updateLine(selectedBom.id, line.id, (row) => ({ ...row, componentBomId, materialId: null, componentName: nested?.name ?? "", unit: nested?.outputUnit ?? row.unit, unitCostCents: nestedCost }));
                              }}>
                                <option value="">Select subassembly</option>
                                {boms.filter((item) => item.id !== selectedBom.id).map((item) => (
                                  <option key={item.id} value={item.id}>{item.name}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="p-2">
                            <DeferredNumberInput
                              className={inputBase + " " + inputMono}
                              value={line.quantity}
                              onCommit={(value) =>
                                updateLine(selectedBom.id, line.id, (row) => ({
                                  ...row,
                                  quantity: Math.max(0, value),
                                }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <input className={inputBase} value={line.unit} onChange={(e) => updateLine(selectedBom.id, line.id, (row) => ({ ...row, unit: e.target.value || settings.defaultMaterialUnit }))} />
                          </td>
                          <td className="p-2">
                            {line.componentType === "material" && !line.materialId ? (
                              <DeferredMoneyInput
                                className={inputBase + " " + inputMono}
                                valueCents={line.unitCostCents}
                                onCommitCents={(valueCents) =>
                                  updateLine(selectedBom.id, line.id, (row) => ({
                                    ...row,
                                    unitCostCents: valueCents,
                                  }))
                                }
                              />
                            ) : (
                              <p className="rounded-xl border border-border bg-paper/50 px-3 py-2 font-mono text-sm text-ink">{formatMoney(lineUnitCost)}</p>
                            )}
                          </td>
                          <td className="p-2">
                            <p className="rounded-xl border border-border bg-paper/50 px-3 py-2 font-mono text-sm text-ink">{formatMoney(lineTotal)}</p>
                          </td>
                          <td className="p-2">
                            <input className={inputBase} value={line.notes} onChange={(e) => updateLine(selectedBom.id, line.id, (row) => ({ ...row, notes: e.target.value }))} />
                          </td>
                          <td className="p-2">
                            <button type="button" className="rounded-lg border border-border bg-danger/10 px-2 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/15" onClick={() => void removeLine(line.id)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-border bg-paper/40 px-4 py-3 text-xs text-muted">
                Batch total: <span className="font-mono text-ink">{formatMoney(selectedCost?.totalCostCents ?? 0)}</span> | Unit cost: <span className="font-mono text-ink">{selectedCost?.unitCostCents === null ? "--" : formatMoney(selectedCost?.unitCostCents ?? 0)}</span>
                {selectedCost?.hasCycle ? <span className="ml-2 text-danger">| Circular reference detected</span> : null}
                {selectedCost?.unresolved && !selectedCost?.hasCycle ? <span className="ml-2">| Incomplete component links</span> : null}
                <span className="ml-2">| Updated {formatAppDate(selectedBom.updatedAt)}</span>
              </div>
            </section>
          ) : null}

          <MainContentStatusFooter
            userLabel={session ? user?.email || user?.id : null}
            syncLabel="BOM sync via Supabase"
            guestLabel="saved in this browser (localStorage)"
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

