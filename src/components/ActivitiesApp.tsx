"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { DataSelectionModal } from "@/components/DataSelectionModal";
import { GlobalAppToast } from "@/components/GlobalAppToast";
import { MainContentStatusFooter } from "@/components/MainContentStatusFooter";
import { MainNavMenu } from "@/components/MainNavMenu";
import { ShareSheetModal } from "@/components/ShareSheetModal";
import { goToWelcomePage } from "@/lib/navigation";
import { signOutAndClearClientAuth } from "@/lib/supabase/auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getUserProfileImageUrl } from "@/lib/supabase/profile";
import {
  rowToAccountChangeLog,
  type AccountChangeLogEntry,
  type DbAccountChangeLogRow,
} from "@/lib/supabase/accountChangeLogs";
import { useAccountDataScope } from "@/lib/useAccountDataScope";
import { useAppSettings } from "@/lib/useAppSettings";

type Notice = { kind: "info" | "success" | "error"; message: string };
type ActionFilter = "all" | AccountChangeLogEntry["action"];

const TABLE_NAME_LABELS: Record<string, string> = {
  cost_sheets: "Products",
  materials: "Materials",
  purchases: "Purchases",
  bom_items: "BOM Items",
  bom_item_lines: "BOM Item Lines",
  app_settings: "Settings",
  account_shares: "Sharing Access",
  account_change_logs: "Activity Logs",
};

function cardClassName(): string {
  return [
    "rounded-2xl border border-border bg-card/80",
    "shadow-[0_18px_55px_rgba(0,0,0,.08)]",
    "backdrop-blur-md",
  ].join(" ");
}

function actionLabel(action: AccountChangeLogEntry["action"]): string {
  if (action === "insert") return "Created";
  if (action === "update") return "Updated";
  return "Deleted";
}

function tableNameLabel(tableName: string): string {
  const knownLabel = TABLE_NAME_LABELS[tableName];
  if (knownLabel) return knownLabel;
  return tableName
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function sortLogsByCreatedAtDesc(
  a: Pick<AccountChangeLogEntry, "createdAt" | "id">,
  b: Pick<AccountChangeLogEntry, "createdAt" | "id">,
): number {
  const aTime = Date.parse(a.createdAt);
  const bTime = Date.parse(b.createdAt);
  const aIsValid = Number.isFinite(aTime);
  const bIsValid = Number.isFinite(bTime);

  if (aIsValid && bIsValid) {
    if (aTime === bTime) return a.id.localeCompare(b.id);
    return bTime - aTime;
  }
  if (aIsValid) return -1;
  if (bIsValid) return 1;
  return a.id.localeCompare(b.id);
}

export default function ActivitiesApp() {
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
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logs, setLogs] = useState<AccountChangeLogEntry[]>([]);
  const [query, setQuery] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [tableFilter, setTableFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);

  const user = session?.user ?? null;

  const toast = useCallback((kind: Notice["kind"], message: string): void => {
    setNotice({ kind, message });
    window.setTimeout(() => setNotice(null), 2600);
  }, []);

  const {
    signedInUserId,
    signedInEmail,
    activeOwnerUserId,
    activeOwnerEmail,
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

  const formatDateTime = useCallback(
    (iso: string) => {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return "";
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: settings.timezone,
      }).format(date);
    },
    [settings.timezone],
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
    if (!dataAuthReady) return;
    let cancelled = false;

    async function loadLogs() {
      setLoadingLogs(true);

      if (!isCloudMode || !activeOwnerUserId || !supabase) {
        if (cancelled) return;
        setLogs([]);
        setLoadingLogs(false);
        return;
      }

      const { data, error } = await supabase.rpc("list_account_change_logs", {
        p_owner_user_id: activeOwnerUserId,
        p_limit: 500,
      });

      if (cancelled) return;

      if (error) {
        toast("error", error.message);
        setLogs([]);
        setLoadingLogs(false);
        return;
      }

      const nextLogs = ((data ?? []) as DbAccountChangeLogRow[])
        .map((row) => rowToAccountChangeLog(row))
        .sort(sortLogsByCreatedAtDesc);
      setLogs(nextLogs);
      setLoadingLogs(false);
    }

    void loadLogs();
    return () => {
      cancelled = true;
    };
  }, [activeOwnerUserId, dataAuthReady, isCloudMode, supabase, toast]);

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

  const tableOptions = useMemo(() => {
    return Array.from(new Set(logs.map((log) => log.tableName))).sort((a, b) =>
      tableNameLabel(a).localeCompare(tableNameLabel(b)),
    );
  }, [logs]);

  const userOptions = useMemo(() => {
    return Array.from(new Set(logs.map((log) => log.actorEmail))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromTime = dateFrom ? Date.parse(`${dateFrom}T00:00:00`) : null;
    const toTime = dateTo ? Date.parse(`${dateTo}T23:59:59.999`) : null;

    return logs.filter((log) => {
      if (userFilter !== "all" && log.actorEmail !== userFilter) return false;
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      if (tableFilter !== "all" && log.tableName !== tableFilter) return false;

      const createdAtTime = Date.parse(log.createdAt);
      if (fromTime !== null && Number.isFinite(createdAtTime) && createdAtTime < fromTime) {
        return false;
      }
      if (toTime !== null && Number.isFinite(createdAtTime) && createdAtTime > toTime) {
        return false;
      }

      if (!q) return true;
      const searchable = [
        log.actorEmail,
        actionLabel(log.action),
        log.tableName,
        tableNameLabel(log.tableName),
        log.changedFields.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(q);
    });
  }, [actionFilter, dateFrom, dateTo, logs, query, tableFilter, userFilter]);

  const actionCounts = useMemo(
    () =>
      filteredLogs.reduce(
        (counts, log) => {
          counts[log.action] += 1;
          return counts;
        },
        { insert: 0, update: 0, delete: 0 },
      ),
    [filteredLogs],
  );

  const ownerLabel = activeOwnerEmail || activeOwnerUserId || "Unknown owner";

  return (
    <div className="min-h-[calc(100dvh-var(--app-shell-topbar-height))]">
      <MainNavMenu
        activeItem="Activities"
        onSettings={openSettings}
        onLogout={() => void signOut()}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search user, action, area, or changed field"
        onShare={() => setShowShareModal(true)}
        viewerMode={isReadOnlyData}
        profileImageUrl={getUserProfileImageUrl(session?.user)}
        profileLabel={session?.user?.email || "Profile"}
      />

      <div className="px-2 pb-6 pt-3 sm:px-3 sm:pb-7 sm:pt-4 lg:px-4 lg:pb-8 lg:pt-5">
        <div className="flex min-h-[calc(100dvh-var(--app-shell-topbar-height)-2.25rem)] sm:min-h-[calc(100dvh-var(--app-shell-topbar-height)-2.75rem)] lg:min-h-[calc(100dvh-var(--app-shell-topbar-height)-3.25rem)] w-full flex-col animate-[fadeUp_.45s_ease-out]">
          <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <h1 className="font-serif text-4xl leading-[1.08] tracking-tight text-ink">
                Activities
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                View a complete audit trail of activity across the workspace, including changes to
                products, materials, purchases, and sharing settings.
              </p>
              {!supabase ? (
                <p className="mt-2 text-xs text-muted">
                  {supabaseError || "Supabase is required for this app."}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted">
                Active data owner: <span className="font-semibold text-ink">{ownerLabel}</span>
              </p>
              {isReadOnlyData ? (
                <p className="mt-1 text-xs text-muted">
                  Viewer access: this shared dataset is read-only.
                </p>
              ) : null}
            </div>
          </header>

          <GlobalAppToast notice={notice} />

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Visible Logs"
              value={String(filteredLogs.length)}
              note={`${logs.length} loaded`}
            />
            <KpiCard
              label="Created"
              value={String(actionCounts.insert)}
              note="Insert events"
            />
            <KpiCard
              label="Updated"
              value={String(actionCounts.update)}
              note="Update events"
            />
            <KpiCard
              label="Deleted"
              value={String(actionCounts.delete)}
              note="Delete events"
            />
          </section>

          <section className={cardClassName() + " mt-6 overflow-hidden"}>
            <div className="border-b border-border px-4 py-3">
              <p className="font-mono text-xs text-muted">
                {loadingLogs
                  ? "Loading account activity..."
                  : `${filteredLogs.length} result(s) in descending date order`}
              </p>
            </div>

            <div className="grid gap-3 border-b border-border px-3 py-3 sm:grid-cols-2 lg:grid-cols-[220px_180px_220px_170px_170px_auto] lg:items-end">
              <label className="space-y-1">
                <span className="font-mono text-xs text-muted">User</span>
                <select
                  className="w-full rounded-lg border border-border bg-paper px-2.5 py-2 text-sm text-ink outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
                  value={userFilter}
                  onChange={(event) => setUserFilter(event.target.value || "all")}
                >
                  <option value="all">All users</option>
                  {userOptions.map((actorEmail) => (
                    <option key={actorEmail} value={actorEmail}>
                      {actorEmail}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-mono text-xs text-muted">Action</span>
                <select
                  className="w-full rounded-lg border border-border bg-paper px-2.5 py-2 text-sm text-ink outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
                  value={actionFilter}
                  onChange={(event) =>
                    setActionFilter((event.target.value as ActionFilter) || "all")
                  }
                >
                  <option value="all">All actions</option>
                  <option value="insert">Created</option>
                  <option value="update">Updated</option>
                  <option value="delete">Deleted</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-mono text-xs text-muted">Area</span>
                <select
                  className="w-full rounded-lg border border-border bg-paper px-2.5 py-2 text-sm text-ink outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
                  value={tableFilter}
                  onChange={(event) => setTableFilter(event.target.value || "all")}
                >
                  <option value="all">All tables</option>
                  {tableOptions.map((tableName) => (
                    <option key={tableName} value={tableName}>
                      {tableNameLabel(tableName)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-mono text-xs text-muted">Date from</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="w-full rounded-lg border border-border bg-paper px-2.5 py-2 text-sm text-ink outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
                />
              </label>

              <label className="space-y-1">
                <span className="font-mono text-xs text-muted">Date to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="w-full rounded-lg border border-border bg-paper px-2.5 py-2 text-sm text-ink outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
                />
              </label>

              <div className="flex justify-start lg:justify-end">
                <button
                  type="button"
                  className="rounded-lg border border-border bg-paper px-3 py-2 text-xs font-semibold text-ink transition hover:bg-paper/70"
                  onClick={() => {
                    setQuery("");
                    setUserFilter("all");
                    setActionFilter("all");
                    setTableFilter("all");
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Clear filters
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-paper/55">
                  <tr>
                    <th className="w-[180px] min-w-[180px] max-w-[180px] px-1 py-2 font-mono text-xs font-semibold text-muted">
                      Date/Time
                    </th>
                    <th className="min-w-[200px] px-1 py-2 font-mono text-xs font-semibold text-muted">
                      User
                    </th>
                    <th className="min-w-[200px] px-1 py-2 font-mono text-xs font-semibold text-muted">
                      Action
                    </th>
                    <th className="max-w-[180px] px-1 py-2 font-mono text-xs font-semibold text-muted">
                      Area
                    </th>
                    <th className="max-w-[180px] px-1 py-2 font-mono text-xs font-semibold text-muted">
                      Changed Fields
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLogs ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                        Loading activity logs...
                      </td>
                    </tr>
                  ) : filteredLogs.length ? (
                    filteredLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="w-[180px] min-w-[180px] max-w-[180px] px-1 py-2 font-mono text-xs text-muted">
                          {formatDateTime(log.createdAt) || "-"}
                        </td>
                        <td className="min-w-[200px] px-1 py-2 text-sm text-ink">
                          {log.actorEmail}
                        </td>
                        <td className="min-w-[200px] px-1 py-2 text-sm text-ink">
                          {actionLabel(log.action)}
                        </td>
                        <td className="max-w-[180px] px-1 py-2">
                          <p
                            className="max-w-[180px] truncate text-sm text-ink"
                            title={tableNameLabel(log.tableName)}
                          >
                            {tableNameLabel(log.tableName)}
                          </p>
                          <p
                            className="max-w-[180px] truncate font-mono text-[11px] text-muted"
                            title={log.tableName}
                          >
                            {log.tableName}
                          </p>
                        </td>
                        <td
                          className="max-w-[180px] px-1 py-2 text-xs text-muted"
                          title={log.changedFields.length ? log.changedFields.join(", ") : "No tracked field differences"}
                        >
                          <p className="max-w-[180px] truncate">
                            {log.changedFields.length
                              ? log.changedFields.join(", ")
                              : "No tracked field differences"}
                          </p>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                        No logs matched your current search and filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <MainContentStatusFooter
            userLabel={session ? user?.email || user?.id : null}
            syncLabel="activity logs via Supabase"
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

function KpiCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
      <p className="font-mono text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-2 text-xs text-muted">{note}</p>
    </article>
  );
}
