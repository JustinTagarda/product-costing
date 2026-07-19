"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ToastNotice = { kind: "info" | "success" | "error"; message: string };

const DEFAULT_DURATION_MS = 2600;
// Errors carry information the user may need to act on; keep them up longer.
const ERROR_DURATION_MS = 6000;

export function useToastNotice() {
  const [notice, setNotice] = useState<ToastNotice | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setNotice(null);
  }, [clearTimer]);

  const toast = useCallback(
    (kind: ToastNotice["kind"], message: string): void => {
      // Clear the previous toast's timer so it cannot dismiss this one early.
      clearTimer();
      setNotice({ kind, message });
      timerRef.current = window.setTimeout(
        () => {
          timerRef.current = null;
          setNotice(null);
        },
        kind === "error" ? ERROR_DURATION_MS : DEFAULT_DURATION_MS,
      );
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { notice, toast, dismiss };
}
