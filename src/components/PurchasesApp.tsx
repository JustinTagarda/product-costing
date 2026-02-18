"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { DataSelectionModal } from "@/components/DataSelectionModal";
import {
  DeferredMoneyInput,
  DeferredNumberInput,
  parseLooseNumber,
  parseMoneyToCents,
} from "@/components/DeferredNumericInput";
import { GlobalAppToast } from "@/components/GlobalAppToast";
import { ImportDataModal } from "@/components/ImportDataModal";
import { MainContentStatusFooter } from "@/components/MainContentStatusFooter";
import { MainNavMenu } from "@/components/MainNavMenu";
import { ShareSheetModal } from "@/components/ShareSheetModal";
import { appendImportedRowsAtBottom } from "@/lib/importOrdering";
import { makeId } from "@/lib/costing";
import { formatCentsWithSettingsSymbol } from "@/lib/currency";
import { openNativeDatePicker } from "@/lib/datePicker";
import { handleDraftRowBlurCapture, handleDraftRowKeyDownCapture } from "@/lib/tableDraftEntry";
import {
  type MaterialRecord,
} from "@/lib/materials";
import {
  computeUnitCostCentsFromCost,
  computePurchaseTotalCents,
  currentDateInputValue,
  makeBlankPurchase,
  normalizePurchaseMarketplace,
  PURCHASE_MARKETPLACES,
  type PurchaseMarketplace,
  type PurchaseRecord,
} from "@/lib/purchases";
import { resolveImportedSelectValue } from "@/lib/importSelectRules";
import {
  OPTIONAL_PURCHASE_HEADERS,
  REQUIRED_PURCHASE_HEADERS,
  validatePurchasesImportTsv,
} from "@/lib/purchasesImportValidation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { type DbMaterialRow, rowToMaterial } from "@/lib/supabase/materials";
import {
  makeBlankPurchaseInsert,
  purchaseToRowUpdate,
  rowToPurchase,
  type DbPurchaseRow,
} from "@/lib/supabase/purchases";
import { goToWelcomePage } from "@/lib/navigation";
import { useAccountDataScope } from "@/lib/useAccountDataScope";
import { useAppSettings } from "@/lib/useAppSettings";

type Notice = { kind: "info" | "success" | "error"; message: string };
type DraftPurchaseRow = {
  materialId: string | null;
  description: string;
  variation: string;
  quantityInput: string;
  unitCostInput: string;
  usableQuantityInput: string;
  purchaseDate: string;
  marketplace: PurchaseMarketplace | "";
  store: string;
};

type ImportedPurchaseField =
  | "description"
  | "quantity"
  | "unitCostCents"
  | "usableQuantity"
  | "purchaseDate";

type ImportedPurchaseStatus = "pending" | "error" | "saving";

type ImportedPurchaseRowMeta = {
  status: ImportedPurchaseStatus;
  invalidFields: ImportedPurchaseField[];
  emptyMarketplace: boolean;
};

type DateColumnNormalizationResult =
  | {
      ok: true;
      tsv: string;
      normalizedCount: number;
    }
  | {
      ok: false;
      reason: string;
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
const purchaseTableTextCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function comparePurchaseDateAsc(a: string, b: string): number {
  const aDate = Date.parse(`${a || ""}T00:00:00.000Z`);
  const bDate = Date.parse(`${b || ""}T00:00:00.000Z`);
  const aValid = Number.isFinite(aDate);
  const bValid = Number.isFinite(bDate);

  if (aValid && bValid && aDate !== bDate) return aDate - bDate;
  if (aValid !== bValid) return aValid ? -1 : 1;
  return purchaseTableTextCollator.compare(a || "", b || "");
}

function sortPurchasesForInitialLoad(items: PurchaseRecord[]): PurchaseRecord[] {
  return [...items].sort((a, b) => {
    const dateCompare = comparePurchaseDateAsc(a.purchaseDate, b.purchaseDate);
    if (dateCompare !== 0) return dateCompare;

    const materialCompare = purchaseTableTextCollator.compare(
      (a.materialName || "").trim(),
      (b.materialName || "").trim(),
    );
    if (materialCompare !== 0) return materialCompare;

    return purchaseTableTextCollator.compare((a.description || "").trim(), (b.description || "").trim());
  });
}

function parseTsvRows(tsv: string): { header: string[]; rows: string[][] } {
  const lines = tsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) return { header: [], rows: [] };
  const header = lines[0].split("\t").map((cell) => cell.trim());
  const rows = lines.slice(1).map((line) => line.split("\t").map((cell) => cell.trim()));
  return { header, rows };
}

function parseStrictDecimal(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return Number.NaN;
  const normalized = trimmed.replace(/,/g, "").replace(/\u00A0/g, "");
  if (!normalized) return Number.NaN;
  if (/^[\p{Sc}]/u.test(normalized)) {
    return parseStrictDecimal(normalized.replace(/^[\p{Sc}]+/u, ""));
  }
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(normalized)) return Number.NaN;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseStrictMoneyToCents(raw: string): number {
  const parsed = parseStrictDecimal(raw);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.max(0, Math.round(parsed * 100));
}

function toIsoDateParts(year: number, month: number, day: number): string {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return "";
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day;
  if (!isValid) return "";
  const mm = `${month}`.padStart(2, "0");
  const dd = `${day}`.padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function datePreferenceToOrder(dateFormat: string): "mdy" | "dmy" | "ymd" {
  if (dateFormat === "dd/MM/yyyy") return "dmy";
  if (dateFormat === "yyyy-MM-dd") return "ymd";
  return "mdy";
}

function isIsoDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function normalizeImportedDate(raw: string, preferredDateFormat: string = "MM/dd/yyyy"): string {
  const token = raw.trim().replace(/^["']+|["']+$/g, "");
  if (!token) return "";
  if (isIsoDateInput(token)) return token;

  const order = datePreferenceToOrder(preferredDateFormat);
  const numericPattern = /^(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{1,4})$/;
  const numericMatch = token.match(numericPattern);
  if (numericMatch) {
    const partA = Number(numericMatch[1]);
    const partB = Number(numericMatch[2]);
    const partC = Number(numericMatch[3]);

    if (numericMatch[1].length === 4) {
      return toIsoDateParts(partA, partB, partC);
    }

    if (numericMatch[3].length === 4) {
      if (partA > 12 && partB <= 12) return toIsoDateParts(partC, partB, partA);
      if (partB > 12 && partA <= 12) return toIsoDateParts(partC, partA, partB);
      if (partA > 12 && partB > 12) return "";
      if (order === "dmy") return toIsoDateParts(partC, partB, partA);
      return toIsoDateParts(partC, partA, partB);
    }
  }

  if (/^\d{5,6}(\.\d+)?$/.test(token)) {
    const serial = Number(token);
    if (Number.isFinite(serial)) {
      const excelEpochUtc = Date.UTC(1899, 11, 30);
      const millis = excelEpochUtc + Math.trunc(serial) * 24 * 60 * 60 * 1000;
      const date = new Date(millis);
      return toIsoDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
  }

  if (/[A-Za-z]/.test(token)) {
    const parsed = new Date(token);
    if (Number.isFinite(parsed.getTime())) {
      return toIsoDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
    }
  }

  return "";
}

function normalizeDateColumnsInTsv(tsv: string, preferredDateFormat: string): DateColumnNormalizationResult {
  const { header, rows } = parseTsvRows(tsv);
  if (!header.length) {
    return { ok: false, reason: "Validation failed: header row is empty." };
  }

  const dateColumnIndexes = header
    .map((columnName, index) => ({ columnName, index }))
    .filter(({ columnName }) => /\bdate\b/i.test(columnName));

  if (!dateColumnIndexes.length) {
    return { ok: true, tsv, normalizedCount: 0 };
  }

  const nextRows = rows.map((row) => [...row]);
  let normalizedCount = 0;

  for (let rowIndex = 0; rowIndex < nextRows.length; rowIndex += 1) {
    const row = nextRows[rowIndex];
    for (const column of dateColumnIndexes) {
      const rawCell = (row[column.index] ?? "").trim();
      if (!rawCell) continue;
      const normalizedDate = normalizeImportedDate(rawCell, preferredDateFormat);
      if (!normalizedDate) {
        return {
          ok: false,
          reason:
            `Validation failed: could not parse date value "${rawCell}" ` +
            `for column "${column.columnName}" at row ${rowIndex + 2}.`,
        };
      }
      if (normalizedDate !== rawCell) {
        row[column.index] = normalizedDate;
        normalizedCount += 1;
      }
    }
  }

  const normalizedTsv = [header, ...nextRows].map((row) => row.join("\t")).join("\n");
  return { ok: true, tsv: normalizedTsv, normalizedCount };
}

function validateImportedPurchaseRow(row: PurchaseRecord): ImportedPurchaseField[] {
  const invalidFields: ImportedPurchaseField[] = [];

  if (!row.description.trim()) invalidFields.push("description");
  if (!Number.isFinite(row.quantity) || row.quantity < 0) invalidFields.push("quantity");
  if (!Number.isFinite(row.unitCostCents) || row.unitCostCents < 0) invalidFields.push("unitCostCents");
  if (!Number.isFinite(row.usableQuantity) || row.usableQuantity < 0) invalidFields.push("usableQuantity");
  if (!isIsoDateInput(row.purchaseDate)) invalidFields.push("purchaseDate");

  return invalidFields;
}

function makeDraftPurchase(defaults?: {
  purchaseDate?: string;
  marketplace?: PurchaseMarketplace | "";
}): DraftPurchaseRow {
  return {
    materialId: null,
    description: "",
    variation: "",
    quantityInput: "",
    unitCostInput: "",
    usableQuantityInput: "",
    purchaseDate: defaults?.purchaseDate || "",
    marketplace: defaults?.marketplace || "",
    store: "",
  };
}

function isDraftPurchaseComplete(row: DraftPurchaseRow): boolean {
  const quantity = Math.max(0, parseLooseNumber(row.quantityInput));
  const unitCostCents = Math.max(0, parseMoneyToCents(row.unitCostInput));
  const usableQuantity = Math.max(0, parseLooseNumber(row.usableQuantityInput));
  return (
    row.materialId !== null &&
    row.description.trim().length > 0 &&
    String(row.marketplace || "").trim().length > 0 &&
    quantity > 0 &&
    unitCostCents > 0 &&
    usableQuantity > 0
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
  const [draftPurchase, setDraftPurchase] = useState<DraftPurchaseRow>(() => makeDraftPurchase());
  const [savingDraftPurchase, setSavingDraftPurchase] = useState(false);
  const [isDraftPurchaseDateInputActive, setIsDraftPurchaseDateInputActive] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importTextareaValue, setImportTextareaValue] = useState("");
  const [importRowMetaById, setImportRowMetaById] = useState<Record<string, ImportedPurchaseRowMeta>>({});
  const [showShareModal, setShowShareModal] = useState(false);

  const user = session?.user ?? null;

  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const hasHydratedRef = useRef(false);
  const savingDraftPurchaseRef = useRef(false);
  const draftRowRef = useRef<HTMLTableRowElement | null>(null);
  const draftMaterialSelectRef = useRef<HTMLSelectElement | null>(null);
  const draftPurchaseDateInputRef = useRef<HTMLInputElement | null>(null);
  const purchasesRef = useRef<PurchaseRecord[]>([]);
  const importRowMetaByIdRef = useRef<Record<string, ImportedPurchaseRowMeta>>({});
  const importCommitInFlightRef = useRef<Set<string>>(new Set());

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

  const materialById = useMemo(() => {
    return new Map(materials.map((item) => [item.id, item]));
  }, [materials]);

  const materialImportSelectOptions = useMemo(
    () =>
      materials.map((item) => ({
        value: item.id,
        aliases: [item.name],
      })),
    [materials],
  );

  const marketplaceImportSelectOptions = useMemo(
    () =>
      PURCHASE_MARKETPLACES.map((item) => ({
        value: item,
        aliases: [item, marketplaceLabels[item]],
      })),
    [],
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
    setDraftPurchase(makeDraftPurchase());
    setIsDraftPurchaseDateInputActive(false);
  }, []);

  useEffect(() => {
    purchasesRef.current = purchases;
  }, [purchases]);

  useEffect(() => {
    importRowMetaByIdRef.current = importRowMetaById;
  }, [importRowMetaById]);

  const normalizePurchaseRow = useCallback(
    (row: PurchaseRecord, updatedAt: string): PurchaseRecord => {
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
    },
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

    async function loadData() {
      hasHydratedRef.current = false;
      setLoading(true);
      importCommitInFlightRef.current.clear();
      setImportRowMetaById({});

      if (!isCloudMode || !activeOwnerUserId || !supabase) {
        if (cancelled) return;
        setMaterials([]);
        setPurchases([]);
        hasHydratedRef.current = true;
        setLoading(false);
        return;
      }

      const [purchasesRes, materialsRes] = await Promise.all([
        supabase
          .from("purchases")
          .select("*")
          .eq("user_id", activeOwnerUserId),
        supabase.from("materials").select("*").eq("user_id", activeOwnerUserId).order("name", { ascending: true }),
      ]);

      if (cancelled) return;

      if (purchasesRes.error) {
        toast("error", purchasesRes.error.message);
        setPurchases([]);
      } else {
        const rows = (purchasesRes.data ?? [])
          .map((row) => rowToPurchase(row as DbPurchaseRow))
          .map((row) => ({ ...row, currency: settings.baseCurrency }));
        setPurchases(sortPurchasesForInitialLoad(rows));
      }

      if (materialsRes.error) {
        toast("error", materialsRes.error.message);
        setMaterials([]);
      } else {
        const mats = (materialsRes.data ?? []).map((row) => rowToMaterial(row as DbMaterialRow));
        setMaterials(mats.map(toMaterialOption));
      }

      hasHydratedRef.current = true;
      setLoading(false);
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [activeOwnerUserId, dataAuthReady, isCloudMode, settings.baseCurrency, supabase, toast]);

  const syncMaterialFromPurchase = useCallback(
    async (next: PurchaseRecord): Promise<void> => {
      if (!next.materialId) return;
      const updatedAt = new Date().toISOString();

      if (!isCloudMode || !supabase) return;

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
    },
    [isCloudMode, supabase, toast],
  );

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

  function normalizeImportedDraftRow(row: PurchaseRecord, updatedAt: string): PurchaseRecord {
    const quantity = Number.isFinite(row.quantity) ? Math.max(0, row.quantity) : row.quantity;
    const usableQuantity = Number.isFinite(row.usableQuantity)
      ? Math.max(0, row.usableQuantity)
      : row.usableQuantity;
    const unitCostCents = Number.isFinite(row.unitCostCents)
      ? Math.max(0, Math.round(row.unitCostCents))
      : row.unitCostCents;
    const totalCostCents = Number.isFinite(quantity) && Number.isFinite(unitCostCents)
      ? computePurchaseTotalCents(quantity, unitCostCents)
      : 0;
    const store = (row.store || row.supplier || "").trim();
    return {
      ...row,
      quantity,
      usableQuantity,
      unitCostCents,
      costCents: totalCostCents,
      totalCostCents,
      currency: settings.baseCurrency,
      store,
      supplier: store,
      updatedAt,
    };
  }

  function updatePurchase(id: string, updater: (row: PurchaseRecord) => PurchaseRecord): void {
    const now = new Date().toISOString();
    const isImportedRow = Boolean(importRowMetaByIdRef.current[id]);
    setPurchases((prev) => {
      let changed: PurchaseRecord | null = null;
      const next = prev.map((row) => {
        if (row.id !== id) return row;
        const updated = updater(row);
        const normalized = isImportedRow
          ? normalizeImportedDraftRow(updated, now)
          : normalizePurchaseRow(updated, now);
        changed = normalized;
        return normalized;
      });

      if (changed && isImportedRow) {
        const invalidFields = validateImportedPurchaseRow(changed);
        setImportRowMetaById((prevMeta) => {
          const currentMeta = prevMeta[id];
          if (!currentMeta) return prevMeta;
          const nextStatus: ImportedPurchaseStatus =
            currentMeta.status === "saving"
              ? "saving"
              : invalidFields.length > 0
                ? "error"
                : "pending";
          const hasSameStatus = currentMeta.status === nextStatus;
          const hasSameInvalidFields =
            currentMeta.invalidFields.length === invalidFields.length &&
            currentMeta.invalidFields.every((field, idx) => field === invalidFields[idx]);
          if (hasSameStatus && hasSameInvalidFields) return prevMeta;
          return {
            ...prevMeta,
            [id]: {
              ...currentMeta,
              status: nextStatus,
              invalidFields,
            },
          };
        });
      }

      if (changed && !isImportedRow && isCloudMode) schedulePersist(changed);
      return next;
    });
  }

  function hasDraftPurchaseValues(): boolean {
    return (
      draftPurchase.materialId !== null ||
      draftPurchase.description.trim().length > 0 ||
      draftPurchase.variation.trim().length > 0 ||
      draftPurchase.store.trim().length > 0 ||
      draftPurchase.quantityInput.trim().length > 0 ||
      draftPurchase.unitCostInput.trim().length > 0 ||
      draftPurchase.usableQuantityInput.trim().length > 0 ||
      draftPurchase.purchaseDate.trim().length > 0 ||
      String(draftPurchase.marketplace || "").trim().length > 0
    );
  }

  function buildPurchaseFromDraft(id: string): PurchaseRecord {
    const material = draftPurchase.materialId ? (materialById.get(draftPurchase.materialId) ?? null) : null;
    const quantity = Math.max(0, parseLooseNumber(draftPurchase.quantityInput));
    const unitCostCents = Math.max(0, parseMoneyToCents(draftPurchase.unitCostInput));
    const usableQuantity = draftPurchase.usableQuantityInput.trim().length > 0
      ? Math.max(0, parseLooseNumber(draftPurchase.usableQuantityInput))
      : quantity;
    const purchaseDate = draftPurchase.purchaseDate || currentDateInputValue();
    const marketplace = normalizePurchaseMarketplace(draftPurchase.marketplace || "other", "other");
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
      marketplace,
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
        marketplace,
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
    if (!isCloudMode || !supabase || !activeOwnerUserId) {
      toast("error", "Sign in with Google to add purchases.");
      return;
    }

    savingDraftPurchaseRef.current = true;
    setSavingDraftPurchase(true);

    try {
      const draftRecord = buildPurchaseFromDraft("tmp");

      const insert = makeBlankPurchaseInsert(activeOwnerUserId, {
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
      setDraftPurchase(makeDraftPurchase());
      setIsDraftPurchaseDateInputActive(false);
      window.setTimeout(() => focusDraftMaterialSelect("auto"), 0);
      toast("success", "Purchase added.");
    } finally {
      savingDraftPurchaseRef.current = false;
      setSavingDraftPurchase(false);
    }
  }

  async function deletePurchase(id: string) {
    const isImportedDraft = Boolean(importRowMetaByIdRef.current[id]);
    if (!isImportedDraft) {
      if (!isCloudMode || !supabase) {
        toast("error", "Sign in with Google to delete purchases.");
        return;
      }
      const { error } = await supabase.from("purchases").delete().eq("id", id);
      if (error) {
        toast("error", error.message);
        return;
      }
    }
    importCommitInFlightRef.current.delete(id);
    setImportRowMetaById((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPurchases((prev) => prev.filter((row) => row.id !== id));
    toast("success", isImportedDraft ? "Imported row deleted." : "Purchase deleted.");
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
      toast("info", INCOMPLETE_DRAFT_POPUP_MESSAGE);
      return;
    }
    void commitDraftPurchase();
  }

  const validatePurchasesImportForPage = useCallback((tsv: string) => {
    const headerValidation = validatePurchasesImportTsv(tsv);
    if (!headerValidation.ok) return headerValidation;

    const normalizedDatesResult = normalizeDateColumnsInTsv(tsv, settings.dateFormat);
    if (!normalizedDatesResult.ok) {
      return { ok: false as const, reason: normalizedDatesResult.reason };
    }

    const normalizedMessage =
      normalizedDatesResult.normalizedCount > 0
        ? `Normalized ${normalizedDatesResult.normalizedCount} date value(s).`
        : undefined;
    const message = [headerValidation.message, normalizedMessage].filter(Boolean).join(" ").trim();

    return {
      ok: true as const,
      normalizedTsv: normalizedDatesResult.tsv,
      message: message || undefined,
    };
  }, [settings.dateFormat]);

  const commitImportedPurchaseRow = useCallback(
    async (rowId: string): Promise<void> => {
      const existingMeta = importRowMetaByIdRef.current[rowId];
      if (!existingMeta) return;
      if (existingMeta.status === "saving") return;
      if (importCommitInFlightRef.current.has(rowId)) return;

      const row = purchasesRef.current.find((item) => item.id === rowId);
      if (!row) return;

      const invalidFields = validateImportedPurchaseRow(row);
      if (invalidFields.length > 0) {
        setImportRowMetaById((prev) => {
          const current = prev[rowId];
          if (!current) return prev;
          return {
            ...prev,
            [rowId]: {
              ...current,
              status: "error",
              invalidFields,
            },
          };
        });
        return;
      }

      importCommitInFlightRef.current.add(rowId);
      setImportRowMetaById((prev) => {
        const current = prev[rowId];
        if (!current) return prev;
        return {
          ...prev,
          [rowId]: {
            ...current,
            status: "saving",
            invalidFields: [],
          },
        };
      });

      try {
        const normalizedRow = normalizePurchaseRow(
          {
            ...row,
            quantity: Math.max(0, row.quantity),
            unitCostCents: Math.max(0, Math.round(row.unitCostCents)),
            usableQuantity: Math.max(0, row.usableQuantity),
            purchaseDate: row.purchaseDate || currentDateInputValue(),
          },
          new Date().toISOString(),
        );

        if (!isCloudMode || !supabase || !activeOwnerUserId) {
          toast("error", "Sign in with Google to save imported purchases.");
          setImportRowMetaById((prev) => {
            const current = prev[rowId];
            if (!current) return prev;
            return {
              ...prev,
              [rowId]: {
                ...current,
                status: "error",
                invalidFields: validateImportedPurchaseRow(row),
              },
            };
          });
          return;
        }

        const insert = makeBlankPurchaseInsert(activeOwnerUserId, {
          currency: normalizedRow.currency,
          purchaseDate: normalizedRow.purchaseDate,
          materialId: normalizedRow.materialId,
          materialName: normalizedRow.materialName,
          description: normalizedRow.description,
          variation: normalizedRow.variation,
          usableQuantity: normalizedRow.usableQuantity,
          costCents: normalizedRow.costCents,
          marketplace: normalizedRow.marketplace,
          store: normalizedRow.store,
          supplier: normalizedRow.supplier,
          unit: normalizedRow.unit,
        });
        insert.purchase_date = normalizedRow.purchaseDate;
        insert.material_id = normalizedRow.materialId;
        insert.material_name = normalizedRow.materialName;
        insert.description = normalizedRow.description;
        insert.variation = normalizedRow.variation;
        insert.supplier = normalizedRow.supplier;
        insert.store = normalizedRow.store;
        insert.quantity = normalizedRow.quantity;
        insert.usable_quantity = normalizedRow.usableQuantity;
        insert.unit = normalizedRow.unit;
        insert.unit_cost_cents = normalizedRow.unitCostCents;
        insert.total_cost_cents = normalizedRow.totalCostCents;
        insert.cost_cents = normalizedRow.costCents;
        insert.currency = normalizedRow.currency;
        insert.marketplace = normalizedRow.marketplace;

        const { data, error } = await supabase.from("purchases").insert(insert).select("*");
        if (error || !data?.[0]) {
          toast("error", error?.message || "Could not import purchase row.");
          setImportRowMetaById((prev) => {
            const current = prev[rowId];
            if (!current) return prev;
            return {
              ...prev,
              [rowId]: {
                ...current,
                status: "error",
                invalidFields: validateImportedPurchaseRow(row),
              },
            };
          });
          return;
        }

        const savedRow = normalizePurchaseRow(
          {
            ...rowToPurchase(data[0] as DbPurchaseRow),
            currency: settings.baseCurrency,
          },
          new Date().toISOString(),
        );

        setPurchases((prev) => prev.map((item) => (item.id === rowId ? savedRow : item)));
        await syncMaterialFromPurchase(savedRow);

        setImportRowMetaById((prev) => {
          if (!(rowId in prev)) return prev;
          const next = { ...prev };
          delete next[rowId];
          return next;
        });
      } finally {
        importCommitInFlightRef.current.delete(rowId);
      }
    },
    [
      activeOwnerUserId,
      isCloudMode,
      normalizePurchaseRow,
      settings.baseCurrency,
      supabase,
      syncMaterialFromPurchase,
      toast,
    ],
  );

  const importPurchasesFromValidatedTsv = useCallback(
    (tsv: string): void => {
      const normalizedDatesResult = normalizeDateColumnsInTsv(tsv, settings.dateFormat);
      if (!normalizedDatesResult.ok) {
        toast("error", normalizedDatesResult.reason);
        return;
      }

      const { header, rows } = parseTsvRows(normalizedDatesResult.tsv);
      if (!header.length || !rows.length) {
        toast("error", "No importable rows found.");
        return;
      }

      const missingRequiredHeader = REQUIRED_PURCHASE_HEADERS.filter((item) => !header.includes(item));
      if (missingRequiredHeader.length > 0) {
        toast("error", `Missing required header(s): ${missingRequiredHeader.join(", ")}.`);
        return;
      }

      const unknownHeader = header.find(
        (item) =>
          !REQUIRED_PURCHASE_HEADERS.includes(item as (typeof REQUIRED_PURCHASE_HEADERS)[number]) &&
          !OPTIONAL_PURCHASE_HEADERS.includes(item as (typeof OPTIONAL_PURCHASE_HEADERS)[number]),
      );
      if (unknownHeader) {
        toast("error", `Unsupported header: ${unknownHeader}`);
        return;
      }

      const headerIndex = new Map<string, number>(header.map((item, idx) => [item, idx]));
      const now = new Date().toISOString();
      const importedRows: PurchaseRecord[] = [];
      const importedMeta: Record<string, ImportedPurchaseRowMeta> = {};

      for (const rowCells of rows) {
        const cell = (name: string): string => {
          const idx = headerIndex.get(name);
          if (idx === undefined) return "";
          return (rowCells[idx] || "").trim();
        };

        const rawMaterial = cell("Material");
        const resolvedMaterialId = resolveImportedSelectValue(rawMaterial, materialImportSelectOptions);
        const resolvedMaterial = resolvedMaterialId ? materialById.get(resolvedMaterialId) ?? null : null;

        const rawMarketplace = cell("Marketplace");
        const resolvedMarketplace = resolveImportedSelectValue(rawMarketplace, marketplaceImportSelectOptions);
        const emptyMarketplace = rawMarketplace.length > 0 && !resolvedMarketplace;

        const quantity = parseStrictDecimal(cell("Quantity"));
        const unitCostCents = parseStrictMoneyToCents(cell("Cost"));
        const usableQuantity = parseStrictDecimal(cell("Usable Quantity"));
        const normalizedDate = normalizeImportedDate(cell("Purchase Date"), settings.dateFormat);
        const store = cell("Store");
        const variation = cell("Variation");
        const description = cell("Description");
        const id = makeId("pur");

        const quantityValue = Number.isFinite(quantity) ? Math.max(0, quantity) : Number.NaN;
        const unitCostCentsValue = Number.isFinite(unitCostCents)
          ? Math.max(0, Math.round(unitCostCents))
          : Number.NaN;
        const usableQuantityValue = Number.isFinite(usableQuantity)
          ? Math.max(0, usableQuantity)
          : Number.NaN;
        const totalCostCents = Number.isFinite(quantityValue) && Number.isFinite(unitCostCentsValue)
          ? computePurchaseTotalCents(quantityValue, unitCostCentsValue)
          : 0;

        const base = makeBlankPurchase(id, {
          currency: settings.baseCurrency,
          purchaseDate: normalizedDate || currentDateInputValue(),
          materialId: resolvedMaterial?.id ?? null,
          materialName: resolvedMaterial?.name ?? "",
          marketplace: resolvedMarketplace ?? "other",
          store,
          supplier: store,
          unit: resolvedMaterial?.unit ?? settings.defaultMaterialUnit,
        });

        const importedRow: PurchaseRecord = {
          ...base,
          purchaseDate: normalizedDate,
          materialId: resolvedMaterial?.id ?? null,
          materialName: resolvedMaterial?.name ?? "",
          description,
          variation,
          quantity: quantityValue,
          usableQuantity: usableQuantityValue,
          unitCostCents: unitCostCentsValue,
          costCents: totalCostCents,
          totalCostCents,
          marketplace: resolvedMarketplace ?? "other",
          store,
          supplier: store,
          currency: settings.baseCurrency,
          createdAt: now,
          updatedAt: now,
        };

        const invalidFields = validateImportedPurchaseRow(importedRow);
        importedRows.push(importedRow);
        importedMeta[id] = {
          status: invalidFields.length > 0 ? "error" : "pending",
          invalidFields,
          emptyMarketplace,
        };
      }

      if (!importedRows.length) {
        toast("error", "No rows were imported.");
        return;
      }

      setPurchases((prev) => appendImportedRowsAtBottom(prev, importedRows));
      setImportRowMetaById((prev) => ({ ...prev, ...importedMeta }));
      setImportTextareaValue("");
      setIsImportModalOpen(false);

      const errorCount = Object.values(importedMeta).filter((item) => item.status === "error").length;
      if (errorCount > 0) {
        toast(
          "info",
          `Imported ${importedRows.length} row(s). ${errorCount} row(s) have error/incomplete data and need correction before auto-save.`,
        );
      } else {
        toast(
          "success",
          `All ${importedRows.length} row(s) imported successfully. Saving to cloud...`,
        );
      }
    },
    [
      marketplaceImportSelectOptions,
      materialById,
      materialImportSelectOptions,
      settings.baseCurrency,
      settings.dateFormat,
      settings.defaultMaterialUnit,
      toast,
    ],
  );

  useEffect(() => {
    for (const [rowId, meta] of Object.entries(importRowMetaById)) {
      if (meta.status !== "pending") continue;
      const row = purchases.find((item) => item.id === rowId);
      if (!row) continue;
      if (validateImportedPurchaseRow(row).length > 0) continue;
      void commitImportedPurchaseRow(rowId);
    }
  }, [commitImportedPurchaseRow, importRowMetaById, purchases]);

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
        activeItem="Purchases"
        onUnimplementedNavigate={(section) => toast("info", `${section} section coming soon.`)}
        onSettings={openSettings}
        onLogout={() => void signOut()}
        onShare={() => setShowShareModal(true)}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search purchases..."
        profileLabel={session?.user?.email || "Profile"}
      />

      <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
        <div className="flex min-h-[calc(100dvh-var(--app-shell-topbar-height)-2rem)] sm:min-h-[calc(100dvh-var(--app-shell-topbar-height)-2.5rem)] lg:min-h-[calc(100dvh-var(--app-shell-topbar-height)-3rem)] w-full flex-col animate-[fadeUp_.55s_ease-out]">
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-serif text-4xl leading-[1.08] tracking-tight text-ink">Purchases</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Track purchases with material, description, variation, quantity, cost, usable quantity, marketplace,
                and store.
              </p>
              {!supabase ? (
                <p className="mt-2 text-xs text-muted">
                  {supabaseError || "Supabase is required for this app."}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-border bg-paper px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-paper/75 active:translate-y-px"
                onClick={() => setIsImportModalOpen(true)}
              >
                Import
              </button>
              <button
                type="button"
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95 active:translate-y-px"
                onClick={onNewPurchaseButtonClick}
              >
                New purchase
              </button>
            </div>
          </header>

          <ImportDataModal
            isOpen={isImportModalOpen}
            value={importTextareaValue}
            onValueChange={setImportTextareaValue}
            onClose={() => setIsImportModalOpen(false)}
            onImport={importPurchasesFromValidatedTsv}
            validateTsv={validatePurchasesImportForPage}
            title="Import purchases"
            description="Paste a Tab-Separated Value below."
            placeholder="material,description,quantity,cost..."
          />

          <GlobalAppToast notice={notice} />

          <section className={cardClassName() + " mt-6 overflow-hidden"}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="font-mono text-xs text-muted">
                {loading ? "Loading purchases..." : `${filteredPurchases.length} purchase(s)`}
              </p>
              <p className="font-mono text-xs text-muted">Cloud mode</p>
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
                      Purchase Date
                    </th>
                    <th className="w-[120px] px-3 py-2 font-mono text-xs font-semibold text-muted">Marketplace</th>
                    <th className="w-[120px] px-3 py-2 font-mono text-xs font-semibold text-muted">Store</th>
                    <th className="w-[75px] px-3 py-2 font-mono text-xs font-semibold text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.map((row) => {
                    const importedMeta = importRowMetaById[row.id];
                    const isImportedDraftRow = Boolean(importedMeta);
                    const isImportedRowSaving = importedMeta?.status === "saving";
                    const invalidImportedField = (field: ImportedPurchaseField): boolean =>
                      Boolean(importedMeta && importedMeta.invalidFields.includes(field));
                    const marketplaceSelectValue = importedMeta?.emptyMarketplace ? "" : row.marketplace;

                    return (
                      <tr
                        key={row.id}
                        className="align-middle"
                        style={isImportedDraftRow ? { backgroundColor: "#F8F8FF" } : undefined}
                      >
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
                            disabled={isImportedRowSaving}
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
                        <td className={"p-2 align-middle" + (invalidImportedField("description") ? " bg-danger/10" : "")}>
                          <input
                            className={inputBase + (invalidImportedField("description") ? " !bg-[#ffe9ec]" : "")}
                            value={row.description}
                            onChange={(e) =>
                              updatePurchase(row.id, (x) => ({ ...x, description: e.target.value }))
                            }
                            placeholder="Description"
                            disabled={isImportedRowSaving}
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
                            disabled={isImportedRowSaving}
                          />
                        </td>
                        <td className={"w-[80px] p-2 align-middle" + (invalidImportedField("quantity") ? " bg-danger/10" : "")}>
                          <DeferredNumberInput
                            className={
                              inputBase + " " + inputMono + (invalidImportedField("quantity") ? " !bg-[#ffe9ec]" : "")
                            }
                            value={row.quantity}
                            onCommit={(value) =>
                              updatePurchase(row.id, (x) => ({
                                ...x,
                                quantity: Math.max(0, value),
                              }))
                            }
                            disabled={isImportedRowSaving}
                          />
                        </td>
                        <td className={"w-[100px] p-2 align-middle" + (invalidImportedField("unitCostCents") ? " bg-danger/10" : "")}>
                          <DeferredMoneyInput
                            className={
                              inputBase + " " + inputMono + (invalidImportedField("unitCostCents") ? " !bg-[#ffe9ec]" : "")
                            }
                            valueCents={row.unitCostCents}
                            onCommitCents={(valueCents) =>
                              updatePurchase(row.id, (x) => ({
                                ...x,
                                unitCostCents: valueCents,
                              }))
                            }
                            disabled={isImportedRowSaving}
                          />
                        </td>
                        <td className="w-[120px] p-2 align-middle">
                          <p className="px-3 py-2 font-mono text-sm text-ink">
                            {formatMoney(computePurchaseTotalCents(row.quantity, row.unitCostCents))}
                          </p>
                        </td>
                        <td className={"w-[80px] p-2 align-middle" + (invalidImportedField("usableQuantity") ? " bg-danger/10" : "")}>
                          <DeferredNumberInput
                            className={
                              inputBase + " " + inputMono + (invalidImportedField("usableQuantity") ? " !bg-[#ffe9ec]" : "")
                            }
                            value={row.usableQuantity}
                            onCommit={(value) =>
                              updatePurchase(row.id, (x) => ({
                                ...x,
                                usableQuantity: Math.max(0, value),
                              }))
                            }
                            disabled={isImportedRowSaving}
                          />
                        </td>
                        <td className={"w-[110px] min-w-[110px] max-w-[110px] p-2 align-middle" + (invalidImportedField("purchaseDate") ? " bg-danger/10" : "")}>
                          <input
                            className={inputBase + " " + inputMono + (invalidImportedField("purchaseDate") ? " !bg-[#ffe9ec]" : "")}
                            type="date"
                            value={row.purchaseDate}
                            onFocus={(e) => openNativeDatePicker(e.currentTarget)}
                            onChange={(e) =>
                              updatePurchase(row.id, (x) => ({
                                ...x,
                                purchaseDate: e.target.value || (isImportedDraftRow ? "" : currentDateInputValue()),
                              }))
                            }
                            disabled={isImportedRowSaving}
                          />
                        </td>
                        <td className="w-[120px] p-2 align-middle">
                          <select
                            className={inputBase}
                            value={marketplaceSelectValue}
                            onChange={(e) => {
                              const nextMarketplaceValue = e.target.value;
                              if (isImportedDraftRow) {
                                setImportRowMetaById((prev) => {
                                  const current = prev[row.id];
                                  if (!current) return prev;
                                  const nextEmptyMarketplace = nextMarketplaceValue.trim().length === 0;
                                  if (current.emptyMarketplace === nextEmptyMarketplace) return prev;
                                  return {
                                    ...prev,
                                    [row.id]: {
                                      ...current,
                                      emptyMarketplace: nextEmptyMarketplace,
                                    },
                                  };
                                });
                              }
                              updatePurchase(row.id, (x) => ({
                                ...x,
                                marketplace: nextMarketplaceValue
                                  ? normalizePurchaseMarketplace(nextMarketplaceValue, "other")
                                  : x.marketplace,
                              }));
                            }}
                            disabled={isImportedRowSaving}
                          >
                            {isImportedDraftRow ? <option value="">Select marketplace</option> : null}
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
                            disabled={isImportedRowSaving}
                          />
                        </td>
                        <td className="w-[75px] p-2 align-middle">
                          {importedMeta ? (
                            <p
                              className={[
                                "mb-1 rounded px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                                importedMeta.status === "error"
                                  ? "bg-danger/15 text-danger"
                                  : importedMeta.status === "saving"
                                    ? "bg-accent/15 text-ink"
                                    : "bg-paper text-muted",
                              ].join(" ")}
                            >
                              {importedMeta.status}
                            </p>
                          ) : null}
                          <button
                            type="button"
                            className="rounded-lg border border-border bg-danger/10 px-2 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void deletePurchase(row.id)}
                            disabled={isImportedRowSaving}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {!loading && filteredPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-sm text-muted">
                        No purchases found. Create one using <span className="font-semibold">New purchase</span>.
                      </td>
                    </tr>
                  ) : null}

                  <tr
                    ref={draftRowRef}
                    className="app-table-new-entry-row align-middle"
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
                      <input
                        className={inputBase + " " + inputMono}
                        value={draftPurchase.quantityInput}
                        onChange={(e) =>
                          setDraftPurchase((prev) => ({ ...prev, quantityInput: e.target.value }))
                        }
                        placeholder="0"
                        disabled={savingDraftPurchase}
                      />
                    </td>
                    <td className="w-[100px] p-2 align-middle">
                      <input
                        className={inputBase + " " + inputMono}
                        value={draftPurchase.unitCostInput}
                        onChange={(e) =>
                          setDraftPurchase((prev) => ({ ...prev, unitCostInput: e.target.value }))
                        }
                        placeholder="0.00"
                        disabled={savingDraftPurchase}
                      />
                    </td>
                    <td className="w-[120px] p-2 align-middle">
                      <p className="px-3 py-2 font-mono text-sm text-ink">
                        {draftPurchase.quantityInput.trim().length > 0 && draftPurchase.unitCostInput.trim().length > 0
                          ? formatMoney(
                              computePurchaseTotalCents(
                                Math.max(0, parseLooseNumber(draftPurchase.quantityInput)),
                                Math.max(0, parseMoneyToCents(draftPurchase.unitCostInput)),
                              ),
                            )
                          : ""}
                      </p>
                    </td>
                    <td className="w-[80px] p-2 align-middle">
                      <input
                        className={inputBase + " " + inputMono}
                        value={draftPurchase.usableQuantityInput}
                        onChange={(e) =>
                          setDraftPurchase((prev) => ({ ...prev, usableQuantityInput: e.target.value }))
                        }
                        placeholder="0"
                        disabled={savingDraftPurchase}
                      />
                    </td>
                    <td className="w-[110px] min-w-[110px] max-w-[110px] p-2 align-middle">
                      <input
                        ref={draftPurchaseDateInputRef}
                        className={inputBase + " " + inputMono}
                        type={
                          isDraftPurchaseDateInputActive || draftPurchase.purchaseDate
                            ? "date"
                            : "text"
                        }
                        value={draftPurchase.purchaseDate}
                        onChange={(e) =>
                          setDraftPurchase((prev) => ({
                            ...prev,
                            purchaseDate: e.target.value,
                          }))
                        }
                        onFocus={() => {
                          setIsDraftPurchaseDateInputActive(true);
                          window.requestAnimationFrame(() => {
                            openNativeDatePicker(draftPurchaseDateInputRef.current);
                          });
                        }}
                        onBlur={() => setIsDraftPurchaseDateInputActive(false)}
                        placeholder="Purchase Date"
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
                            marketplace: e.target.value
                              ? normalizePurchaseMarketplace(e.target.value, "other")
                              : "",
                          }))
                        }
                        disabled={savingDraftPurchase}
                      >
                        <option value="">Select marketplace</option>
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

