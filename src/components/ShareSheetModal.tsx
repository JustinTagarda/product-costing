"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type NoticeKind = "info" | "success" | "error";

type ShareSheetModalProps = {
  isOpen: boolean;
  onClose: () => void;
  supabase: SupabaseClient | null;
  sheetId: string | null;
  sheetName: string;
  currentUserId: string | null;
  ownerUserId?: string;
  onNotify?: (kind: NoticeKind, message: string) => void;
};

type ShareRow = {
  id: string;
  owner_user_id: string;
  shared_with_user_id: string;
  shared_with_email: string;
  role: "viewer" | "editor";
  created_at: string;
};

const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export function ShareSheetModal({
  isOpen,
  onClose,
  supabase,
  sheetId,
  sheetName,
  currentUserId,
  ownerUserId,
  onNotify,
}: ShareSheetModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [savingShare, setSavingShare] = useState(false);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [removingShareId, setRemovingShareId] = useState<string | null>(null);

  const canManageShares = useMemo(() => {
    if (!currentUserId || !ownerUserId) return false;
    return currentUserId === ownerUserId;
  }, [currentUserId, ownerUserId]);

  const notify = useCallback(
    (kind: NoticeKind, message: string) => {
      if (onNotify) onNotify(kind, message);
    },
    [onNotify],
  );

  const loadShares = useCallback(async () => {
    if (!supabase || !sheetId) {
      setShares([]);
      return;
    }

    const { data, error } = await supabase
      .from("cost_sheet_shares")
      .select("id, owner_user_id, shared_with_user_id, shared_with_email, role, created_at")
      .eq("sheet_id", sheetId)
      .order("created_at", { ascending: true });

    if (error) {
      notify("error", error.message);
      return;
    }

    setShares((data ?? []) as ShareRow[]);
  }, [sheetId, supabase, notify]);

  const requestClose = useCallback(() => {
    setEmail("");
    setRole("editor");
    setSavingShare(false);
    setRemovingShareId(null);
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
    if (!supabase || !sheetId) return;
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
    const { error } = await supabase.rpc("share_cost_sheet_with_google_email", {
      p_sheet_id: sheetId,
      p_email: normalizedEmail,
      p_role: role,
    });

    if (error) {
      setSavingShare(false);
      notify("error", error.message);
      return;
    }

    setEmail("");
    setSavingShare(false);
    notify("success", "Access updated.");
    void loadShares();
  }, [canManageShares, email, loadShares, notify, role, sheetId, supabase]);

  const removeShare = useCallback(
    async (share: ShareRow) => {
      if (!supabase || !sheetId) return;
      if (!canManageShares) {
        notify("error", "Only the owner can manage sharing.");
        return;
      }
      setRemovingShareId(share.id);
      const { error } = await supabase.rpc("unshare_cost_sheet_by_email", {
        p_sheet_id: sheetId,
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
    },
    [canManageShares, loadShares, notify, sheetId, supabase],
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
              Share <span className="font-semibold text-ink">{sheetName || "Untitled"}</span> with Google accounts.
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
            Only the owner can add or remove people. You can view your access below.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_auto]">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              className="rounded-xl border border-border bg-paper px-3 py-2 text-sm text-ink outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value === "viewer" ? "viewer" : "editor")}
              className="rounded-xl border border-border bg-paper px-3 py-2 text-sm text-ink outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
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
                {shares.map((share) => (
                  <li key={share.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{share.shared_with_email}</p>
                      <p className="font-mono text-xs text-muted">
                        {share.role === "viewer" ? "Viewer" : "Editor"}
                      </p>
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
