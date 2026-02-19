"use client";

import { useId } from "react";
import type { SharedAccountOption } from "@/lib/useAccountDataScope";

type DataSelectionModalProps = {
  isOpen: boolean;
  ownEmail: string;
  activeOwnerUserId: string | null;
  signedInUserId: string | null;
  sharedAccounts: SharedAccountOption[];
  onSelectOwn: () => void;
  onSelectShared: (ownerUserId: string) => void;
  onClose: () => void;
};

export function DataSelectionModal({
  isOpen,
  ownEmail,
  activeOwnerUserId,
  signedInUserId,
  sharedAccounts,
  onSelectOwn,
  onSelectShared,
  onClose,
}: DataSelectionModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  if (!isOpen) return null;

  return (
    <div
      className="app-modal-overlay"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        onClose();
      }}
    >
      <div
        className="app-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId} className="font-serif text-2xl tracking-tight text-ink">
          Select Costing Data
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">
          Choose which account data you want to open for this session.
        </p>

        <section className="mt-4">
          <p className="font-mono text-xs text-muted">Your Data</p>
          <button
            type="button"
            className={[
              "mt-2 w-full rounded-xl border px-3 py-2 text-left transition",
              activeOwnerUserId && signedInUserId && activeOwnerUserId === signedInUserId
                ? "border-accent bg-accent/10"
                : "border-border bg-paper/45 hover:bg-paper/70",
            ].join(" ")}
            onClick={onSelectOwn}
          >
            <p className="text-sm font-semibold text-ink">{ownEmail || "Your account"}</p>
            <p className="mt-0.5 font-mono text-xs text-muted">Use your own account data</p>
          </button>
        </section>

        <section className="mt-4">
          <p className="font-mono text-xs text-muted">Shared With You</p>
          {sharedAccounts.length ? (
            <ul className="mt-2 space-y-2">
              {sharedAccounts.map((account) => {
                const isActive = activeOwnerUserId === account.ownerUserId;
                return (
                  <li key={account.ownerUserId}>
                    <button
                      type="button"
                      className={[
                        "w-full rounded-xl border px-3 py-2 text-left transition",
                        isActive
                          ? "border-accent bg-accent/10"
                          : "border-border bg-paper/45 hover:bg-paper/70",
                      ].join(" ")}
                      onClick={() => onSelectShared(account.ownerUserId)}
                    >
                      <p className="truncate text-sm font-semibold text-ink">
                        {account.ownerEmail || account.ownerUserId}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-muted">
                        {account.accessLevel === "editor"
                          ? "Editor access: can edit shared data"
                          : "Viewer access: read-only shared data"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No accounts have shared data with you.</p>
          )}
        </section>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded-xl border border-border bg-paper px-4 py-2 text-sm font-semibold text-ink transition hover:bg-paper/70"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
