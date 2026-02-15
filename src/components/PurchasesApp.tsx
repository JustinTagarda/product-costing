"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { DeferredMoneyInput, DeferredNumberInput } from "@/components/DeferredNumericInput";
import { MainContentStatusFooter } from "@/components/MainContentStatusFooter";
import { MainNavMenu } from "@/components/MainNavMenu";
import { PopupNotification } from "@/components/PopupNotification";
import { makeId } from "@/lib/costing";
import { formatCentsWithSettingsSymbol } from "@/lib/currency";
import { handleDraftRowBlurCapture, handleDraftRowKeyDownCapture } from "@/lib/tableDraftEntry";
import {
  createDemoMaterials,
  readLocalMaterialRecords,
  writeLocalMaterialRecords,
  type MaterialRecord,
} from "@/lib/materials";
import {
  computeUnitCostCentsFromCost,
  computePurchaseTotalCents,
  createDemoPurchases,
  currentDateInputValue,
  LOCAL_PURCHASES_STORAGE_KEY,
  makeBlankPurchase,
  normalizePurchaseMarketplace,
  PURCHASE_MARKETPLACES,
  sortPurchasesByDateDesc,
  type PurchaseMarketplace,
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
import { goToWelcomePage } from "@/lib/navigation";
import { useAppSettings } from "@/lib/useAppSettings";

type Notice = { kind: "info" | "success" | "error"; message: string };
type DraftPurchaseRow = {
  materialId: string | null;
  description: string;
  variation: string;
  quantity: number;
  unitCostCents: number;
  usableQuantity: number;
  purchaseDate: string;
  marketplace: PurchaseMarketplace;
  store: string;
};

type MaterialOption = Pick<
  MaterialRecord,
  "id" | "name" | "supplier" | "unit" | "isActive" | "lastPurchaseCostCents" | "lastPurchaseDate"
>;

const inputBase =
  "w-full rounded-xl border border-border bg-paper/65 px-3 py-2 text-sm text-ink placeholder:text-muted/80 outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15";
const inputMono = "tabular-nums font-mono tracking-tight";
const marketplaceLabels: Record<PurchaseMarketplace, string> = {
  shopee: "Shopee",
  lazada: "Lazada",
  local: "Local",
  other: "Other",
};
const INCOMPLETE_DRAFT_POPUP_MESSAGE =
  "Complete required fields first: Material, Description, Marketplace, Quantity, Cost, and Usable Quantity.";

function makeDraftPurchase(defaults?: {
  purchaseDate?: string;
  marketplace?: PurchaseMarketplace;
}): DraftPurchaseRow {
  return {
    materialId: null,
    description: "",
    variation: "",
    quantity: 0,
    unitCostCents: 0,
    usableQuantity: 0,
    purchaseDate: defaults?.purchaseDate || currentDateInputValue(),
    marketplace: defaults?.marketplace || "local",
    store: "",
  };
}

function isDraftPurchaseComplete(row: DraftPurchaseRow): boolean {
  return (
    row.materialId !== null &&
    row.description.trim().length > 0 &&
    String(row.marketplace || "").trim().length > 0 &&
    row.quantity > 0 &&
    row.unitCostCents > 0 &&
    row.usableQuantity > 0
  );
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
      const quantity = Number.isFinite(quantityRaw) ? Math.max(0, quantityRaw) : fallback.quantity;
      const usableQuantityRaw = Number(row.usableQuantity);
      const usableQuantity = Number.isFinite(usableQuantityRaw)
        ? Math.max(0, usableQuantityRaw)
        : quantity;
      const explicitUnitCostRaw = Number(row.unitCostCents);
      const explicitTotalRaw = Number(row.costCents);
      const legacyTotalRaw = Number(row.totalCostCents);
      const storedTotalCents = Number.isFinite(explicitTotalRaw)
        ? Math.max(0, Math.round(explicitTotalRaw))
        : Number.isFinite(legacyTotalRaw)
          ? Math.max(0, Math.round(legacyTotalRaw))
          : 0;
      const unitCostCents = Number.isFinite(explicitUnitCostRaw)
        ? Math.max(0, Math.round(explicitUnitCostRaw))
        : quantity > 0 && storedTotalCents > 0
          ? computeUnitCostCentsFromCost(quantity, storedTotalCents)
          : fallback.unitCostCents;
      const totalCostCents = computePurchaseTotalCents(quantity, unitCostCents);
      const store = typeof row.store === "string"
        ? row.store
        : typeof row.supplier === "string"
          ? row.supplier
          : fallback.store;
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
        description: typeof row.description === "string" ? row.description : fallback.description,
        variation: typeof row.variation === "string" ? row.variation : fallback.variation,
        quantity,
        usableQuantity,
        unit: typeof row.unit === "string" ? row.unit : fallback.unit,
        unitCostCents,
        costCents: totalCostCents,
        totalCostCents,
        currency: typeof row.currency === "string" ? row.currency.toUpperCase() : fallback.currency,
        marketplace: normalizePurchaseMarketplace(
          typeof row.marketplace === "string" ? row.marketplace : fallback.marketplace,
          "other",
        ),
        store,
        supplier: store,
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
  const [draftPurchase, setDraftPurchase] = useState<DraftPurchaseRow>(() =>
    makeDraftPurchase({ purchaseDate: currentDateInputValue(), marketplace: "local" }),
  );
  const [savingDraftPurchase, setSavingDraftPurchase] = useState(false);
  const [newPurchasePopup, setNewPurchasePopup] = useState<string | null>(null);

  const user = session?.user ?? null;
  const userId = user?.id ?? null;
  const isCloudMode = Boolean(userId && supabase);

  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const hasHydratedRef = useRef(false);
  const savingDraftPurchaseRef = useRef(false);
  const newPurchasePopupTimerRef = useRef<number | null>(null);
  const draftRowRef = useRef<HTMLTableRowElement | null>(null);
  const draftMaterialSelectRef = useRef<HTMLSelectElement | null>(null);

  const toast = useCallback((kind: Notice["kind"], message: string): void => {
    setNotice({ kind, message });
    window.setTimeout(() => setNotice(null), 2600);
  }, []);

  const showNewPurchasePopup = useCallback((message: string) => {
    setNewPurchasePopup(message);
    const existingTimer = newPurchasePopupTimerRef.current;
    if (existingTimer) window.clearTimeout(existingTimer);
    newPurchasePopupTimerRef.current = window.setTimeout(() => {
      setNewPurchasePopup(null);
      newPurchasePopupTimerRef.current = null;
    }, 3200);
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

  const focusDraftMaterialSelect = useCallback((scrollBehavior: ScrollBehavior = "smooth") => {
    const row = draftRowRef.current;
    if (row) {
      const rect = row.getBoundingClientRect();
      const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
      if (!isVisible) {
        row.scrollIntoView({ behavior: scrollBehavior, block: "nearest" });
      }
    }
    window.requestAnimationFrame(() => {
      draftMaterialSelectRef.current?.focus();
    });
  }, []);

  const resetDraftPurchase = useCallback(() => {
    setDraftPurchase(makeDraftPurchase({ purchaseDate: currentDateInputValue(), marketplace: "local" }));
    setNewPurchasePopup(null);
    const timer = newPurchasePopupTimerRef.current;
    if (timer) window.clearTimeout(timer);
    newPurchasePopupTimerRef.current = null;
  }, []);

  function normalizePurchaseRow(row: PurchaseRecord, updatedAt: string): PurchaseRecord {
    const quantity = Number.isFinite(row.quantity) ? Math.max(0, row.quantity) : 0;
    const usableQuantity = Number.isFinite(row.usableQuantity)
      ? Math.max(0, row.usableQuantity)
      : quantity;
    const unitCostRaw = Number.isFinite(row.unitCostCents)
      ? row.unitCostCents
      : quantity > 0
        ? computeUnitCostCentsFromCost(
            quantity,
            Number.isFinite(row.costCents) ? row.costCents : row.totalCostCents,
          )
        : 0;
    const unitCostCents = Math.max(0, Math.round(unitCostRaw));
    const totalCostCents = computePurchaseTotalCents(quantity, unitCostCents);
    const store = (row.store || row.supplier || "").trim();
    return {
      ...row,
      quantity,
      usableQuantity,
      unitCostCents,
      costCents: totalCostCents,
      totalCostCents,
      currency: settings.baseCurrency,
      marketplace: normalizePurchaseMarketplace(row.marketplace, "other"),
      store,
      supplier: store,
      updatedAt,
    };
  }

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
    return () => {
      const timer = newPurchasePopupTimerRef.current;
      if (timer) window.clearTimeout(timer);
      newPurchasePopupTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!newPurchasePopup) return;
    const dismiss = () => {
      setNewPurchasePopup(null);
      const timer = newPurchasePopupTimerRef.current;
      if (timer) window.clearTimeout(timer);
      newPurchasePopupTimerRef.current = null;
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
    };
  }, [newPurchasePopup]);

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
          supplier: next.store,
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
              supplier: next.store,
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
            supplier: next.store,
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
        const normalized = normalizePurchaseRow(updated, now);
        changed = normalized;
        return normalized;
      });

      if (changed && isCloudMode) schedulePersist(changed);
      if (changed && !isCloudMode) void syncMaterialFromPurchase(changed);
      return next;
    });
  }

  function hasDraftPurchaseValues(): boolean {
    return (
      draftPurchase.materialId !== null ||
      draftPurchase.description.trim().length > 0 ||
      draftPurchase.variation.trim().length > 0 ||
      draftPurchase.store.trim().length > 0 ||
      draftPurchase.quantity > 0 ||
      draftPurchase.unitCostCents > 0 ||
      draftPurchase.usableQuantity > 0
    );
  }

  function buildPurchaseFromDraft(id: string): PurchaseRecord {
    const material = draftPurchase.materialId ? (materialById.get(draftPurchase.materialId) ?? null) : null;
    const quantity = Math.max(0, draftPurchase.quantity);
    const unitCostCents = Math.max(0, Math.round(draftPurchase.unitCostCents));
    const usableQuantity = draftPurchase.usableQuantity > 0
      ? Math.max(0, draftPurchase.usableQuantity)
      : quantity;
    const purchaseDate = draftPurchase.purchaseDate || currentDateInputValue();
    const store = draftPurchase.store.trim() || material?.supplier || "";
    const materialName = material?.name ?? "";
    const unit = material?.unit ?? settings.defaultMaterialUnit;
    const total = computePurchaseTotalCents(quantity, unitCostCents);

    const base = makeBlankPurchase(id, {
      currency: settings.baseCurrency,
      purchaseDate,
      materialId: draftPurchase.materialId,
      materialName,
      store,
      supplier: store,
      marketplace: draftPurchase.marketplace,
      unit,
    });

    return normalizePurchaseRow(
      {
        ...base,
        materialId: draftPurchase.materialId,
        materialName,
        description: draftPurchase.description.trim(),
        variation: draftPurchase.variation.trim(),
        quantity,
        usableQuantity,
        unit,
        unitCostCents,
        costCents: total,
        totalCostCents: total,
        purchaseDate,
        marketplace: draftPurchase.marketplace,
        store,
        supplier: store,
      },
      new Date().toISOString(),
    );
  }

  async function commitDraftPurchase(): Promise<void> {
    if (savingDraftPurchaseRef.current) return;
    if (!hasDraftPurchaseValues()) return;
    if (!isDraftPurchaseComplete(draftPurchase)) return;

    savingDraftPurchaseRef.current = true;
    setSavingDraftPurchase(true);

    try {
      const draftRecord = buildPurchaseFromDraft("tmp");

      if (isCloudMode && supabase && userId) {
        const insert = makeBlankPurchaseInsert(userId, {
          currency: draftRecord.currency,
          purchaseDate: draftRecord.purchaseDate,
          materialId: draftRecord.materialId,
          materialName: draftRecord.materialName,
          description: draftRecord.description,
          variation: draftRecord.variation,
          usableQuantity: draftRecord.usableQuantity,
          costCents: draftRecord.costCents,
          marketplace: draftRecord.marketplace,
          store: draftRecord.store,
          supplier: draftRecord.supplier,
          unit: draftRecord.unit,
        });
        insert.purchase_date = draftRecord.purchaseDate;
        insert.material_id = draftRecord.materialId;
        insert.material_name = draftRecord.materialName;
        insert.description = draftRecord.description;
        insert.variation = draftRecord.variation;
        insert.supplier = draftRecord.supplier;
        insert.store = draftRecord.store;
        insert.quantity = draftRecord.quantity;
        insert.usable_quantity = draftRecord.usableQuantity;
        insert.unit = draftRecord.unit;
        insert.unit_cost_cents = draftRecord.unitCostCents;
        insert.total_cost_cents = draftRecord.totalCostCents;
        insert.cost_cents = draftRecord.costCents;
        insert.currency = draftRecord.currency;
        insert.marketplace = draftRecord.marketplace;

        const { data, error } = await supabase.from("purchases").insert(insert).select("*");
        if (error || !data?.[0]) {
          toast("error", error?.message || "Could not create purchase.");
          return;
        }
        const row = normalizePurchaseRow(
          {
            ...rowToPurchase(data[0] as DbPurchaseRow),
            currency: settings.baseCurrency,
          },
          new Date().toISOString(),
        );
        setPurchases((prev) => [...prev, row]);
        await syncMaterialFromPurchase(row);
        setDraftPurchase(
          makeDraftPurchase({
            purchaseDate: currentDateInputValue(),
            marketplace: draftPurchase.marketplace,
          }),
        );
        window.setTimeout(() => focusDraftMaterialSelect("auto"), 0);
        return;
      }

      const row = buildPurchaseFromDraft(makeId("pur"));
      setPurchases((prev) => [...prev, row]);
      await syncMaterialFromPurchase(row);
      setDraftPurchase(
        makeDraftPurchase({
          purchaseDate: currentDateInputValue(),
          marketplace: draftPurchase.marketplace,
        }),
      );
      window.setTimeout(() => focusDraftMaterialSelect("auto"), 0);
    } finally {
      savingDraftPurchaseRef.current = false;
      setSavingDraftPurchase(false);
    }
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
    goToWelcomePage();
  }

  function openSettings() {
    window.location.assign("/settings");
  }

  function onNewPurchaseButtonClick(): void {
    if (savingDraftPurchaseRef.current) return;
    if (!hasDraftPurchaseValues()) {
      focusDraftMaterialSelect();
      return;
    }
    if (!isDraftPurchaseComplete(draftPurchase)) {
      showNewPurchasePopup(INCOMPLETE_DRAFT_POPUP_MESSAGE);
      return;
    }
    void commitDraftPurchase();
  }

  const filteredPurchases = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter((row) => {
      const marketplaceLabel = marketplaceLabels[row.marketplace].toLowerCase();
      return (
        row.purchaseDate.toLowerCase().includes(q) ||
        row.materialName.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q) ||
        row.variation.toLowerCase().includes(q) ||
        row.store.toLowerCase().includes(q) ||
        marketplaceLabel.includes(q) ||
        row.referenceNo.toLowerCase().includes(q) ||
        row.notes.toLowerCase().includes(q)
      );
    });
  }, [purchases, query]);

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
        activeItem="Purchases"
        onUnimplementedNavigate={(section) => toast("info", `${section} section coming soon.`)}
        onSettings={openSettings}
        onLogout={() => void signOut()}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search purchases..."
        onQuickAdd={() => focusDraftMaterialSelect()}
        quickAddLabel="+ New Purchase"
        profileLabel={session?.user?.email || "Profile"}
      />

      <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
        <div className="flex min-h-[calc(100dvh-var(--app-shell-topbar-height)-2rem)] w-full flex-col animate-[fadeUp_.55s_ease-out]">
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-serif text-4xl leading-[1.08] tracking-tight text-ink">Purchases</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Track purchases with material, description, variation, quantity, cost, usable quantity, marketplace,
                and store.
              </p>
              {!supabase ? (
                <p className="mt-2 text-xs text-muted">
                  {supabaseError || "Supabase is not configured. Purchases will stay local in this browser."}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95 active:translate-y-px"
                onClick={onNewPurchaseButtonClick}
              >
                New purchase
              </button>
            </div>
          </header>

          {newPurchasePopup ? (
            <PopupNotification
              message={newPurchasePopup}
              locationClassName="fixed right-4 top-20 z-50 max-w-md"
            />
          ) : null}

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
              <table data-input-layout className="w-max min-w-full text-left text-sm">
                <thead className="bg-paper/55">
                  <tr>
                    <th className="w-[230px] min-w-[230px] max-w-[230px] px-3 py-2 font-mono text-xs font-semibold text-muted">
                      Material
                    </th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Description</th>
                    <th className="px-3 py-2 font-mono text-xs font-semibold text-muted">Variation</th>
                    <th className="w-[80px] px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">
                      Quantity
                    </th>
                    <th className="w-[100px] px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">
                      Cost
                    </th>
                    <th className="w-[120px] px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">
                      Total Cost
                    </th>
                    <th className="w-[80px] px-3 py-2 font-mono text-xs font-semibold text-muted tabular-nums">
                      Usable Quantity
                    </th>
                    <th className="w-[110px] min-w-[110px] max-w-[110px] px-3 py-2 font-mono text-xs font-semibold text-muted">
                      Purchased Date
                    </th>
                    <th className="w-[120px] px-3 py-2 font-mono text-xs font-semibold text-muted">Marketplace</th>
                    <th className="w-[120px] px-3 py-2 font-mono text-xs font-semibold text-muted">Store</th>
                    <th className="w-[75px] px-3 py-2 font-mono text-xs font-semibold text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.map((row) => (
                    <tr key={row.id} className="align-middle">
                      <td className="w-[230px] min-w-[230px] max-w-[230px] p-2 align-middle">
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
                              store: material ? x.store || material.supplier : x.store,
                              supplier: material ? x.store || material.supplier : x.supplier,
                              unit: material ? material.unit : x.unit,
                            }));
                          }}
                        >
                          <option value="">
                            {row.materialName ? `Unlinked (${row.materialName})` : "Select material"}
                          </option>
                          {materials.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                              {item.isActive ? "" : " (inactive)"}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 align-middle">
                        <input
                          className={inputBase}
                          value={row.description}
                          onChange={(e) =>
                            updatePurchase(row.id, (x) => ({ ...x, description: e.target.value }))
                          }
                          placeholder="Description"
                        />
                      </td>
                      <td className="p-2 align-middle">
                        <input
                          className={inputBase}
                          value={row.variation}
                          onChange={(e) =>
                            updatePurchase(row.id, (x) => ({ ...x, variation: e.target.value }))
                          }
                          placeholder="Variation"
                        />
                      </td>
                      <td className="w-[80px] p-2 align-middle">
                        <DeferredNumberInput
                          className={inputBase + " " + inputMono}
                          value={row.quantity}
                          onCommit={(value) =>
                            updatePurchase(row.id, (x) => ({
                              ...x,
                              quantity: Math.max(0, value),
                            }))
                          }
                        />
                      </td>
                      <td className="w-[100px] p-2 align-middle">
                        <DeferredMoneyInput
                          className={inputBase + " " + inputMono}
                          valueCents={row.unitCostCents}
                          onCommitCents={(valueCents) =>
                            updatePurchase(row.id, (x) => ({
                              ...x,
                              unitCostCents: valueCents,
                            }))
                          }
                        />
                      </td>
                      <td className="w-[120px] p-2 align-middle">
                        <p className="px-3 py-2 font-mono text-sm text-ink">
                          {formatMoney(computePurchaseTotalCents(row.quantity, row.unitCostCents))}
                        </p>
                      </td>
                      <td className="w-[80px] p-2 align-middle">
                        <DeferredNumberInput
                          className={inputBase + " " + inputMono}
                          value={row.usableQuantity}
                          onCommit={(value) =>
                            updatePurchase(row.id, (x) => ({
                              ...x,
                              usableQuantity: Math.max(0, value),
                            }))
                          }
                        />
                      </td>
                      <td className="w-[110px] min-w-[110px] max-w-[110px] p-2 align-middle">
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
                      <td className="w-[120px] p-2 align-middle">
                        <select
                          className={inputBase}
                          value={row.marketplace}
                          onChange={(e) =>
                            updatePurchase(row.id, (x) => ({
                              ...x,
                              marketplace: normalizePurchaseMarketplace(e.target.value, "other"),
                            }))
                          }
                        >
                          {PURCHASE_MARKETPLACES.map((item) => (
                            <option key={item} value={item}>
                              {marketplaceLabels[item]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="w-[120px] p-2 align-middle">
                        <input
                          className={inputBase}
                          value={row.store}
                          onChange={(e) =>
                            updatePurchase(row.id, (x) => ({
                              ...x,
                              store: e.target.value,
                              supplier: e.target.value,
                            }))
                          }
                          placeholder="Store"
                        />
                      </td>
                      <td className="w-[75px] p-2 align-middle">
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

                  <tr
                    ref={draftRowRef}
                    className="align-middle"
                    onBlurCapture={(e) =>
                      handleDraftRowBlurCapture(e, () => {
                        void commitDraftPurchase();
                      })
                    }
                    onKeyDownCapture={(e) =>
                      handleDraftRowKeyDownCapture(e, {
                        commit: () => {
                          void commitDraftPurchase();
                        },
                        reset: resetDraftPurchase,
                        focusAfterReset: () => focusDraftMaterialSelect("auto"),
                      })
                    }
                  >
                    <td className="w-[230px] min-w-[230px] max-w-[230px] p-2 align-middle">
                      <select
                        ref={draftMaterialSelectRef}
                        className={inputBase}
                        value={draftPurchase.materialId ?? ""}
                        onChange={(e) => {
                          const materialId = e.target.value || null;
                          const material = materialId ? materialById.get(materialId) ?? null : null;
                          setDraftPurchase((prev) => ({
                            ...prev,
                            materialId,
                            store: prev.store || material?.supplier || "",
                          }));
                        }}
                        disabled={savingDraftPurchase}
                      >
                        <option value="">Select material</option>
                        {materials.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                            {item.isActive ? "" : " (inactive)"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 align-middle">
                      <input
                        className={inputBase}
                        value={draftPurchase.description}
                        onChange={(e) =>
                          setDraftPurchase((prev) => ({ ...prev, description: e.target.value }))
                        }
                        placeholder="Description"
                        disabled={savingDraftPurchase}
                      />
                    </td>
                    <td className="p-2 align-middle">
                      <input
                        className={inputBase}
                        value={draftPurchase.variation}
                        onChange={(e) =>
                          setDraftPurchase((prev) => ({ ...prev, variation: e.target.value }))
                        }
                        placeholder="Variation"
                        disabled={savingDraftPurchase}
                      />
                    </td>
                    <td className="w-[80px] p-2 align-middle">
                      <DeferredNumberInput
                        className={inputBase + " " + inputMono}
                        value={draftPurchase.quantity}
                        onCommit={(value) =>
                          setDraftPurchase((prev) => ({
                            ...prev,
                            quantity: Math.max(0, value),
                          }))
                        }
                        disabled={savingDraftPurchase}
                      />
                    </td>
                    <td className="w-[100px] p-2 align-middle">
                      <DeferredMoneyInput
                        className={inputBase + " " + inputMono}
                        valueCents={draftPurchase.unitCostCents}
                        onCommitCents={(valueCents) =>
                          setDraftPurchase((prev) => ({
                            ...prev,
                            unitCostCents: valueCents,
                          }))
                        }
                        disabled={savingDraftPurchase}
                      />
                    </td>
                    <td className="w-[120px] p-2 align-middle">
                      <p className="px-3 py-2 font-mono text-sm text-ink">
                        {formatMoney(computePurchaseTotalCents(draftPurchase.quantity, draftPurchase.unitCostCents))}
                      </p>
                    </td>
                    <td className="w-[80px] p-2 align-middle">
                      <DeferredNumberInput
                        className={inputBase + " " + inputMono}
                        value={draftPurchase.usableQuantity}
                        onCommit={(value) =>
                          setDraftPurchase((prev) => ({
                            ...prev,
                            usableQuantity: Math.max(0, value),
                          }))
                        }
                        disabled={savingDraftPurchase}
                      />
                    </td>
                    <td className="w-[110px] min-w-[110px] max-w-[110px] p-2 align-middle">
                      <input
                        className={inputBase + " " + inputMono}
                        type="date"
                        value={draftPurchase.purchaseDate}
                        onChange={(e) =>
                          setDraftPurchase((prev) => ({
                            ...prev,
                            purchaseDate: e.target.value || currentDateInputValue(),
                          }))
                        }
                        disabled={savingDraftPurchase}
                      />
                    </td>
                    <td className="w-[120px] p-2 align-middle">
                      <select
                        className={inputBase}
                        value={draftPurchase.marketplace}
                        onChange={(e) =>
                          setDraftPurchase((prev) => ({
                            ...prev,
                            marketplace: normalizePurchaseMarketplace(e.target.value, "other"),
                          }))
                        }
                        disabled={savingDraftPurchase}
                      >
                        {PURCHASE_MARKETPLACES.map((item) => (
                          <option key={item} value={item}>
                            {marketplaceLabels[item]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="w-[120px] p-2 align-middle">
                      <input
                        className={inputBase}
                        value={draftPurchase.store}
                        onChange={(e) =>
                          setDraftPurchase((prev) => ({ ...prev, store: e.target.value }))
                        }
                        placeholder="Store"
                        disabled={savingDraftPurchase}
                      />
                    </td>
                    <td className="w-[75px] p-2 align-middle">
                      <span className="font-mono text-[11px] text-muted">
                        {savingDraftPurchase ? "Saving..." : "Auto"}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="border-t border-border bg-paper/40 px-4 py-3 text-xs text-muted">
              Total purchases value:{" "}
              <span className="font-mono text-ink">
                {formatMoney(filteredPurchases.reduce((sum, row) => sum + row.totalCostCents, 0))}
              </span>
            </div>
          </section>

          <MainContentStatusFooter
            userLabel={session ? user?.email || user?.id : null}
            syncLabel="purchases sync via Supabase"
            guestLabel="saved in this browser (localStorage)"
          />
        </div>
      </div>
    </div>
  );
}

