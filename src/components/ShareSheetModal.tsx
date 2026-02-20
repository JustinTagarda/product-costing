"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type NoticeKind = "info" | "success" | "error";
type AccessLevel = "editor" | "viewer";

type ShareSheetModalProps = {
  isOpen: boolean;
  onClose: () => void;
  supabase: SupabaseClient | null;
  currentUserId: string | null;
  activeOwnerUserId?: string | null;
  onNotify?: (kind: NoticeKind, message: string) => void;
};

type ShareRow = {
  owner_user_id: string;
  owner_email: string;
  shared_with_email: string;
  access_level: AccessLevel;
  shared_at: string | null;
};

type AccountShareRpcRow = {
  owner_user_id: string;
  owner_email: string | null;
  shared_with_email: string | null;
  access_level: string | null;
  shared_at: string | null;
};

const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

function normalizeAccessLevel(value: string | null | undefined): AccessLevel {
  return value === "editor" ? "editor" : "viewer";
}

function accessLevelLabel(value: AccessLevel): string {
  return value === "editor" ? "Editor" : "Viewer";
}

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
  const [newShareAccessLevel, setNewShareAccessLevel] = useState<AccessLevel>("viewer");
  const [savingShare, setSavingShare] = useState(false);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [removingShareEmail, setRemovingShareEmail] = useState<string | null>(null);
  const [updatingShareEmail, setUpdatingShareEmail] = useState<string | null>(null);

  const canManageShares = useMemo(() => {
    if (!currentUserId || !activeOwnerUserId) return false;
    return currentUserId === activeOwnerUserId;
  }, [currentUserId, activeOwnerUserId]);

  const ownerLabel = useMemo(() => {
    if (ownerEmail) return ownerEmail;
    if (activeOwnerUserId) return activeOwnerUserId;
    return "Unknown owner";
  }, [activeOwnerUserId, ownerEmail]);

  const notify = useCallback(
    (kind: NoticeKind, message: string) => {
      if (onNotify) onNotify(kind, message);
    },
    [onNotify],
  );

  const loadShares = useCallback(async () => {
    if (!supabase || !activeOwnerUserId) {
      setShares([]);
      setOwnerEmail("");
      return;
    }

    const { data, error } = await supabase.rpc("list_account_shares_for_owner", {
      p_owner_user_id: activeOwnerUserId,
    });

    if (error) {
      notify("error", error.message);
      return;
    }

    const normalized = ((data ?? []) as AccountShareRpcRow[])
      .filter((row) => (row.shared_with_email || "").trim().length > 0)
      .map((row) => ({
        owner_user_id: row.owner_user_id,
        owner_email: (row.owner_email || row.owner_user_id || "").trim().toLowerCase(),
        shared_with_email: (row.shared_with_email || "").trim().toLowerCase(),
        access_level: normalizeAccessLevel(row.access_level),
        shared_at: row.shared_at || null,
      }));

    setShares(normalized);
    setOwnerEmail(normalized[0]?.owner_email || "");
  }, [activeOwnerUserId, notify, supabase]);

  const requestClose = useCallback(() => {
    setEmail("");
    setNewShareAccessLevel("viewer");
    setSavingShare(false);
    setRemovingShareEmail(null);
    setUpdatingShareEmail(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      void loadShares();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isOpen, loadShares]);

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
      p_access_level: newShareAccessLevel,
    });

    if (error) {
      setSavingShare(false);
      notify("error", error.message);
      return;
    }

    setEmail("");
    setSavingShare(false);
    notify("success", "Account sharing updated.");
    void loadShares();
  }, [canManageShares, email, loadShares, newShareAccessLevel, notify, supabase]);

  const updateShareAccessLevel = useCallback(
    async (share: ShareRow, nextAccessLevel: AccessLevel) => {
      if (!supabase) return;
      if (!canManageShares) {
        notify("error", "Only the owner can manage sharing.");
        return;
      }
      if (share.access_level === nextAccessLevel) return;

      setUpdatingShareEmail(share.shared_with_email);
      const { error } = await supabase.rpc("update_account_share_access_level", {
        p_email: share.shared_with_email,
        p_access_level: nextAccessLevel,
      });

      if (error) {
        setUpdatingShareEmail(null);
        notify("error", error.message);
        return;
      }

      setUpdatingShareEmail(null);
      notify("success", "Access level updated.");
      void loadShares();
    },
    [canManageShares, loadShares, notify, supabase],
  );

  const removeShare = useCallback(
    async (share: ShareRow) => {
      if (!supabase) return;
      if (!canManageShares) {
        notify("error", "Only the owner can manage sharing.");
        return;
      }
      setRemovingShareEmail(share.shared_with_email);
      const { error } = await supabase.rpc("unshare_account_by_email", {
        p_email: share.shared_with_email,
      });

      if (error) {
        setRemovingShareEmail(null);
        notify("error", error.message);
        return;
      }

      setRemovingShareEmail(null);
      notify("success", "Access removed.");
      void loadShares();
    },
    [canManageShares, loadShares, notify, supabase],
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
              {canManageShares
                ? "Manage who can access your account data and set their role."
                : "You have read-only access to sharing details for this account."}
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

        <div className="mt-4 rounded-xl border border-border bg-paper/45 px-3 py-2 text-sm">
          <p className="font-mono text-xs text-muted">Data owner</p>
          <p className="mt-1 text-ink">{ownerLabel}</p>
        </div>

        {!canManageShares ? (
          <div className="mt-4 rounded-xl border border-border bg-paper/55 px-3 py-2 text-sm text-muted">
            Read-only mode. Only the owner can add people, remove people, or change access levels.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              className="rounded-xl border border-border bg-paper px-3 py-2 text-sm text-ink outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
            />
            <select
              className="rounded-xl border border-border bg-paper px-3 py-2 text-sm text-ink outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
              value={newShareAccessLevel}
              onChange={(event) =>
                setNewShareAccessLevel(event.target.value === "editor" ? "editor" : "viewer")
              }
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
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
                {shares.map((share) => {
                  const isUpdating = updatingShareEmail === share.shared_with_email;
                  const isRemoving = removingShareEmail === share.shared_with_email;
                  const controlsDisabled = isUpdating || isRemoving;
                  return (
                    <li key={share.shared_with_email} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">{share.shared_with_email}</p>
                        <p className="font-mono text-xs text-muted">
                          {accessLevelLabel(share.access_level)} access
                        </p>
                      </div>
                      {canManageShares ? (
                        <div className="flex items-center gap-2">
                          <select
                            className="rounded-lg border border-border bg-paper px-2 py-1 text-xs text-ink outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-60"
                            value={share.access_level}
                            onChange={(event) =>
                              void updateShareAccessLevel(
                                share,
                                event.target.value === "editor" ? "editor" : "viewer",
                              )
                            }
                            disabled={controlsDisabled}
                          >
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                          </select>
                          <button
                            type="button"
                            className="rounded-lg border border-border bg-paper px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-paper/75 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void removeShare(share)}
                            disabled={controlsDisabled}
                          >
                            {isRemoving ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      ) : (
                        <span className="rounded-lg border border-border bg-paper/55 px-2 py-1 text-xs text-muted">
                          {accessLevelLabel(share.access_level)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-3 py-4 text-sm text-muted">No shared users yet.</p>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-paper/45 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-mono text-xs text-muted">Activities</p>
              <p className="mt-0.5 text-sm text-muted">
                View full account activity logs on the dedicated Activities page.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-border bg-paper px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-paper/75"
              onClick={() => {
                requestClose();
                window.location.assign("/activities");
              }}
            >
              Open Activities
            </button>
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
