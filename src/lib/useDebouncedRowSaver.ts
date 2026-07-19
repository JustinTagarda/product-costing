"use client";

import { useEffect, useMemo, useRef } from "react";

type RowSaverApi<T> = {
  schedule: (id: string, item: T) => void;
  cancel: (id: string) => void;
  flushAll: () => void;
};

// Debounces per-row persistence while guaranteeing pending rows are flushed on
// unmount and page hide, so quick edits are not lost when the user navigates away.
export function useDebouncedRowSaver<T>(
  save: (item: T) => void | Promise<void>,
  delayMs = 420,
): RowSaverApi<T> {
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  const stateRef = useRef<{ timers: Map<string, number>; pending: Map<string, T> } | null>(null);
  if (stateRef.current == null) {
    stateRef.current = { timers: new Map(), pending: new Map() };
  }

  const api = useMemo<RowSaverApi<T>>(() => {
    const state = stateRef.current!;

    const flushItem = (id: string) => {
      const timer = state.timers.get(id);
      if (timer !== undefined) window.clearTimeout(timer);
      state.timers.delete(id);
      const item = state.pending.get(id);
      state.pending.delete(id);
      if (item !== undefined) void saveRef.current(item);
    };

    return {
      schedule(id, item) {
        state.pending.set(id, item);
        const existing = state.timers.get(id);
        if (existing !== undefined) window.clearTimeout(existing);
        state.timers.set(
          id,
          window.setTimeout(() => flushItem(id), delayMs),
        );
      },
      cancel(id) {
        const timer = state.timers.get(id);
        if (timer !== undefined) window.clearTimeout(timer);
        state.timers.delete(id);
        state.pending.delete(id);
      },
      flushAll() {
        for (const id of Array.from(state.pending.keys())) flushItem(id);
      },
    };
  }, [delayMs]);

  useEffect(() => {
    const flush = () => api.flushAll();
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      api.flushAll();
    };
  }, [api]);

  return api;
}
