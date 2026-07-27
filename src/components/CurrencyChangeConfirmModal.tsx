"use client";

import { useEffect, useId } from "react";

type CurrencyChangeConfirmModalProps = {
  isOpen: boolean;
  fromCurrency: string;
  toCurrency: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function CurrencyChangeConfirmModal({
  isOpen,
  fromCurrency,
  toCurrency,
  onConfirm,
  onCancel,
}: CurrencyChangeConfirmModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="app-modal-overlay"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        onCancel();
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
          Change base currency?
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">
          This account already has data. Switching from <strong>{fromCurrency}</strong> to{" "}
          <strong>{toCurrency}</strong> relabels every existing amount under the new currency&apos;s
          symbol — it does not convert the numbers. For example, an amount showing {fromCurrency} 100
          will show as {toCurrency} 100, not a converted equivalent.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-xl app-btn-secondary px-4 py-2 text-sm"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl app-btn-primary px-4 py-2 text-sm"
            onClick={onConfirm}
          >
            Change anyway
          </button>
        </div>
      </div>
    </div>
  );
}
