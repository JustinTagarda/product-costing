"use client";

import { useEffect, useId, useRef } from "react";

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
  description = "Paste CSV or TSV rows into the box below.",
  placeholder = "Paste CSV/TSV data here...",
}: ImportDataModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

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
            className="rounded-lg border border-border bg-paper px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-paper/75"
            onClick={onClose}
          >
            Close
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
            className="rounded-xl border border-border bg-paper px-4 py-2 text-sm font-semibold text-ink transition hover:bg-paper/75"
            onClick={onClose}
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
