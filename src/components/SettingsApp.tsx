"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { MainNavMenu } from "@/components/MainNavMenu";
import { makeId } from "@/lib/costing";
import { formatCents } from "@/lib/format";
import {
  defaultUomConversions,
  makeDefaultSettings,
  type AppSettings,
  type DateFormatOption,
  type UomConversion,
} from "@/lib/settings";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAppSettings } from "@/lib/useAppSettings";

type Notice = { kind: "info" | "success" | "error"; message: string };

const inputBase =
  "w-full rounded-xl border border-border bg-paper/65 px-3 py-2 text-sm text-ink placeholder:text-muted/80 outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15";
const cardClassName = [
  "rounded-2xl border border-border bg-card/80",
  "shadow-[0_18px_55px_rgba(0,0,0,.08)]",
  "backdrop-blur-md",
].join(" ");

function parseNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

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

  const [notice, setNotice] = useState<Notice | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(() => !supabase);
  const [saving, setSaving] = useState(false);

  const user = session?.user ?? null;
  const userId = user?.id ?? null;

  const toast = useCallback((kind: Notice["kind"], message: string): void => {
    setNotice({ kind, message });
    window.setTimeout(() => setNotice(null), 2600);
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

  const { settings, setSettings, settingsReady, saveSettings } = useAppSettings({
    supabase,
    userId,
    authReady,
    onError: (message) => toast("error", message),
  });

  function openSettingsPage() {
    window.location.assign("/settings");
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

  function updateSettings(updater: (prev: AppSettings) => AppSettings) {
    setSettings((prev) => ({ ...updater(prev) }));
  }

  function updateConversion(id: string, updater: (row: UomConversion) => UomConversion) {
    updateSettings((prev) => ({
      ...prev,
      uomConversions: prev.uomConversions.map((row) => (row.id === id ? updater(row) : row)),
    }));
  }

  function addConversion() {
    updateSettings((prev) => ({
      ...prev,
      uomConversions: [
        ...prev.uomConversions,
        { id: makeId("conv"), fromUnit: "", toUnit: "", factor: 1 },
      ],
    }));
  }

  function removeConversion(id: string) {
    updateSettings((prev) => ({
      ...prev,
      uomConversions: prev.uomConversions.filter((row) => row.id !== id),
    }));
  }

  async function onSave() {
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

  if (!settingsReady) {
    return (
      <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
        <div className="w-full animate-[fadeUp_.45s_ease-out]">
          <p className="font-mono text-xs text-muted">Loading settings...</p>
          <div className={cardClassName + " mt-6 h-[380px]"} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <MainNavMenu
        activeItem="Settings"
        onUnimplementedNavigate={(section) => toast("info", `${section} section coming soon.`)}
        onSettings={openSettingsPage}
        onLogout={() => void signOut()}
        searchPlaceholder="Search settings..."
        onQuickAdd={() => void onSave()}
        quickAddLabel={saving ? "Saving..." : "Save Settings"}
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
                    <span className="text-muted">- settings sync via Supabase</span>
                  </>
                ) : (
                  <>
                    Guest mode <span className="text-muted">- settings saved in this browser (localStorage)</span>
                  </>
                )}
              </p>
              <h1 className="mt-2 font-serif text-4xl leading-[1.08] tracking-tight text-ink">Settings</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Configure localization, currency, units, and costing defaults used by Dashboard and Materials.
              </p>
              {!supabase ? (
                <p className="mt-2 text-xs text-muted">
                  {supabaseError || "Supabase is not configured. Settings will remain local only."}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-border bg-paper/55 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-paper/70 active:translate-y-px"
                onClick={resetDefaults}
              >
                Load defaults
              </button>
              <button
                type="button"
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void onSave()}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save settings"}
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

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className={cardClassName + " p-5"}>
              <h2 className={sectionTitleClass()}>Country and Timezone</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-mono text-xs text-muted">Country</label>
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
                  <label className="block font-mono text-xs text-muted">Timezone</label>
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
                  <label className="block font-mono text-xs text-muted">Date format</label>
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
                  <label className="block font-mono text-xs text-muted">Base currency</label>
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
                  <label className="block font-mono text-xs text-muted">Currency format</label>
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
                  <label className="block font-mono text-xs text-muted">Rounding (cents)</label>
                  <input
                    className={inputBase + " mt-1 font-mono"}
                    type="number"
                    min={1}
                    max={100}
                    value={settings.currencyRoundingIncrement}
                    onChange={(e) =>
                      updateSettings((prev) => ({
                        ...prev,
                        currencyRoundingIncrement: Math.max(1, Math.round(parseNumber(e.target.value))),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block font-mono text-xs text-muted">Rounding mode</label>
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
                  <label className="block font-mono text-xs text-muted">Unit system</label>
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
                  <label className="block font-mono text-xs text-muted">Default material unit</label>
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
                  <label className="block font-mono text-xs text-muted">UOM conversions</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-border bg-paper/55 px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-paper/70"
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
                      className="rounded-lg border border-border bg-paper/55 px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-paper/70"
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
                      <input
                        className={inputBase + " font-mono"}
                        type="number"
                        step={0.000001}
                        min={0.000001}
                        value={row.factor}
                        onChange={(e) =>
                          updateConversion(row.id, (prev) => ({
                            ...prev,
                            factor: Math.max(0.000001, parseNumber(e.target.value)),
                          }))
                        }
                        placeholder="Factor"
                      />
                      <button
                        type="button"
                        className="rounded-lg border border-border bg-danger/10 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/15"
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
                  <label className="block font-mono text-xs text-muted">Costing method</label>
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
                  <label className="block font-mono text-xs text-muted">Price includes tax</label>
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
                  <label className="block font-mono text-xs text-muted">Default waste %</label>
                  <input
                    className={inputBase + " mt-1 font-mono"}
                    type="number"
                    step={0.1}
                    min={0}
                    value={settings.defaultWastePct}
                    onChange={(e) =>
                      updateSettings((prev) => ({ ...prev, defaultWastePct: Math.max(0, parseNumber(e.target.value)) }))
                    }
                  />
                </div>

                <div>
                  <label className="block font-mono text-xs text-muted">Default markup %</label>
                  <input
                    className={inputBase + " mt-1 font-mono"}
                    type="number"
                    step={0.1}
                    min={0}
                    value={settings.defaultMarkupPct}
                    onChange={(e) =>
                      updateSettings((prev) => ({
                        ...prev,
                        defaultMarkupPct: Math.max(0, parseNumber(e.target.value)),
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="block font-mono text-xs text-muted">Default tax %</label>
                  <input
                    className={inputBase + " mt-1 font-mono"}
                    type="number"
                    step={0.1}
                    min={0}
                    value={settings.defaultTaxPct}
                    onChange={(e) =>
                      updateSettings((prev) => ({ ...prev, defaultTaxPct: Math.max(0, parseNumber(e.target.value)) }))
                    }
                  />
                </div>

                <div>
                  <label className="block font-mono text-xs text-muted">Quantity precision</label>
                  <input
                    className={inputBase + " mt-1 font-mono"}
                    type="number"
                    step={1}
                    min={0}
                    max={6}
                    value={settings.quantityPrecision}
                    onChange={(e) =>
                      updateSettings((prev) => ({
                        ...prev,
                        quantityPrecision: Math.max(0, Math.min(6, Math.round(parseNumber(e.target.value)))),
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="block font-mono text-xs text-muted">Price precision</label>
                  <input
                    className={inputBase + " mt-1 font-mono"}
                    type="number"
                    step={1}
                    min={0}
                    max={6}
                    value={settings.pricePrecision}
                    onChange={(e) =>
                      updateSettings((prev) => ({
                        ...prev,
                        pricePrecision: Math.max(0, Math.min(6, Math.round(parseNumber(e.target.value)))),
                      }))
                    }
                  />
                </div>
              </div>
            </section>
          </div>

        </div>
      </div>
    </div>
  );
}

