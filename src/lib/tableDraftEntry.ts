import type { FocusEvent, KeyboardEvent } from "react";

type DraftRowKeydownOptions = {
  commit: () => void;
  reset: () => void;
  focusAfterReset?: () => void;
};

export function handleDraftRowBlurCapture(
  e: FocusEvent<HTMLTableRowElement>,
  commit: () => void,
): void {
  const nextFocus = e.relatedTarget as Node | null;
  if (nextFocus && e.currentTarget.contains(nextFocus)) return;
  window.setTimeout(() => {
    commit();
  }, 0);
}

export function handleDraftRowKeyDownCapture(
  e: KeyboardEvent<HTMLTableRowElement>,
  options: DraftRowKeydownOptions,
): void {
  if (e.key === "Enter") {
    e.preventDefault();
    window.setTimeout(() => {
      options.commit();
    }, 0);
    return;
  }

  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    options.reset();
    window.setTimeout(() => {
      options.focusAfterReset?.();
    }, 0);
  }
}
