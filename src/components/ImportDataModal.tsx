"use client";

import { useCallback, useEffect, useId, useRef } from "react";

type ImportDataModalProps = {
  isOpen: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
  title?: string;
  description?: string;
  placeholder?: string;
};

export function ImportDataModal({
  isOpen,
  value,
  onValueChange,
  onClose,
  title = "Import data",
  description = "Paste a Tab-Separated Value below.",
  placeholder = "Paste CSV/TSV data here...",
}: ImportDataModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isTextareaEmpty = value.trim().length === 0;

  const requestClose = useCallback((): void => {
    onValueChange("");
    onClose();
  }, [onClose, onValueChange]);

  useEffect(() => {
    if (isOpen) return;
    if (!value) return;
    onValueChange("");
  }, [isOpen, onValueChange, value]);

  useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, requestClose]);

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
              {title}
            </h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">
              {description}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-paper text-ink transition hover:bg-paper/75"
            aria-label="Close import popup"
            onClick={requestClose}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-4">
          <textarea
            ref={textareaRef}
            className="app-import-textarea"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-border bg-paper px-4 py-2 text-sm font-semibold text-ink transition hover:bg-paper/75 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => onValueChange("")}
            disabled={isTextareaEmpty}
            aria-disabled={isTextareaEmpty}
          >
            Clear
          </button>
          <button
            type="button"
            className="rounded-xl border border-border bg-paper px-4 py-2 text-sm font-semibold text-ink transition hover:bg-paper/75"
            onClick={requestClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled
            aria-disabled="true"
          >
            Import (next step)
          </button>
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
