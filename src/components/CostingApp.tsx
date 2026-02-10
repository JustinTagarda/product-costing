"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { computeTotals, createDemoSheet, makeBlankSheet, makeId } from "@/lib/costing";
import type { CostSheet, OverheadItem, StoredData } from "@/lib/costing";
import { formatCents, formatShortDate } from "@/lib/format";
import { STORAGE_KEY, loadStoredData, parseStoredDataJson, saveStoredData } from "@/lib/storage";

type Notice = { kind: "info" | "success" | "error"; message: string };

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
  return Math.round(n * 100);
}

function centsToMoneyString(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  return (safe / 100).toFixed(2);
}

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

export default function CostingApp() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [query, setQuery] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [data, setData] = useState<StoredData>(() => {
    const initial: StoredData = { version: 1, sheets: [createDemoSheet()], selectedId: "demo" };
    return loadStoredData() ?? initial;
  });

  useEffect(() => {
    const t = window.setTimeout(() => saveStoredData(data), 200);
    return () => window.clearTimeout(t);
  }, [data]);

  function toast(kind: Notice["kind"], message: string): void {
    setNotice({ kind, message });
    window.setTimeout(() => setNotice(null), 2600);
  }

  const selectedSheet = useMemo(() => {
    if (!data.sheets.length) return null;
    const found = data.sheets.find((s) => s.id === data.selectedId);
    return found ?? data.sheets[0];
  }, [data.selectedId, data.sheets]);

  const filteredSheets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.sheets;
    return data.sheets.filter((s) => {
      const name = (s.name || "untitled").toLowerCase();
      const sku = (s.sku || "").toLowerCase();
      return name.includes(q) || sku.includes(q);
    });
  }, [data.sheets, query]);

  function updateSheetById(id: string, updater: (sheet: CostSheet) => CostSheet) {
    setData((prev) => {
      const idx = prev.sheets.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const now = new Date().toISOString();
      const updated = { ...updater(prev.sheets[idx]), updatedAt: now };
      const sheets = [...prev.sheets];
      sheets[idx] = updated;
      return { ...prev, sheets };
    });
  }

  function updateSelected(updater: (sheet: CostSheet) => CostSheet) {
    if (!selectedSheet) return;
    updateSheetById(selectedSheet.id, updater);
  }

  function selectSheet(id: string) {
    setData((prev) => ({ ...prev, selectedId: id }));
  }

  function newSheet() {
    const id = makeId("sheet");
    const sheet = makeBlankSheet(id);
    setData((prev) => ({
      version: 1,
      sheets: [sheet, ...prev.sheets],
      selectedId: id,
    }));
    toast("success", "New sheet created.");
  }

  function duplicateSelected() {
    if (!selectedSheet) return;
    const id = makeId("sheet");
    const now = new Date().toISOString();
    const copy: CostSheet = {
      ...selectedSheet,
      id,
      name: selectedSheet.name ? `${selectedSheet.name} (copy)` : "Untitled (copy)",
      createdAt: now,
      updatedAt: now,
    };
    setData((prev) => ({
      version: 1,
      sheets: [copy, ...prev.sheets],
      selectedId: id,
    }));
    toast("success", "Sheet duplicated.");
  }

  function deleteSelected() {
    if (!selectedSheet) return;
    const ok = window.confirm(`Delete "${selectedSheet.name || "Untitled"}"?`);
    if (!ok) return;

    setData((prev) => {
      const sheets = prev.sheets.filter((s) => s.id !== selectedSheet.id);
      if (!sheets.length) {
        const freshId = makeId("sheet");
        const fresh = makeBlankSheet(freshId);
        return { version: 1, sheets: [fresh], selectedId: freshId };
      }
      const nextId = sheets[0].id;
      return { version: 1, sheets, selectedId: nextId };
    });
    toast("info", "Sheet deleted.");
  }

  function exportAll() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`product-costing-${stamp}.json`, data);
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

    setData((prev) => {
      const map = new Map<string, CostSheet>();
      for (const s of prev.sheets) map.set(s.id, s);
      for (const s of imported.sheets) map.set(s.id, s);
      const sheets = Array.from(map.values());
      const selectedId =
        (imported.selectedId && map.has(imported.selectedId) && imported.selectedId) ||
        prev.selectedId ||
        sheets[0]?.id;
      return { version: 1, sheets, selectedId };
    });
    toast("success", `Imported ${imported.sheets.length} sheet(s).`);
  }

  const totals = useMemo(() => (selectedSheet ? computeTotals(selectedSheet) : null), [selectedSheet]);

  if (!selectedSheet || !totals) {
    return (
      <div className="px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-muted">No sheet selected.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-10">
      <div className="mx-auto max-w-6xl animate-[fadeUp_.55s_ease-out]">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs text-muted">
              Local-first cost sheets (stored in your browser) -{" "}
              <span className="select-all">{STORAGE_KEY}</span>
            </p>
            <h1 className="mt-2 font-serif text-4xl leading-[1.08] tracking-tight text-ink">
              Product Costing
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Materials, labor, overhead, and pricing in one ledger. No account,
              no database, just fast iteration.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95 active:translate-y-px"
              onClick={newSheet}
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

        <div className="mt-8 grid gap-6 md:grid-cols-[320px_1fr]">
          <aside className={cardClassName()}>
            <div className="p-3">
              <div className="flex items-center gap-2">
                <input
                  className={inputBase}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search sheets..."
                  aria-label="Search sheets"
                />
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
                          <p className="shrink-0 font-mono text-[11px] text-muted">{formatShortDate(sheet.updatedAt)}</p>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-border bg-paper/60 px-2 py-0.5 font-mono text-[11px] text-ink">
                            CPU {t.costPerUnitCents === null ? "--" : formatCents(t.costPerUnitCents, sheet.currency)}
                          </span>
                          <span className="rounded-full border border-border bg-paper/60 px-2 py-0.5 font-mono text-[11px] text-ink">
                            Price {t.pricePerUnitCents === null ? "--" : formatCents(t.pricePerUnitCents, sheet.currency)}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>

          <main className={cardClassName()}>
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

              <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
                <div className="space-y-6">
                  <section className={panelClassName()}>
                    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                      <h2 className="font-serif text-lg tracking-tight text-ink">Details</h2>
                      <span className="font-mono text-[11px] text-muted">
                        updated {formatShortDate(selectedSheet.updatedAt)}
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
                        <select
                          className={inputBase + " mt-1"}
                          value={selectedSheet.currency}
                          onChange={(e) => updateSelected((s) => ({ ...s, currency: e.target.value }))}
                        >
                          <option value="USD">USD</option>
                          <option value="CAD">CAD</option>
                          <option value="EUR">EUR</option>
                          <option value="GBP">GBP</option>
                          <option value="AUD">AUD</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-mono text-xs text-muted">Batch size</label>
                        <input
                          className={inputBase + " mt-1 " + inputMono}
                          type="number"
                          min={0}
                          step={1}
                          value={selectedSheet.batchSize}
                          onChange={(e) =>
                            updateSelected((s) => ({
                              ...s,
                              batchSize: Math.max(0, Math.trunc(parseNumber(e.target.value))),
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

                    <div className="p-2">
                      <div className="overflow-x-auto px-2 pb-2">
                        <table className="min-w-[740px] w-full text-left text-sm">
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
                                  <input
                                    className={inputBase + " " + inputMono}
                                    type="number"
                                    step={0.001}
                                    value={it.qty}
                                    onChange={(e) =>
                                      updateSelected((s) => ({
                                        ...s,
                                        materials: s.materials.map((m) =>
                                          m.id === it.id ? { ...m, qty: parseNumber(e.target.value) } : m,
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
                                      $
                                    </span>
                                    <input
                                      className={inputBase + " pl-7 " + inputMono}
                                      type="number"
                                      step={0.01}
                                      value={centsToMoneyString(it.unitCostCents)}
                                      onChange={(e) =>
                                        updateSelected((s) => ({
                                          ...s,
                                          materials: s.materials.map((m) =>
                                            m.id === it.id
                                              ? { ...m, unitCostCents: parseMoneyToCents(e.target.value) }
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
                                      {formatCents(Math.round(it.qty * it.unitCostCents), selectedSheet.currency)}
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
                          <input
                            className={inputBase + " mt-1 " + inputMono}
                            type="number"
                            step={0.1}
                            min={0}
                            value={selectedSheet.wastePct}
                            onChange={(e) =>
                              updateSelected((s) => ({ ...s, wastePct: Math.max(0, parseNumber(e.target.value)) }))
                            }
                          />
                        </div>
                        <div className="min-w-[240px]">
                          <p className="font-mono text-xs text-muted">Materials subtotal</p>
                          <p className="mt-1 font-mono text-sm tabular-nums text-ink">
                            {formatCents(totals.materialsSubtotalCents, selectedSheet.currency)}{" "}
                            <span className="text-muted">
                              -&gt; {formatCents(totals.materialsWithWasteCents, selectedSheet.currency)} with waste
                            </span>
                          </p>
                        </div>
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

                    <div className="p-2">
                      <div className="overflow-x-auto px-2 pb-2">
                        <table className="min-w-[740px] w-full text-left text-sm">
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
                                  <input
                                    className={inputBase + " " + inputMono}
                                    type="number"
                                    step={0.05}
                                    min={0}
                                    value={it.hours}
                                    onChange={(e) =>
                                      updateSelected((s) => ({
                                        ...s,
                                        labor: s.labor.map((l) =>
                                          l.id === it.id
                                            ? { ...l, hours: Math.max(0, parseNumber(e.target.value)) }
                                            : l,
                                        ),
                                      }))
                                    }
                                  />
                                </td>
                                <td className="p-2">
                                  <div className="relative">
                                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-xs text-muted">
                                      $
                                    </span>
                                    <input
                                      className={inputBase + " pl-7 " + inputMono}
                                      type="number"
                                      step={0.01}
                                      min={0}
                                      value={centsToMoneyString(it.rateCents)}
                                      onChange={(e) =>
                                        updateSelected((s) => ({
                                          ...s,
                                          labor: s.labor.map((l) =>
                                            l.id === it.id
                                              ? { ...l, rateCents: parseMoneyToCents(e.target.value) }
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
                                      {formatCents(Math.round(it.hours * it.rateCents), selectedSheet.currency)}
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
                          {formatCents(totals.laborSubtotalCents, selectedSheet.currency)}
                        </p>
                      </div>
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

                    <div className="p-2">
                      <div className="overflow-x-auto px-2 pb-2">
                        <table className="min-w-[740px] w-full text-left text-sm">
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
                                          $
                                        </span>
                                        <input
                                          className={inputBase + " pl-7 " + inputMono}
                                          type="number"
                                          step={0.01}
                                          min={0}
                                          value={centsToMoneyString(it.amountCents)}
                                          onChange={(e) =>
                                            updateSelected((s) => ({
                                              ...s,
                                              overhead: s.overhead.map((o) =>
                                                o.id === it.id
                                                  ? { ...o, amountCents: parseMoneyToCents(e.target.value) }
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
                                        <input
                                          className={inputBase + " pr-7 " + inputMono}
                                          type="number"
                                          step={0.1}
                                          min={0}
                                          value={it.percent}
                                          onChange={(e) =>
                                            updateSelected((s) => ({
                                              ...s,
                                              overhead: s.overhead.map((o) =>
                                                o.id === it.id
                                                  ? { ...o, percent: Math.max(0, parseNumber(e.target.value)) }
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
                                        {formatCents(lineTotal, selectedSheet.currency)}
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
                          {formatCents(totals.overheadTotalCents, selectedSheet.currency)}{" "}
                          <span className="text-muted">
                            ({formatCents(totals.overheadFlatCents, selectedSheet.currency)} flat +{" "}
                            {formatCents(totals.overheadPercentCents, selectedSheet.currency)} percent)
                          </span>
                        </p>
                      </div>
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
                        value={formatCents(totals.materialsWithWasteCents, selectedSheet.currency)}
                        hint={formatCents(totals.materialsSubtotalCents, selectedSheet.currency)}
                      />
                      <SummaryRow
                        label="Labor"
                        value={formatCents(totals.laborSubtotalCents, selectedSheet.currency)}
                      />
                      <SummaryRow
                        label="Overhead"
                        value={formatCents(totals.overheadTotalCents, selectedSheet.currency)}
                      />
                      <div className="my-2 border-t border-border" />
                      <SummaryRow
                        label="Batch total"
                        value={formatCents(totals.batchTotalCents, selectedSheet.currency)}
                        bold
                      />
                      <SummaryRow
                        label="Cost per unit"
                        value={
                          totals.costPerUnitCents === null
                            ? "--"
                            : formatCents(totals.costPerUnitCents, selectedSheet.currency)
                        }
                        bold
                      />
                    </div>

                    <div className="border-t border-border p-4">
                      <h3 className="font-serif text-base tracking-tight text-ink">Pricing</h3>
                      <div className="mt-3 grid gap-3">
                        <div>
                          <label className="block font-mono text-xs text-muted">Markup %</label>
                          <input
                            className={inputBase + " mt-1 " + inputMono}
                            type="number"
                            step={0.1}
                            min={0}
                            value={selectedSheet.markupPct}
                            onChange={(e) =>
                              updateSelected((s) => ({
                                ...s,
                                markupPct: Math.max(0, parseNumber(e.target.value)),
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label className="block font-mono text-xs text-muted">
                            Sales tax % (optional)
                          </label>
                          <input
                            className={inputBase + " mt-1 " + inputMono}
                            type="number"
                            step={0.1}
                            min={0}
                            value={selectedSheet.taxPct}
                            onChange={(e) =>
                              updateSelected((s) => ({
                                ...s,
                                taxPct: Math.max(0, parseNumber(e.target.value)),
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
                              : formatCents(totals.pricePerUnitCents, selectedSheet.currency)
                          }
                          bold
                        />
                        <SummaryRow
                          label="Profit / unit"
                          value={
                            totals.profitPerUnitCents === null
                              ? "--"
                              : formatCents(totals.profitPerUnitCents, selectedSheet.currency)
                          }
                          hint={totals.marginPct === null ? "" : `${totals.marginPct}% margin`}
                        />
                        <SummaryRow
                          label="Price with tax"
                          value={
                            totals.pricePerUnitWithTaxCents === null
                              ? "--"
                              : formatCents(totals.pricePerUnitWithTaxCents, selectedSheet.currency)
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
                            ["Batch total", formatCents(totals.batchTotalCents, selectedSheet.currency)],
                            [
                              "Cost per unit",
                              totals.costPerUnitCents === null
                                ? ""
                                : formatCents(totals.costPerUnitCents, selectedSheet.currency),
                            ],
                            [
                              "Suggested price",
                              totals.pricePerUnitCents === null
                                ? ""
                                : formatCents(totals.pricePerUnitCents, selectedSheet.currency),
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

        <footer className="mt-10 text-center text-xs text-muted">
          Built with Next.js. Your data stays in this browser unless you export it.
        </footer>
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
