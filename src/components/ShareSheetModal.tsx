"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rowToAccountChangeLog,
  type AccountChangeLogEntry,
  type DbAccountChangeLogRow,
} from "@/lib/supabase/accountChangeLogs";

type NoticeKind = "info" | "success" | "error";

type ShareSheetModalProps = {
  isOpen: boolean;
  onClose: () => void;
  supabase: SupabaseClient | null;
  currentUserId: string | null;
  activeOwnerUserId?: string | null;
  onNotify?: (kind: NoticeKind, message: string) => void;
};

type ShareRow = {
  id: string;
  owner_user_id: string;
  shared_with_email: string;
  created_at: string;
};

type AccountChangeLogRpcRow = {
  id: string;
  owner_user_id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  table_name: string;
  row_id: string | null;
  action: "insert" | "update" | "delete";
  changed_fields: unknown;
  created_at: string;
};

const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export function ShareSheetModal({
  isOpen,
  onClose,
  supabase,
  currentUserId,
  activeOwnerUserId,
  onNotify,
}: ShareSheetModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [email, setEmail] = useState("");
  const [savingShare, setSavingShare] = useState(false);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [removingShareId, setRemovingShareId] = useState<string | null>(null);
  const [recentLogs, setRecentLogs] = useState<AccountChangeLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const canManageShares = useMemo(() => {
    if (!currentUserId || !activeOwnerUserId) return false;
    return currentUserId === activeOwnerUserId;
  }, [currentUserId, activeOwnerUserId]);

  const notify = useCallback(
    (kind: NoticeKind, message: string) => {
      if (onNotify) onNotify(kind, message);
    },
    [onNotify],
  );

  const loadShares = useCallback(async () => {
    if (!supabase || !activeOwnerUserId) {
      setShares([]);
      return;
    }

    const { data, error } = await supabase
      .from("account_shares")
      .select("id, owner_user_id, shared_with_email, created_at")
      .eq("owner_user_id", activeOwnerUserId)
      .order("created_at", { ascending: true });

    if (error) {
      notify("error", error.message);
      return;
    }

    setShares((data ?? []) as ShareRow[]);
  }, [activeOwnerUserId, supabase, notify]);

  const loadRecentLogs = useCallback(async () => {
    if (!supabase || !activeOwnerUserId) {
      setRecentLogs([]);
      return;
    }

    setLoadingLogs(true);
    const { data, error } = await supabase.rpc("list_account_change_logs", {
      p_owner_user_id: activeOwnerUserId,
      p_limit: 30,
    });

    if (error) {
      setLoadingLogs(false);
      notify("error", error.message);
      return;
    }

    setRecentLogs(
      ((data ?? []) as AccountChangeLogRpcRow[]).map((row) =>
        rowToAccountChangeLog(row as DbAccountChangeLogRow),
      ),
    );
    setLoadingLogs(false);
  }, [activeOwnerUserId, notify, supabase]);

  const requestClose = useCallback(() => {
    setEmail("");
    setSavingShare(false);
    setRemovingShareId(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      void loadShares();
      void loadRecentLogs();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isOpen, loadRecentLogs, loadShares]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, requestClose]);

  const addShare = useCallback(async () => {
    if (!supabase) return;
    if (!canManageShares) {
      notify("error", "Only the owner can manage sharing.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      notify("error", "Google email is required.");
      return;
    }
    if (!emailPattern.test(normalizedEmail)) {
      notify("error", "Enter a valid email address.");
      return;
    }

    setSavingShare(true);
    const { error } = await supabase.rpc("share_account_with_email", {
      p_email: normalizedEmail,
    });

    if (error) {
      setSavingShare(false);
      notify("error", error.message);
      return;
    }

    setEmail("");
    setSavingShare(false);
    notify("success", "Account access updated.");
    void loadShares();
  }, [canManageShares, email, loadShares, notify, supabase]);

  const removeShare = useCallback(
    async (share: ShareRow) => {
      if (!supabase) return;
      if (!canManageShares) {
        notify("error", "Only the owner can manage sharing.");
        return;
      }
      setRemovingShareId(share.id);
      const { error } = await supabase.rpc("unshare_account_by_email", {
        p_email: share.shared_with_email,
      });

      if (error) {
        setRemovingShareId(null);
        notify("error", error.message);
        return;
      }

      setRemovingShareId(null);
      notify("success", "Access removed.");
      void loadShares();
      void loadRecentLogs();
    },
    [canManageShares, loadRecentLogs, loadShares, notify, supabase],
  );

  if (!isOpen) return null;

  return (
    <div
      className="app-modal-overlay"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        requestClose();
      }}
    >
      <div
        className="app-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-serif text-2xl tracking-tight text-ink">
              Share
            </h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">
              Share your full account data with Google emails.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-paper text-ink transition hover:bg-paper/75"
            aria-label="Close share dialog"
            onClick={requestClose}
          >
            <CloseIcon />
          </button>
        </div>

        {!canManageShares ? (
          <div className="mt-4 rounded-xl border border-border bg-paper/55 px-3 py-2 text-sm text-muted">
            Only the selected account owner can add or remove people.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              className="rounded-xl border border-border bg-paper px-3 py-2 text-sm text-ink outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
            />
            <button
              type="button"
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void addShare()}
              disabled={savingShare}
            >
              {savingShare ? "Sharing..." : "Share"}
            </button>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-border bg-paper/45">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="font-mono text-xs text-muted">People with access</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {shares.length ? (
              <ul className="divide-y divide-border">
                {shares.map((share) => (
                  <li key={share.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{share.shared_with_email}</p>
                      <p className="font-mono text-xs text-muted">Full account access</p>
                    </div>
                    {canManageShares ? (
                      <button
                        type="button"
                        className="rounded-lg border border-border bg-paper px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-paper/75 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => void removeShare(share)}
                        disabled={removingShareId === share.id}
                      >
                        {removingShareId === share.id ? "Removing..." : "Remove"}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-4 text-sm text-muted">No shared users yet.</p>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-paper/45">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="font-mono text-xs text-muted">Recent activity</p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loadingLogs ? (
              <p className="px-3 py-4 text-sm text-muted">Loading activity...</p>
            ) : recentLogs.length ? (
              <ul className="divide-y divide-border">
                {recentLogs.map((log) => (
                  <li key={log.id} className="px-3 py-2">
                    <p className="text-sm text-ink">
                      <span className="font-semibold">{log.actorEmail}</span>{" "}
                      <span className="text-muted">
                        {log.action === "insert"
                          ? "created"
                          : log.action === "update"
                            ? "updated"
                            : "deleted"}
                      </span>{" "}
                      <span className="font-mono text-xs text-muted">{log.tableName}</span>
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted">
                      {new Date(log.createdAt).toLocaleString()}
                    </p>
                    {log.changedFields.length ? (
                      <p className="mt-0.5 text-xs text-muted">
                        Fields: {log.changedFields.join(", ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-4 text-sm text-muted">No activity logs yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}
