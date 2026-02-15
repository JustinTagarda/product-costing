"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { DeferredMoneyInput, DeferredNumberInput } from "@/components/DeferredNumericInput";
import { computeTotals, createDemoSheet, makeBlankSheet, makeId } from "@/lib/costing";
import type { CostSheet, OverheadItem, StoredData } from "@/lib/costing";
import { MainContentStatusFooter } from "@/components/MainContentStatusFooter";
import { MainNavMenu } from "@/components/MainNavMenu";
import { formatShortDate } from "@/lib/format";
import {
  currencyCodeFromSettings,
  currencySymbolFromSettings,
  formatCentsWithSettingsSymbol,
} from "@/lib/currency";
import { parseStoredDataJson } from "@/lib/importExport";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAppSettings } from "@/lib/useAppSettings";
import { formatCode, getNextCodeNumber, isDuplicateKeyError } from "@/lib/itemCodes";
import {
  makeBlankSheetInsert,
  rowToSheet,
  sheetToRowUpdate,
  type DbCostSheetInsert,
  type DbCostSheetRow,
} from "@/lib/supabase/costSheets";
import { goToWelcomePage } from "@/lib/navigation";

type Notice = { kind: "info" | "success" | "error"; message: string };

const inputBase =
  "w-full rounded-xl border border-border bg-paper/65 px-3 py-2 text-sm text-ink placeholder:text-muted/80 outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15";

const inputMono = "tabular-nums font-mono tracking-tight";
const LOCAL_STORAGE_KEY = "product-costing:local:v1";
const WELCOME_GATE_DISMISSED_KEY = "product-costing:welcome-gate:dismissed";
const PRODUCT_CODE_PREFIX = "PR-";

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function cardClassName(): string {
  return [
    "rounded-2xl border border-border bg-card/80",
    "shadow-[0_18px_55px_rgba(0,0,0,.08)]",
    "backdrop-blur-md",
  ].join(" ");
}

function panelClassName(): string {
  return ["rounded-2xl border border-border bg-paper/45", "shadow-sm"].join(" ");
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

function writeLocalSheets(sheets: CostSheet[], selectedId: string | null): void {
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
    // Ignore storage quota/private mode failures.
  }
}

function readWelcomeGateDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(WELCOME_GATE_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeWelcomeGateDismissed(dismissed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (dismissed) {
      window.localStorage.setItem(WELCOME_GATE_DISMISSED_KEY, "1");
      return;
    }
    window.localStorage.removeItem(WELCOME_GATE_DISMISSED_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export default function CostingApp() {
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
  const [query, setQuery] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const hasHydratedSheetsRef = useRef(false);

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const user = session?.user ?? null;
  const userId = user?.id ?? null;
  const isCloudMode = Boolean(userId && supabase);

  const [loadingSheets, setLoadingSheets] = useState(false);
  const [sheets, setSheets] = useState<CostSheet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showWelcomeGate, setShowWelcomeGate] = useState(() => !readWelcomeGateDismissed());

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

  const settingsCurrencyCode = useMemo(
    () => currencyCodeFromSettings(settings.baseCurrency),
    [settings.baseCurrency],
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
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    const client = supabase;
    let cancelled = false;

    async function load() {
      const { data, error } = await client.auth.getSession();
      if (cancelled) return;
      if (error) toast("error", error.message);
      setSession(data.session);
      setAuthReady(true);
    }

    void load();

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
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
    };
  }, []);

  const fetchSheetsForUser = useCallback(
    async (userId: string): Promise<CostSheet[]> => {
      if (!supabase) return [];

      const { data: rows, error } = await supabase
        .from("cost_sheets")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) {
        toast("error", error.message);
        return [];
      }

      const normalized = (rows ?? []).map((r) => rowToSheet(r as DbCostSheetRow));
      if (normalized.length > 0) return normalized;

      // First run: create a deterministic demo sheet for the user.
      const demo = createDemoSheet();
      demo.currency = settingsCurrencyCode;
      const demoInsert: DbCostSheetInsert = {
        user_id: userId,
        name: demo.name,
        sku: demo.sku,
        currency: settingsCurrencyCode,
        unit_name: demo.unitName,
        batch_size: demo.batchSize,
        waste_pct: demo.wastePct,
        markup_pct: demo.markupPct,
        tax_pct: demo.taxPct,
        materials: demo.materials,
        labor: demo.labor,
        overhead: demo.overhead,
        notes: demo.notes,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("cost_sheets")
        .insert(demoInsert)
        .select("*");

      if (insertError) {
        toast("error", insertError.message);
        return [];
      }

      return (inserted ?? []).map((r) => rowToSheet(r as DbCostSheetRow));
    },
    [settingsCurrencyCode, supabase, toast],
  );

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;

    async function load() {
      hasHydratedSheetsRef.current = false;
      setLoadingSheets(true);

      if (isCloudMode && userId) {
        const nextSheets = await fetchSheetsForUser(userId);
        if (cancelled) return;
        setSheets(nextSheets);
        setSelectedId((prev) => {
          if (prev && nextSheets.some((s) => s.id === prev)) return prev;
          return nextSheets[0]?.id ?? null;
        });
        hasHydratedSheetsRef.current = true;
        setLoadingSheets(false);
        return;
      }

      const localData = readLocalSheets();
      const demoSheet = createDemoSheet();
      demoSheet.currency = settingsCurrencyCode;
      const nextSheets =
        localData?.sheets?.length
          ? sortSheetsByUpdatedAtDesc(localData.sheets)
          : [demoSheet];
      const nextSelectedId =
        localData?.selectedId && nextSheets.some((s) => s.id === localData.selectedId)
          ? localData.selectedId
          : nextSheets[0]?.id ?? null;

      if (cancelled) return;
      setSheets(nextSheets);
      setSelectedId(nextSelectedId);
      if (!localData?.sheets?.length) writeLocalSheets(nextSheets, nextSelectedId);
      hasHydratedSheetsRef.current = true;
      setLoadingSheets(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authReady, fetchSheetsForUser, isCloudMode, settingsCurrencyCode, userId]);

  useEffect(() => {
    if (!authReady || isCloudMode || !hasHydratedSheetsRef.current) return;
    writeLocalSheets(sheets, selectedId);
  }, [authReady, isCloudMode, selectedId, sheets]);

  const selectedSheet = useMemo(() => {
    if (!sheets.length) return null;
    const found = selectedId ? sheets.find((s) => s.id === selectedId) : null;
    return found ?? sheets[0];
  }, [selectedId, sheets]);

  const selectedCurrencyPrefix = useMemo(
    () => currencySymbolFromSettings(settingsCurrencyCode),
    [settingsCurrencyCode],
  );

  const filteredSheets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sheets;
    return sheets.filter((s) => {
      const name = (s.name || "untitled").toLowerCase();
      const sku = (s.sku || "").toLowerCase();
      return name.includes(q) || sku.includes(q);
    });
  }, [sheets, query]);

  async function persistSheet(next: CostSheet): Promise<void> {
    if (!isCloudMode || !supabase) return;
    const payload = sheetToRowUpdate(next);
    const { error } = await supabase.from("cost_sheets").update(payload).eq("id", next.id);
    if (error) toast("error", `Save failed: ${error.message}`);
  }

  function schedulePersist(next: CostSheet): void {
    const existing = saveTimersRef.current.get(next.id);
    if (existing) window.clearTimeout(existing);
    const t = window.setTimeout(() => void persistSheet(next), 450);
    saveTimersRef.current.set(next.id, t);
  }

  function updateSelected(updater: (sheet: CostSheet) => CostSheet) {
    if (!selectedSheet) return;
    const now = new Date().toISOString();
    const next = { ...updater(selectedSheet), updatedAt: now };
    setSheets((prev) =>
      sortSheetsByUpdatedAtDesc(prev.map((s) => (s.id === next.id ? next : s))),
    );
    if (isCloudMode) schedulePersist(next);
  }

  function selectSheet(id: string) {
    setSelectedId(id);
  }

  async function signInWithGoogle() {
    if (!supabase) {
      toast("error", supabaseError || "Cloud sync is not configured.");
      return;
    }
    try {
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed.";
      toast("error", msg);
    }
  }

  async function continueAsGuest() {
    if (session && supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast("error", error.message);
        return;
      }
    }
    setShowWelcomeGate(false);
    writeWelcomeGateDismissed(true);
    toast("info", "Continuing as guest. Data will be saved in this browser.");
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
    setShowWelcomeGate(true);
    writeWelcomeGateDismissed(false);
    goToWelcomePage();
  }

  function openSettings() {
    window.location.assign("/settings");
  }

  async function newSheet() {
    const nextCodeNumber = getNextCodeNumber(
      sheets.map((sheet) => sheet.sku),
      PRODUCT_CODE_PREFIX,
    );

    if (isCloudMode && supabase && user) {
      for (let offset = 0; offset < 1000; offset += 1) {
        const code = formatCode(PRODUCT_CODE_PREFIX, nextCodeNumber + offset);
        const { data: existing, error: lookupError } = await supabase
          .from("cost_sheets")
          .select("id")
          .eq("user_id", user.id)
          .eq("sku", code)
          .limit(1);
        if (lookupError) {
          toast("error", lookupError.message);
          return;
        }
        if ((existing ?? []).length > 0) continue;

        const insert = makeBlankSheetInsert(user.id, {
          currency: settingsCurrencyCode,
          wastePct: settings.defaultWastePct,
          markupPct: settings.defaultMarkupPct,
          taxPct: settings.defaultTaxPct,
        });
        insert.sku = code;

        const { data: inserted, error } = await supabase.from("cost_sheets").insert(insert).select("*");
        if (!error && inserted?.[0]) {
          const sheet = rowToSheet(inserted[0] as DbCostSheetRow);
          setSheets((prev) => [sheet, ...prev]);
          setSelectedId(sheet.id);
          toast("success", "New sheet created.");
          return;
        }

        if (error && isDuplicateKeyError(error)) continue;
        toast("error", error?.message || "Could not create sheet.");
        return;
      }

      toast("error", "Could not create sheet. Failed to generate a unique code.");
      return;
    }

    const sheet = makeBlankSheet(makeId("sheet"));
    sheet.sku = formatCode(PRODUCT_CODE_PREFIX, nextCodeNumber);
    sheet.currency = settingsCurrencyCode;
    sheet.wastePct = settings.defaultWastePct;
    sheet.markupPct = settings.defaultMarkupPct;
    sheet.taxPct = settings.defaultTaxPct;
    setSheets((prev) => [sheet, ...prev]);
    setSelectedId(sheet.id);
    toast("success", "New local sheet created.");
  }

  async function duplicateSelected() {
    if (!selectedSheet) return;
    const nextCodeNumber = getNextCodeNumber(
      sheets.map((sheet) => sheet.sku),
      PRODUCT_CODE_PREFIX,
    );

    if (isCloudMode && supabase && user) {
      for (let offset = 0; offset < 1000; offset += 1) {
        const code = formatCode(PRODUCT_CODE_PREFIX, nextCodeNumber + offset);
        const { data: existing, error: lookupError } = await supabase
          .from("cost_sheets")
          .select("id")
          .eq("user_id", user.id)
          .eq("sku", code)
          .limit(1);
        if (lookupError) {
          toast("error", lookupError.message);
          return;
        }
        if ((existing ?? []).length > 0) continue;

        const insert: DbCostSheetInsert = {
          user_id: user.id,
          name: selectedSheet.name ? `${selectedSheet.name} (copy)` : "Untitled (copy)",
          sku: code,
          currency: settingsCurrencyCode,
          unit_name: selectedSheet.unitName,
          batch_size: selectedSheet.batchSize,
          waste_pct: selectedSheet.wastePct,
          markup_pct: selectedSheet.markupPct,
          tax_pct: selectedSheet.taxPct,
          materials: selectedSheet.materials,
          labor: selectedSheet.labor,
          overhead: selectedSheet.overhead,
          notes: selectedSheet.notes,
        };

        const { data: inserted, error } = await supabase.from("cost_sheets").insert(insert).select("*");
        if (!error && inserted?.[0]) {
          const sheet = rowToSheet(inserted[0] as DbCostSheetRow);
          setSheets((prev) => [sheet, ...prev]);
          setSelectedId(sheet.id);
          toast("success", "Sheet duplicated.");
          return;
        }

        if (error && isDuplicateKeyError(error)) continue;
        toast("error", error?.message || "Could not duplicate sheet.");
        return;
      }

      toast("error", "Could not duplicate sheet. Failed to generate a unique code.");
      return;
    }

    const now = new Date().toISOString();
    const localCopy: CostSheet = {
      ...selectedSheet,
      id: makeId("sheet"),
      name: selectedSheet.name ? `${selectedSheet.name} (copy)` : "Untitled (copy)",
      sku: formatCode(PRODUCT_CODE_PREFIX, nextCodeNumber),
      currency: settingsCurrencyCode,
      materials: selectedSheet.materials.map((it) => ({ ...it })),
      labor: selectedSheet.labor.map((it) => ({ ...it })),
      overhead: selectedSheet.overhead.map((it) => ({ ...it })),
      createdAt: now,
      updatedAt: now,
    };
    setSheets((prev) => [localCopy, ...prev]);
    setSelectedId(localCopy.id);
    toast("success", "Local sheet duplicated.");
  }

  async function deleteSelected() {
    if (!selectedSheet) return;
    const ok = window.confirm(`Delete "${selectedSheet.name || "Untitled"}"?`);
    if (!ok) return;

    if (isCloudMode && supabase && user) {
      const { error } = await supabase.from("cost_sheets").delete().eq("id", selectedSheet.id);
      if (error) {
        toast("error", error.message);
        return;
      }
    }

    const remaining = sheets.filter((s) => s.id !== selectedSheet.id);
    setSheets(remaining);
    if (selectedId === selectedSheet.id) setSelectedId(remaining[0]?.id ?? null);
    toast("info", isCloudMode ? "Sheet deleted." : "Local sheet deleted.");
  }

  function exportAll() {
    const stamp = new Date().toISOString().slice(0, 10);
    const payload: StoredData = {
      version: 1,
      sheets,
      selectedId: selectedId ?? undefined,
    };
    downloadJson(`product-costing-${stamp}.json`, payload);
    toast("success", "Export downloaded.");
  }

  function importAll() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    let text = "";
    try {
      text = await file.text();
    } catch {
      toast("error", "Could not read that file.");
      return;
    }

    const imported = parseStoredDataJson(text);
    if (!imported) {
      toast("error", "Unsupported JSON format.");
      return;
    }

    if (isCloudMode && supabase && user) {
      const rows: DbCostSheetInsert[] = imported.sheets.map((s) => ({
        user_id: user.id,
        name: s.name || "Untitled",
        sku: s.sku || "",
        currency: settingsCurrencyCode,
        unit_name: s.unitName || "unit",
        batch_size: s.batchSize || 1,
        waste_pct: s.wastePct || 0,
        markup_pct: s.markupPct || 0,
        tax_pct: s.taxPct || 0,
        materials: s.materials || [],
        labor: s.labor || [],
        overhead: s.overhead || [],
        notes: s.notes || "",
      }));

      const { data: inserted, error } = await supabase.from("cost_sheets").insert(rows).select("*");
      if (error) {
        toast("error", error.message);
        return;
      }

      const insertedSheets = (inserted ?? []).map((r) => rowToSheet(r as DbCostSheetRow));
      setSheets((prev) => sortSheetsByUpdatedAtDesc([...insertedSheets, ...prev]));
      setSelectedId((prev) => prev ?? insertedSheets[0]?.id ?? null);
      toast("success", `Imported ${insertedSheets.length} sheet(s).`);
      return;
    }

    const now = new Date().toISOString();
    const usedIds = new Set(sheets.map((s) => s.id));
    const importedLocal = imported.sheets.map((sheet) => {
      let nextId = sheet.id;
      if (!nextId || usedIds.has(nextId)) nextId = makeId("sheet");
      usedIds.add(nextId);
      return {
        ...sheet,
        id: nextId,
        currency: settingsCurrencyCode,
        createdAt: sheet.createdAt || now,
        updatedAt: now,
      };
    });
    setSheets((prev) => sortSheetsByUpdatedAtDesc([...importedLocal, ...prev]));
    setSelectedId((prev) => prev ?? importedLocal[0]?.id ?? null);
    toast("success", `Imported ${importedLocal.length} local sheet(s).`);
  }

  const totals = useMemo(() => (selectedSheet ? computeTotals(selectedSheet) : null), [selectedSheet]);

  if (!authReady) {
    return (
      <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
        <div className="w-full animate-[fadeUp_.45s_ease-out]">
          <div className="h-6 w-40 rounded bg-ink/10" />
          <div className="mt-6 grid gap-6 md:grid-cols-[320px_minmax(0,1fr)]">
            <div className={cardClassName() + " h-[520px]"} />
            <div className={cardClassName() + " h-[520px]"} />
          </div>
        </div>
      </div>
    );
  }

  if (showWelcomeGate && !session) {
    return (
      <div className="min-h-dvh px-6 py-8">
        <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-4xl flex-col">
          <main className="flex flex-1 items-center justify-center">
            <section className="w-full max-w-xl text-center">
              <p className="text-4xl font-semibold tracking-tight text-ink md:text-5xl">
                Welcome to
              </p>
              <h1 className="mt-2 text-5xl font-bold tracking-tight text-ink md:text-6xl">
                Small Business Costing
              </h1>

              <div className="mx-auto mt-10 w-full max-w-md space-y-4">
                {supabase ? (
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#4f7de5] px-5 py-4 text-base font-semibold text-white shadow-sm transition hover:brightness-95 active:translate-y-px"
                    onClick={() => void signInWithGoogle()}
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-xl font-bold text-[#4f7de5]">
                      G
                    </span>
                    <span>Sign in with Google</span>
                  </button>
                ) : (
                  <div className="w-full rounded-2xl border border-border bg-paper px-5 py-4 text-sm text-muted">
                    Google sign-in is unavailable in this environment.
                  </div>
                )}

                <button
                  type="button"
                  className="w-full rounded-2xl border border-ink bg-paper px-5 py-4 text-base font-semibold text-ink shadow-sm transition hover:bg-ink/[0.03] active:translate-y-px"
                  onClick={() => void continueAsGuest()}
                >
                  Continue as guest
                </button>
              </div>

              <p className="mx-auto mt-10 max-w-2xl text-base text-muted">
                Guest data is saved in this browser only. Sign in with Google to sync and keep
                your sheets persistent across devices.
              </p>

              {notice ? (
                <div
                  className={[
                    "mx-auto mt-6 max-w-md rounded-2xl border px-4 py-3 text-sm",
                    notice.kind === "error"
                      ? "border-danger/40 bg-danger/10 text-danger"
                      : notice.kind === "success"
                        ? "border-accent/30 bg-accent/10 text-ink"
                        : "border-border bg-paper text-ink",
                  ].join(" ")}
                  role="status"
                  aria-live="polite"
                >
                  {notice.message}
                </div>
              ) : null}
            </section>
          </main>

        </div>
      </div>
    );
  }

  if (loadingSheets && sheets.length === 0) {
    return (
      <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
        <div className="w-full animate-[fadeUp_.45s_ease-out]">
          <p className="font-mono text-xs text-muted">Loading sheets...</p>
          <div className="mt-6 grid gap-6 md:grid-cols-[320px_minmax(0,1fr)]">
            <div className={cardClassName() + " h-[520px]"} />
            <div className={cardClassName() + " h-[520px]"} />
          </div>
        </div>
      </div>
    );
  }

  if (!selectedSheet || !totals) {
    return (
      <div className="min-h-dvh">
        <MainNavMenu
          activeItem="Cost Calculator"
          onUnimplementedNavigate={(section) => toast("info", `${section} section coming soon.`)}
          onSettings={openSettings}
          onLogout={() => void signOut()}
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Search sheets..."
          onQuickAdd={() => void newSheet()}
          quickAddLabel="+ New Product"
          profileLabel={session?.user?.email || "Profile"}
        />
        <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
          <div className="w-full animate-[fadeUp_.55s_ease-out]">
            <div className={cardClassName() + " p-6"}>
              <h1 className="font-serif text-3xl tracking-tight text-ink">No sheets yet</h1>
              <p className="mt-2 text-sm text-muted">
                Create your first cost sheet to get started.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95 active:translate-y-px"
                  onClick={() => void newSheet()}
                >
                  New sheet
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <MainNavMenu
        activeItem="Cost Calculator"
        onUnimplementedNavigate={(section) => toast("info", `${section} section coming soon.`)}
        onSettings={openSettings}
        onLogout={() => void signOut()}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search sheets..."
        onQuickAdd={() => void newSheet()}
        quickAddLabel="+ New Product"
        profileLabel={session?.user?.email || "Profile"}
      />
      <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
        <div className="flex min-h-[calc(100dvh-5rem)] w-full flex-col animate-[fadeUp_.55s_ease-out]">
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-serif text-4xl leading-[1.08] tracking-tight text-ink">
              Product Costing
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              {session
                ? "Materials, labor, overhead, and pricing in one ledger. Your sheets sync across devices in Supabase."
                : "Materials, labor, overhead, and pricing in one ledger. Local mode stores sheets in this browser until you sign in."}
            </p>
            {!supabase ? (
              <p className="mt-2 text-xs text-muted">
                {supabaseError || "Supabase is not configured. Google login is disabled in this environment."}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95 active:translate-y-px"
              onClick={() => void newSheet()}
            >
              New sheet
            </button>
            <button
              type="button"
              className="rounded-xl border border-border bg-paper/55 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-paper/70 active:translate-y-px"
              onClick={importAll}
            >
              Import
            </button>
            <button
              type="button"
              className="rounded-xl border border-border bg-paper/55 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-paper/70 active:translate-y-px"
              onClick={exportAll}
            >
              Export
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleImportFile}
            />
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

          <div className="mt-8 grid gap-6 md:grid-cols-[320px_minmax(0,1fr)]">
            <aside className={cardClassName()}>
            <div className="p-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded-xl border border-border bg-paper/55 px-3 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-paper/70 active:translate-y-px"
                  onClick={newSheet}
                  aria-label="Create new sheet"
                >
                  +
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">{filteredSheets.length} sheet(s)</p>
            </div>

            <div className="border-t border-border p-1">
              <ul className="space-y-1">
                {filteredSheets.map((sheet) => {
                  const isActive = selectedSheet.id === sheet.id;
                  const t = computeTotals(sheet);
                  return (
                    <li key={sheet.id}>
                      <button
                        type="button"
                        className={[
                          "w-full rounded-xl px-3 py-3 text-left transition",
                          isActive ? "bg-ink/6 ring-1 ring-accent/30" : "hover:bg-ink/4",
                        ].join(" ")}
                        onClick={() => selectSheet(sheet.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{sheet.name || "Untitled"}</p>
                            <p className="mt-0.5 truncate text-xs text-muted">
                              {sheet.sku ? `${sheet.sku} - ` : ""}
                              {sheet.batchSize} {sheet.unitName}
                              {sheet.batchSize === 1 ? "" : "s"}
                            </p>
                          </div>
                          <p className="shrink-0 font-mono text-[11px] text-muted">{formatAppDate(sheet.updatedAt)}</p>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-border bg-paper/60 px-2 py-0.5 font-mono text-[11px] text-ink">
                            CPU {t.costPerUnitCents === null ? "--" : formatMoney(t.costPerUnitCents)}
                          </span>
                          <span className="rounded-full border border-border bg-paper/60 px-2 py-0.5 font-mono text-[11px] text-ink">
                            Price {t.pricePerUnitCents === null ? "--" : formatMoney(t.pricePerUnitCents)}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            </aside>

            <main className={cardClassName() + " min-w-0"}>
            <div className="p-4 md:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex-1">
                  <label className="block font-mono text-xs text-muted">Product name</label>
                  <input
                    className={inputBase + " mt-1 text-base font-semibold"}
                    value={selectedSheet.name}
                    onChange={(e) => updateSelected((s) => ({ ...s, name: e.target.value }))}
                    placeholder="e.g., Cedar soap bar"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-border bg-paper/55 px-3 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-paper/70 active:translate-y-px"
                    onClick={duplicateSelected}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-border bg-danger/10 px-3 py-2 text-sm font-semibold text-danger shadow-sm transition hover:bg-danger/15 active:translate-y-px"
                    onClick={deleteSelected}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 space-y-6">
                  <section className={panelClassName()}>
                    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                      <h2 className="font-serif text-lg tracking-tight text-ink">Details</h2>
                      <span className="font-mono text-[11px] text-muted">
                        updated {formatAppDate(selectedSheet.updatedAt)}
                      </span>
                    </div>
                    <div className="grid gap-4 p-4 sm:grid-cols-2">
                      <div>
                        <label className="block font-mono text-xs text-muted">SKU (optional)</label>
                        <input
                          className={inputBase + " mt-1"}
                          value={selectedSheet.sku}
                          onChange={(e) => updateSelected((s) => ({ ...s, sku: e.target.value }))}
                          placeholder="e.g., SOAP-12"
                        />
                      </div>
                      <div>
                        <label className="block font-mono text-xs text-muted">Currency</label>
                        <input
                          className={inputBase + " mt-1 font-mono uppercase"}
                          value={settingsCurrencyCode}
                          readOnly
                          aria-readonly="true"
                        />
                        <p className="mt-1 text-[11px] text-muted">Managed from Settings - Currency and Rounding.</p>
                      </div>
                      <div>
                        <label className="block font-mono text-xs text-muted">Batch size</label>
                        <DeferredNumberInput
                          className={inputBase + " mt-1 " + inputMono}
                          value={selectedSheet.batchSize}
                          onCommit={(value) =>
                            updateSelected((s) => ({
                              ...s,
                              batchSize: Math.max(0, Math.trunc(value)),
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="block font-mono text-xs text-muted">Unit name</label>
                        <input
                          className={inputBase + " mt-1"}
                          value={selectedSheet.unitName}
                          onChange={(e) =>
                            updateSelected((s) => ({ ...s, unitName: e.target.value || "unit" }))
                          }
                          placeholder="unit"
                        />
                      </div>
                    </div>
                  </section>

                  <section className={panelClassName()}>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                      <div className="min-w-0">
                        <h2 className="font-serif text-lg tracking-tight text-ink">Materials</h2>
                        <p className="mt-0.5 text-xs text-muted">
                          Direct materials (waste applied below)
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-xl border border-border bg-paper/55 px-3 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-paper/70 active:translate-y-px"
                        onClick={() =>
                          updateSelected((s) => ({
                            ...s,
                            materials: [
                              ...(s.materials || []),
                              { id: makeId("m"), name: "", qty: 1, unit: "", unitCostCents: 0 },
                            ],
                          }))
                        }
                      >
                        Add line
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table data-input-layout className="min-w-[740px] w-full text-left text-sm">
                          <thead>
                            <tr>
                              <th className="px-2 py-2 font-mono text-xs font-semibold text-muted" style={{ minWidth: 220 }}>
                                Item
                              </th>
                              <th className="px-2 py-2 font-mono text-xs font-semibold text-muted tabular-nums" style={{ minWidth: 90 }}>
                                Qty
                              </th>
                              <th className="px-2 py-2 font-mono text-xs font-semibold text-muted" style={{ minWidth: 90 }}>
                                Unit
                              </th>
                              <th className="px-2 py-2 font-mono text-xs font-semibold text-muted tabular-nums" style={{ minWidth: 120 }}>
                                Unit cost
                              </th>
                              <th className="px-2 py-2 font-mono text-xs font-semibold text-muted tabular-nums" style={{ minWidth: 160 }}>
                                Total
                              </th>
                            </tr>
                          </thead>
                          <tbody className="align-top">
                            {selectedSheet.materials.map((it, idx) => (
                              <tr key={it.id} className="animate-[popIn_.14s_ease-out]">
                                <td className="p-2">
                                  <input
                                    className={inputBase}
                                    value={it.name}
                                    onChange={(e) =>
                                      updateSelected((s) => ({
                                        ...s,
                                        materials: s.materials.map((m) =>
                                          m.id === it.id ? { ...m, name: e.target.value } : m,
                                        ),
                                      }))
                                    }
                                    placeholder={idx === 0 ? "e.g., Cedar oil" : ""}
                                  />
                                </td>
                                <td className="p-2">
                                  <DeferredNumberInput
                                    className={inputBase + " " + inputMono}
                                    value={it.qty}
                                    onCommit={(value) =>
                                      updateSelected((s) => ({
                                        ...s,
                                        materials: s.materials.map((m) =>
                                          m.id === it.id ? { ...m, qty: value } : m,
                                        ),
                                      }))
                                    }
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    className={inputBase}
                                    value={it.unit}
                                    onChange={(e) =>
                                      updateSelected((s) => ({
                                        ...s,
                                        materials: s.materials.map((m) =>
                                          m.id === it.id ? { ...m, unit: e.target.value } : m,
                                        ),
                                      }))
                                    }
                                    placeholder="ea / g / yd"
                                  />
                                </td>
                                <td className="p-2">
                                  <div className="relative">
                                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-xs text-muted">
                                      {selectedCurrencyPrefix}
                                    </span>
                                    <DeferredMoneyInput
                                      className={inputBase + " pl-7 " + inputMono}
                                      valueCents={it.unitCostCents}
                                      onCommitCents={(valueCents) =>
                                        updateSelected((s) => ({
                                          ...s,
                                          materials: s.materials.map((m) =>
                                            m.id === it.id
                                              ? { ...m, unitCostCents: valueCents }
                                              : m,
                                          ),
                                        }))
                                      }
                                    />
                                  </div>
                                </td>
                                <td className="p-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-sm tabular-nums text-ink">
                                      {formatMoney(Math.round(it.qty * it.unitCostCents))}
                                    </span>
                                    <button
                                      type="button"
                                      className="rounded-lg border border-border bg-paper/55 px-2 py-1 text-xs font-semibold text-ink transition hover:bg-paper/70"
                                      onClick={() =>
                                        updateSelected((s) => {
                                          const next = s.materials.filter((m) => m.id !== it.id);
                                          return {
                                            ...s,
                                            materials:
                                              next.length > 0
                                                ? next
                                                : [{ id: makeId("m"), name: "", qty: 1, unit: "", unitCostCents: 0 }],
                                          };
                                        })
                                      }
                                      aria-label="Remove material line"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                      </table>
                    </div>

                    <div className="flex flex-wrap gap-3 border-t border-border px-4 py-3">
                        <div className="flex-1">
                          <label className="block font-mono text-xs text-muted">Waste %</label>
                          <DeferredNumberInput
                            className={inputBase + " mt-1 " + inputMono}
                            value={selectedSheet.wastePct}
                            onCommit={(value) =>
                              updateSelected((s) => ({ ...s, wastePct: Math.max(0, value) }))
                            }
                          />
                        </div>
                        <div className="min-w-[240px]">
                          <p className="font-mono text-xs text-muted">Materials subtotal</p>
                          <p className="mt-1 font-mono text-sm tabular-nums text-ink">
                            {formatMoney(totals.materialsSubtotalCents)}{" "}
                            <span className="text-muted">
                              -&gt; {formatMoney(totals.materialsWithWasteCents)} with waste
                            </span>
                          </p>
                        </div>
                      </div>
                  </section>

                  <section className={panelClassName()}>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                      <div className="min-w-0">
                        <h2 className="font-serif text-lg tracking-tight text-ink">Labor</h2>
                        <p className="mt-0.5 text-xs text-muted">Hands-on time</p>
                      </div>
                      <button
                        type="button"
                        className="rounded-xl border border-border bg-paper/55 px-3 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-paper/70 active:translate-y-px"
                        onClick={() =>
                          updateSelected((s) => ({
                            ...s,
                            labor: [...(s.labor || []), { id: makeId("l"), role: "", hours: 0, rateCents: 0 }],
                          }))
                        }
                      >
                        Add line
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table data-input-layout className="min-w-[740px] w-full text-left text-sm">
                          <thead>
                            <tr>
                              <th className="px-2 py-2 font-mono text-xs font-semibold text-muted" style={{ minWidth: 220 }}>
                                Role
                              </th>
                              <th className="px-2 py-2 font-mono text-xs font-semibold text-muted tabular-nums" style={{ minWidth: 90 }}>
                                Hours
                              </th>
                              <th className="px-2 py-2 font-mono text-xs font-semibold text-muted tabular-nums" style={{ minWidth: 120 }}>
                                Rate
                              </th>
                              <th className="px-2 py-2 font-mono text-xs font-semibold text-muted tabular-nums" style={{ minWidth: 180 }}>
                                Total
                              </th>
                            </tr>
                          </thead>
                          <tbody className="align-top">
                            {selectedSheet.labor.map((it, idx) => (
                              <tr key={it.id} className="animate-[popIn_.14s_ease-out]">
                                <td className="p-2">
                                  <input
                                    className={inputBase}
                                    value={it.role}
                                    onChange={(e) =>
                                      updateSelected((s) => ({
                                        ...s,
                                        labor: s.labor.map((l) =>
                                          l.id === it.id ? { ...l, role: e.target.value } : l,
                                        ),
                                      }))
                                    }
                                    placeholder={idx === 0 ? "e.g., Assembly" : ""}
                                  />
                                </td>
                                <td className="p-2">
                                  <DeferredNumberInput
                                    className={inputBase + " " + inputMono}
                                    value={it.hours}
                                    onCommit={(value) =>
                                      updateSelected((s) => ({
                                        ...s,
                                        labor: s.labor.map((l) =>
                                          l.id === it.id
                                            ? { ...l, hours: Math.max(0, value) }
                                            : l,
                                        ),
                                      }))
                                    }
                                  />
                                </td>
                                <td className="p-2">
                                  <div className="relative">
                                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-xs text-muted">
                                      {selectedCurrencyPrefix}
                                    </span>
                                    <DeferredMoneyInput
                                      className={inputBase + " pl-7 " + inputMono}
                                      valueCents={it.rateCents}
                                      onCommitCents={(valueCents) =>
                                        updateSelected((s) => ({
                                          ...s,
                                          labor: s.labor.map((l) =>
                                            l.id === it.id
                                              ? { ...l, rateCents: valueCents }
                                              : l,
                                          ),
                                        }))
                                      }
                                    />
                                  </div>
                                </td>
                                <td className="p-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-sm tabular-nums text-ink">
                                      {formatMoney(Math.round(it.hours * it.rateCents))}
                                    </span>
                                    <button
                                      type="button"
                                      className="rounded-lg border border-border bg-paper/55 px-2 py-1 text-xs font-semibold text-ink transition hover:bg-paper/70"
                                      onClick={() =>
                                        updateSelected((s) => {
                                          const next = s.labor.filter((l) => l.id !== it.id);
                                          return {
                                            ...s,
                                            labor:
                                              next.length > 0
                                                ? next
                                                : [{ id: makeId("l"), role: "", hours: 0, rateCents: 0 }],
                                          };
                                        })
                                      }
                                      aria-label="Remove labor line"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                      </table>
                    </div>

                    <div className="border-t border-border px-4 py-3">
                        <p className="font-mono text-xs text-muted">Labor subtotal</p>
                        <p className="mt-1 font-mono text-sm tabular-nums text-ink">
                          {formatMoney(totals.laborSubtotalCents)}
                        </p>
                      </div>
                  </section>

                  <section className={panelClassName()}>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                      <div className="min-w-0">
                        <h2 className="font-serif text-lg tracking-tight text-ink">Overhead</h2>
                        <p className="mt-0.5 text-xs text-muted">
                          Flat amounts or percentages on (materials+waste + labor)
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-xl border border-border bg-paper/55 px-3 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-paper/70 active:translate-y-px"
                        onClick={() =>
                          updateSelected((s) => ({
                            ...s,
                            overhead: [
                              ...(s.overhead || []),
                              { id: makeId("o"), name: "", kind: "flat", amountCents: 0 },
                            ],
                          }))
                        }
                      >
                        Add line
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table data-input-layout className="min-w-[740px] w-full text-left text-sm">
                          <thead>
                            <tr>
                              <th className="px-2 py-2 font-mono text-xs font-semibold text-muted" style={{ minWidth: 220 }}>
                                Item
                              </th>
                              <th className="px-2 py-2 font-mono text-xs font-semibold text-muted" style={{ minWidth: 120 }}>
                                Type
                              </th>
                              <th className="px-2 py-2 font-mono text-xs font-semibold text-muted tabular-nums" style={{ minWidth: 140 }}>
                                Value
                              </th>
                              <th className="px-2 py-2 font-mono text-xs font-semibold text-muted tabular-nums" style={{ minWidth: 180 }}>
                                Total
                              </th>
                            </tr>
                          </thead>
                          <tbody className="align-top">
                            {selectedSheet.overhead.map((it) => {
                              const base = totals.materialsWithWasteCents + totals.laborSubtotalCents;
                              const lineTotal =
                                it.kind === "flat"
                                  ? it.amountCents
                                  : Math.round((base * Math.max(0, it.percent)) / 100);

                              return (
                                <tr key={it.id} className="animate-[popIn_.14s_ease-out]">
                                  <td className="p-2">
                                    <input
                                      className={inputBase}
                                      value={it.name}
                                      onChange={(e) =>
                                        updateSelected((s) => ({
                                          ...s,
                                          overhead: s.overhead.map((o) =>
                                            o.id === it.id ? { ...o, name: e.target.value } : o,
                                          ) as OverheadItem[],
                                        }))
                                      }
                                      placeholder="e.g., Packaging"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <select
                                      className={inputBase}
                                      value={it.kind}
                                      onChange={(e) =>
                                        updateSelected((s) => ({
                                          ...s,
                                          overhead: s.overhead.map((o) => {
                                            if (o.id !== it.id) return o;
                                            if (e.target.value === "percent") {
                                              return { id: o.id, name: o.name, kind: "percent", percent: 0 };
                                            }
                                            return { id: o.id, name: o.name, kind: "flat", amountCents: 0 };
                                          }) as OverheadItem[],
                                        }))
                                      }
                                    >
                                      <option value="flat">Flat</option>
                                      <option value="percent">Percent</option>
                                    </select>
                                  </td>
                                  <td className="p-2">
                                    {it.kind === "flat" ? (
                                      <div className="relative">
                                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-xs text-muted">
                                          {selectedCurrencyPrefix}
                                        </span>
                                        <DeferredMoneyInput
                                          className={inputBase + " pl-7 " + inputMono}
                                          valueCents={it.amountCents}
                                          onCommitCents={(valueCents) =>
                                            updateSelected((s) => ({
                                              ...s,
                                              overhead: s.overhead.map((o) =>
                                                o.id === it.id
                                                  ? { ...o, amountCents: valueCents }
                                                  : o,
                                              ) as OverheadItem[],
                                            }))
                                          }
                                        />
                                      </div>
                                    ) : (
                                      <div className="relative">
                                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-xs text-muted">
                                          %
                                        </span>
                                        <DeferredNumberInput
                                          className={inputBase + " pr-7 " + inputMono}
                                          value={it.percent}
                                          onCommit={(value) =>
                                            updateSelected((s) => ({
                                              ...s,
                                              overhead: s.overhead.map((o) =>
                                                o.id === it.id
                                                  ? { ...o, percent: Math.max(0, value) }
                                                  : o,
                                              ) as OverheadItem[],
                                            }))
                                          }
                                        />
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-mono text-sm tabular-nums text-ink">
                                        {formatMoney(lineTotal)}
                                      </span>
                                      <button
                                        type="button"
                                        className="rounded-lg border border-border bg-paper/55 px-2 py-1 text-xs font-semibold text-ink transition hover:bg-paper/70"
                                        onClick={() =>
                                          updateSelected((s) => ({
                                            ...s,
                                            overhead: s.overhead.filter((o) => o.id !== it.id),
                                          }))
                                        }
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                      </table>
                    </div>

                    <div className="border-t border-border px-4 py-3">
                        <p className="font-mono text-xs text-muted">Overhead total</p>
                        <p className="mt-1 font-mono text-sm tabular-nums text-ink">
                          {formatMoney(totals.overheadTotalCents)}{" "}
                          <span className="text-muted">
                            ({formatMoney(totals.overheadFlatCents)} flat +{" "}
                            {formatMoney(totals.overheadPercentCents)} percent)
                          </span>
                        </p>
                      </div>
                  </section>

                  <section className={panelClassName()}>
                    <div className="border-b border-border px-4 py-3">
                      <h2 className="font-serif text-lg tracking-tight text-ink">Notes</h2>
                    </div>
                    <div className="p-4">
                      <textarea
                        className={inputBase + " min-h-[120px] resize-y"}
                        value={selectedSheet.notes}
                        onChange={(e) => updateSelected((s) => ({ ...s, notes: e.target.value }))}
                        placeholder="Anything you want to remember: sources, assumptions, vendors..."
                      />
                    </div>
                  </section>
                </div>
                <div className="space-y-6">
                  <section className={panelClassName() + " lg:sticky lg:top-6"}>
                    <div className="border-b border-border px-4 py-3">
                      <h2 className="font-serif text-lg tracking-tight text-ink">Summary</h2>
                    </div>
                    <div className="space-y-3 p-4">
                      <SummaryRow
                        label="Materials (with waste)"
                        value={formatMoney(totals.materialsWithWasteCents)}
                        hint={formatMoney(totals.materialsSubtotalCents)}
                      />
                      <SummaryRow
                        label="Labor"
                        value={formatMoney(totals.laborSubtotalCents)}
                      />
                      <SummaryRow
                        label="Overhead"
                        value={formatMoney(totals.overheadTotalCents)}
                      />
                      <div className="my-2 border-t border-border" />
                      <SummaryRow
                        label="Batch total"
                        value={formatMoney(totals.batchTotalCents)}
                        bold
                      />
                      <SummaryRow
                        label="Cost per unit"
                        value={
                          totals.costPerUnitCents === null
                            ? "--"
                            : formatMoney(totals.costPerUnitCents)
                        }
                        bold
                      />
                    </div>

                    <div className="border-t border-border p-4">
                      <h3 className="font-serif text-base tracking-tight text-ink">Pricing</h3>
                      <div className="mt-3 grid gap-3">
                        <div>
                          <label className="block font-mono text-xs text-muted">Markup %</label>
                          <DeferredNumberInput
                            className={inputBase + " mt-1 " + inputMono}
                            value={selectedSheet.markupPct}
                            onCommit={(value) =>
                              updateSelected((s) => ({
                                ...s,
                                markupPct: Math.max(0, value),
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label className="block font-mono text-xs text-muted">
                            Sales tax % (optional)
                          </label>
                          <DeferredNumberInput
                            className={inputBase + " mt-1 " + inputMono}
                            value={selectedSheet.taxPct}
                            onCommit={(value) =>
                              updateSelected((s) => ({
                                ...s,
                                taxPct: Math.max(0, value),
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="mt-4 space-y-3 rounded-2xl border border-border bg-paper/55 p-4">
                        <SummaryRow
                          label="Suggested price"
                          value={
                            totals.pricePerUnitCents === null
                              ? "--"
                              : formatMoney(totals.pricePerUnitCents)
                          }
                          bold
                        />
                        <SummaryRow
                          label="Profit / unit"
                          value={
                            totals.profitPerUnitCents === null
                              ? "--"
                              : formatMoney(totals.profitPerUnitCents)
                          }
                          hint={totals.marginPct === null ? "" : `${totals.marginPct}% margin`}
                        />
                        <SummaryRow
                          label="Price with tax"
                          value={
                            totals.pricePerUnitWithTaxCents === null
                              ? "--"
                              : formatMoney(totals.pricePerUnitWithTaxCents)
                          }
                        />
                      </div>
                    </div>
                  </section>

                  <section className={panelClassName()}>
                    <div className="border-b border-border px-4 py-3">
                      <h2 className="font-serif text-lg tracking-tight text-ink">Quick export</h2>
                    </div>
                    <div className="space-y-3 p-4">
                      <button
                        type="button"
                        className="w-full rounded-xl border border-border bg-paper/55 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-paper/70 active:translate-y-px"
                        onClick={() => {
                          const stamp = new Date().toISOString().slice(0, 10);
                          downloadJson(`sheet-${stamp}.json`, {
                            version: 1,
                            sheets: [selectedSheet],
                            selectedId: selectedSheet.id,
                          });
                          toast("success", "Sheet export downloaded.");
                        }}
                      >
                        Download this sheet (.json)
                      </button>

                      <button
                        type="button"
                        className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95 active:translate-y-px"
                        onClick={() => {
                          const lines = [
                            ["Product", selectedSheet.name || "Untitled"],
                            ["SKU", selectedSheet.sku || ""],
                            ["Batch size", `${selectedSheet.batchSize} ${selectedSheet.unitName}`],
                            ["Batch total", formatMoney(totals.batchTotalCents)],
                            [
                              "Cost per unit",
                              totals.costPerUnitCents === null
                                ? ""
                                : formatMoney(totals.costPerUnitCents),
                            ],
                            [
                              "Suggested price",
                              totals.pricePerUnitCents === null
                                ? ""
                                : formatMoney(totals.pricePerUnitCents),
                            ],
                          ];
                          const text = lines.map((r) => r.join("\t")).join("\n");
                          navigator.clipboard
                            .writeText(text)
                            .then(() => toast("success", "Summary copied to clipboard."))
                            .catch(() => toast("error", "Clipboard blocked by the browser."));
                        }}
                      >
                        Copy summary (tab-delimited)
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            </div>
            </main>
          </div>

          <MainContentStatusFooter
            userLabel={session ? user?.email || user?.id : null}
            syncLabel="synced via Supabase"
            guestLabel="saved in this browser (localStorage)"
          />

        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  hint,
  bold,
}: {
  label: string;
  value: string;
  hint?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate font-mono text-xs text-muted">{label}</p>
        {hint ? (
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted">{hint}</p>
        ) : null}
      </div>
      <p
        className={[
          "shrink-0 font-mono tabular-nums tracking-tight",
          bold ? "text-base font-semibold text-ink" : "text-sm text-ink",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}


