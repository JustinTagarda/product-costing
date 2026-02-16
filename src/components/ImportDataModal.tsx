"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PopupNotification } from "@/components/PopupNotification";
import { validateAndNormalizeImportText } from "@/lib/importDataValidation";

type ImportDataModalProps = {
  isOpen: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onImport?: (validatedTsv: string) => void;
  title?: string;
  description?: string;
  placeholder?: string;
};

type ValidationNotice = {
  message: string;
};

export function ImportDataModal({
  isOpen,
  value,
  onValueChange,
  onClose,
  onImport,
  title = "Import data",
  description = "Paste a Tab-Separated Value below.",
  placeholder = "Paste CSV/TSV data here...",
}: ImportDataModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [isValidated, setIsValidated] = useState(false);
  const [notice, setNotice] = useState<ValidationNotice | null>(null);
  const isTextareaEmpty = value.trim().length === 0;

  const clearNotice = useCallback((): void => {
    setNotice(null);
    if (!toastTimerRef.current) return;
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
  }, []);

  const showNotice = useCallback((message: string): void => {
    setNotice({ message });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  const clearTextarea = useCallback((): void => {
    onValueChange("");
    setIsValidated(false);
    clearNotice();
  }, [clearNotice, onValueChange]);

  const requestClose = useCallback((): void => {
    clearTextarea();
    onClose();
  }, [clearTextarea, onClose]);

  useEffect(() => {
    if (isOpen || !value) return;
    onValueChange("");
  }, [isOpen, onValueChange, value]);

  const validateInput = useCallback((): void => {
    const result = validateAndNormalizeImportText(value);
    if (!result.ok) {
      setIsValidated(false);
      showNotice(result.reason);
      return;
    }
    onValueChange(result.tsv);
    setIsValidated(true);
    showNotice(result.message);
  }, [onValueChange, showNotice, value]);

  const handleImport = useCallback((): void => {
    if (!isValidated) return;
    if (onImport) onImport(value);
  }, [isValidated, onImport, value]);

  const handleTextareaChange = useCallback(
    (next: string): void => {
      onValueChange(next);
      setIsValidated(false);
      clearNotice();
    },
    [clearNotice, onValueChange],
  );

  useEffect(() => {
    return () => {
      if (!toastTimerRef.current) return;
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    };
  }, []);

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

        <div className="relative mt-4">
          <textarea
            ref={textareaRef}
            className="app-import-textarea"
            value={value}
            onChange={(event) => handleTextareaChange(event.target.value)}
            placeholder={placeholder}
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />

          {notice ? (
            <PopupNotification
              message={notice.message}
              locationClassName="pointer-events-none absolute left-1/2 top-1/2 z-[140] max-w-md -translate-x-1/2 -translate-y-1/2"
            />
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-border bg-paper px-4 py-2 text-sm font-semibold text-ink transition hover:bg-paper/75 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={clearTextarea}
            disabled={isTextareaEmpty}
            aria-disabled={isTextareaEmpty}
          >
            Clear
          </button>
          <button
            type="button"
            className="rounded-xl border border-border bg-paper px-4 py-2 text-sm font-semibold text-ink transition hover:bg-paper/75 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={validateInput}
            disabled={isTextareaEmpty}
            aria-disabled={isTextareaEmpty}
          >
            Validate
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
            onClick={handleImport}
            disabled={!isValidated}
            aria-disabled={!isValidated}
          >
            Import
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
