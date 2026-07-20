"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { DataSelectionModal } from "@/components/DataSelectionModal";
import { DeferredNumberInput } from "@/components/DeferredNumericInput";
import { GlobalAppToast } from "@/components/GlobalAppToast";
import { useToastNotice } from "@/lib/useToastNotice";
import { MainContentStatusFooter } from "@/components/MainContentStatusFooter";
import { MainNavMenu } from "@/components/MainNavMenu";
import { ShareSheetModal } from "@/components/ShareSheetModal";
import { makeId } from "@/lib/costing";
import { formatCents } from "@/lib/format";
import {
  defaultUomConversions,
  makeDefaultSettings,
  type AppSettings,
  type DateFormatOption,
  type UomConversion,
} from "@/lib/settings";
import { signOutAndClearClientAuth } from "@/lib/supabase/auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getUserProfileImageUrl } from "@/lib/supabase/profile";
import { goToWelcomePage } from "@/lib/navigation";
import { useAccountDataScope } from "@/lib/useAccountDataScope";
import { useAppSettings } from "@/lib/useAppSettings";


const inputBase =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-base text-ink placeholder:text-muted/80 outline-none shadow-sm transition-colors hover:border-zinc-300 focus:border-accent/60 focus:ring-2 focus:ring-accent/15 sm:text-sm";
const cardClassName = [
  "rounded-2xl border border-border bg-card/80",
  "shadow-[0_8px_28px_rgba(0,0,0,.06)]",
  "backdrop-blur-md",
].join(" ");

function sectionTitleClass() {
  return "font-serif text-2xl tracking-tight text-ink";
}

function safeCurrencyExample(currency: string, display: "symbol" | "code"): string {
  const value = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) {
    return display === "code" ? "USD 12.34" : "$12.34";
  }
  try {
    return formatCents(1234, value, { currencyDisplay: display });
  } catch {
    return display === "code" ? "USD 12.34" : "$12.34";
  }
}

export default function SettingsApp() {
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

  const { notice, toast, dismiss } = useToastNotice();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(() => !supabase);
  const [saving, setSaving] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const user = session?.user ?? null;


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

  const { settings, setSettings, settingsReady, saveSettings } = useAppSettings({
    supabase,
    userId: activeOwnerUserId,
    authReady: dataAuthReady,
    onError: (message) => toast("error", message),
  });

  function openSettingsPage() {
    router.push("/settings");
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

  function updateSettings(updater: (prev: AppSettings) => AppSettings) {
    if (isReadOnlyData) return;
    setSettings((prev) => ({ ...updater(prev) }));
  }

  function updateConversion(id: string, updater: (row: UomConversion) => UomConversion) {
    updateSettings((prev) => ({
      ...prev,
      uomConversions: prev.uomConversions.map((row) => (row.id === id ? updater(row) : row)),
    }));
  }

  function addConversion() {
    if (isReadOnlyData) return;
    updateSettings((prev) => ({
      ...prev,
      uomConversions: [
        ...prev.uomConversions,
        { id: makeId("conv"), fromUnit: "", toUnit: "", factor: 1 },
      ],
    }));
  }

  function removeConversion(id: string) {
    if (isReadOnlyData) return;
    updateSettings((prev) => ({
      ...prev,
      uomConversions: prev.uomConversions.filter((row) => row.id !== id),
    }));
  }

  async function onSave() {
    if (isReadOnlyData) {
      toast("error", "Viewer access is read-only. Ask the owner for Editor access.");
      return;
    }
    setSaving(true);
    const result = await saveSettings(settings);
    setSaving(false);
    if (!result.ok) {
      toast("error", result.message);
      return;
    }
    toast("success", "Settings saved.");
  }

  function resetDefaults() {
    if (isReadOnlyData) return;
    const defaults = makeDefaultSettings(settings.createdAt || new Date().toISOString());
    setSettings(defaults);
    toast("info", "Loaded default settings. Click Save to apply.");
  }

  const timezones = useMemo(
    () => [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "UTC",
      "Asia/Manila",
      "Europe/London",
      "Australia/Sydney",
    ],
    [],
  );

  const countries = useMemo(
    () => [
      { code: "US", label: "United States" },
      { code: "PH", label: "Philippines" },
      { code: "GB", label: "United Kingdom" },
      { code: "CA", label: "Canada" },
      { code: "AU", label: "Australia" },
      { code: "SG", label: "Singapore" },
      { code: "IN", label: "India" },
      { code: "DE", label: "Germany" },
    ],
    [],
  );

  const symbolExample = useMemo(
    () => safeCurrencyExample(settings.baseCurrency, "symbol"),
    [settings.baseCurrency],
  );

  const codeExample = useMemo(
    () => safeCurrencyExample(settings.baseCurrency, "code"),
    [settings.baseCurrency],
  );

  if (!dataAuthReady || !settingsReady) {
    return (
      <div className="min-h-[calc(100dvh-var(--app-shell-topbar-height))]">
        <MainNavMenu
          activeItem="Settings"
          onUnimplementedNavigate={(section) => toast("info", `${section} section coming soon.`)}
          onSettings={openSettingsPage}
          onLogout={() => void signOut()}
          searchPlaceholder="Search settings..."
        />
        <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
          <div className="w-full animate-[fadeUp_.3s_ease-out]">
            <div className="app-skeleton h-8 w-40 rounded-lg" />
            <div className="app-skeleton mt-6 h-[380px] rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-var(--app-shell-topbar-height))]">
      <MainNavMenu
        activeItem="Settings"
        onUnimplementedNavigate={(section) => toast("info", `${section} section coming soon.`)}
        onSettings={openSettingsPage}
        onLogout={() => void signOut()}
        onShare={() => setShowShareModal(true)}
        searchPlaceholder="Search settings..."
        viewerMode={isReadOnlyData}
        profileImageUrl={getUserProfileImageUrl(session?.user)}
        profileLabel={session?.user?.email || "Profile"}
      />

      <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
        <div className="flex min-h-[calc(100dvh-var(--app-shell-topbar-height)-2rem)] sm:min-h-[calc(100dvh-var(--app-shell-topbar-height)-2.5rem)] lg:min-h-[calc(100dvh-var(--app-shell-topbar-height)-3rem)] w-full flex-col animate-[fadeUp_.55s_ease-out]">
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-serif text-[1.75rem] leading-[1.12] tracking-tight text-ink sm:text-[2rem]">Settings</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Configure localization, currency, units, and costing defaults used by Dashboard and Materials.
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
              <button
                type="button"
                className="rounded-xl app-btn-secondary px-4 py-2 text-sm active:translate-y-px"
                onClick={resetDefaults}
                disabled={isReadOnlyData}
              >
                Load defaults
              </button>
              <button
                type="button"
                className="rounded-xl app-btn-primary px-4 py-2 text-sm active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void onSave()}
                disabled={saving || isReadOnlyData}
              >
                {saving ? "Saving..." : "Save settings"}
              </button>
            </div>
          </header>

          <GlobalAppToast notice={notice} onDismiss={dismiss} />

          <fieldset disabled={isReadOnlyData} className="m-0 border-0 p-0">
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className={cardClassName + " p-5"}>
              <h2 className={sectionTitleClass()}>Country and Timezone</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium tracking-wide text-muted">Country</label>
                  <select
                    className={inputBase + " mt-1"}
                    value={settings.countryCode}
                    onChange={(e) => updateSettings((prev) => ({ ...prev, countryCode: e.target.value }))}
                  >
                    {countries.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium tracking-wide text-muted">Timezone</label>
                  <select
                    className={inputBase + " mt-1"}
                    value={settings.timezone}
                    onChange={(e) => updateSettings((prev) => ({ ...prev, timezone: e.target.value }))}
                  >
                    {timezones.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium tracking-wide text-muted">Date format</label>
                  <select
                    className={inputBase + " mt-1"}
                    value={settings.dateFormat}
                    onChange={(e) =>
                      updateSettings((prev) => ({
                        ...prev,
                        dateFormat: e.target.value as DateFormatOption,
                      }))
                    }
                  >
                    <option value="MM/dd/yyyy">MM/DD/YYYY</option>
                    <option value="dd/MM/yyyy">DD/MM/YYYY</option>
                    <option value="yyyy-MM-dd">YYYY-MM-DD</option>
                  </select>
                </div>
              </div>
            </section>

            <section className={cardClassName + " p-5"}>
              <h2 className={sectionTitleClass()}>Currency and Rounding</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium tracking-wide text-muted">Base currency</label>
                  <input
                    className={inputBase + " mt-1 font-mono uppercase"}
                    value={settings.baseCurrency}
                    maxLength={3}
                    onChange={(e) =>
                      updateSettings((prev) => ({ ...prev, baseCurrency: e.target.value.toUpperCase() }))
                    }
                    placeholder="USD"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium tracking-wide text-muted">Currency format</label>
                  <select
                    className={inputBase + " mt-1"}
                    value={settings.currencyDisplay}
                    onChange={(e) =>
                      updateSettings((prev) => ({
                        ...prev,
                        currencyDisplay: e.target.value === "code" ? "code" : "symbol",
                      }))
                    }
                  >
                    <option value="symbol">{`Symbol (${symbolExample})`}</option>
                    <option value="code">{`Code (${codeExample})`}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium tracking-wide text-muted">Rounding (cents)</label>
                  <DeferredNumberInput
                    className={inputBase + " mt-1 font-mono"}
                    value={settings.currencyRoundingIncrement}
                    onCommit={(value) =>
                      updateSettings((prev) => ({
                        ...prev,
                        currencyRoundingIncrement: Math.max(1, Math.min(100, Math.round(value))),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium tracking-wide text-muted">Rounding mode</label>
                  <select
                    className={inputBase + " mt-1"}
                    value={settings.currencyRoundingMode}
                    onChange={(e) =>
                      updateSettings((prev) => ({
                        ...prev,
                        currencyRoundingMode:
                          e.target.value === "up" || e.target.value === "down" ? e.target.value : "nearest",
                      }))
                    }
                  >
                    <option value="nearest">Nearest</option>
                    <option value="up">Always up</option>
                    <option value="down">Always down</option>
                  </select>
                </div>
              </div>
            </section>

            <section className={cardClassName + " p-5"}>
              <h2 className={sectionTitleClass()}>Units and Conversions</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium tracking-wide text-muted">Unit system</label>
                  <select
                    className={inputBase + " mt-1"}
                    value={settings.unitSystem}
                    onChange={(e) =>
                      updateSettings((prev) => ({
                        ...prev,
                        unitSystem: e.target.value === "imperial" ? "imperial" : "metric",
                      }))
                    }
                  >
                    <option value="metric">Metric</option>
                    <option value="imperial">Imperial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium tracking-wide text-muted">Default material unit</label>
                  <input
                    className={inputBase + " mt-1"}
                    value={settings.defaultMaterialUnit}
                    onChange={(e) =>
                      updateSettings((prev) => ({ ...prev, defaultMaterialUnit: e.target.value }))
                    }
                    placeholder="ea"
                  />
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium tracking-wide text-muted">UOM conversions</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg app-btn-secondary px-3 py-1.5 text-xs"
                      onClick={() =>
                        updateSettings((prev) => ({
                          ...prev,
                          uomConversions: defaultUomConversions(),
                        }))
                      }
                    >
                      Reset defaults
                    </button>
                    <button
                      type="button"
                      className="rounded-lg app-btn-secondary px-3 py-1.5 text-xs"
                      onClick={addConversion}
                    >
                      Add conversion
                    </button>
                  </div>
                </div>

                <div className="mt-2 space-y-2">
                  {settings.uomConversions.map((row) => (
                    <div key={row.id} className="grid gap-2 rounded-xl border border-border bg-paper/45 p-2 sm:grid-cols-[1fr_1fr_120px_auto]">
                      <input
                        className={inputBase}
                        value={row.fromUnit}
                        onChange={(e) =>
                          updateConversion(row.id, (prev) => ({ ...prev, fromUnit: e.target.value }))
                        }
                        placeholder="From (e.g., kg)"
                      />
                      <input
                        className={inputBase}
                        value={row.toUnit}
                        onChange={(e) =>
                          updateConversion(row.id, (prev) => ({ ...prev, toUnit: e.target.value }))
                        }
                        placeholder="To (e.g., lb)"
                      />
                      <DeferredNumberInput
                        className={inputBase + " font-mono"}
                        value={row.factor}
                        onCommit={(value) =>
                          updateConversion(row.id, (prev) => ({
                            ...prev,
                            factor: Math.max(0.000001, value),
                          }))
                        }
                        placeholder="Factor"
                      />
                      <button
                        type="button"
                        className="rounded-lg app-btn-danger px-3 py-2 text-xs"
                        onClick={() => removeConversion(row.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className={cardClassName + " p-5"}>
              <h2 className={sectionTitleClass()}>Costing and Tax Defaults</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium tracking-wide text-muted">Costing method</label>
                  <select
                    className={inputBase + " mt-1"}
                    value={settings.costingMethod}
                    onChange={(e) =>
                      updateSettings((prev) => ({
                        ...prev,
                        costingMethod:
                          e.target.value === "average" || e.target.value === "fifo"
                            ? e.target.value
                            : "standard",
                      }))
                    }
                  >
                    <option value="standard">Standard cost</option>
                    <option value="average">Weighted average</option>
                    <option value="fifo">FIFO</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium tracking-wide text-muted">Price includes tax</label>
                  <label className="mt-1 inline-flex w-full items-center gap-2 rounded-xl border border-border bg-paper/55 px-3 py-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={settings.priceIncludesTax}
                      onChange={(e) =>
                        updateSettings((prev) => ({ ...prev, priceIncludesTax: e.target.checked }))
                      }
                    />
                    {settings.priceIncludesTax ? "Yes" : "No"}
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium tracking-wide text-muted">Default waste %</label>
                  <DeferredNumberInput
                    className={inputBase + " mt-1 font-mono"}
                    value={settings.defaultWastePct}
                    onCommit={(value) =>
                      updateSettings((prev) => ({ ...prev, defaultWastePct: Math.max(0, value) }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium tracking-wide text-muted">Default markup %</label>
                  <DeferredNumberInput
                    className={inputBase + " mt-1 font-mono"}
                    value={settings.defaultMarkupPct}
                    onCommit={(value) =>
                      updateSettings((prev) => ({
                        ...prev,
                        defaultMarkupPct: Math.max(0, value),
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium tracking-wide text-muted">Default tax %</label>
                  <DeferredNumberInput
                    className={inputBase + " mt-1 font-mono"}
                    value={settings.defaultTaxPct}
                    onCommit={(value) =>
                      updateSettings((prev) => ({ ...prev, defaultTaxPct: Math.max(0, value) }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium tracking-wide text-muted">Quantity precision</label>
                  <DeferredNumberInput
                    className={inputBase + " mt-1 font-mono"}
                    value={settings.quantityPrecision}
                    onCommit={(value) =>
                      updateSettings((prev) => ({
                        ...prev,
                        quantityPrecision: Math.max(0, Math.min(6, Math.round(value))),
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium tracking-wide text-muted">Price precision</label>
                  <DeferredNumberInput
                    className={inputBase + " mt-1 font-mono"}
                    value={settings.pricePrecision}
                    onCommit={(value) =>
                      updateSettings((prev) => ({
                        ...prev,
                        pricePrecision: Math.max(0, Math.min(6, Math.round(value))),
                      }))
                    }
                  />
                </div>
              </div>
            </section>
          </div>
          </fieldset>

          <MainContentStatusFooter
            userLabel={session ? user?.email || user?.id : null}
            syncLabel="settings sync via Supabase"
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

