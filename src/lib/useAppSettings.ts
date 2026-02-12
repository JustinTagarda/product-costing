"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  makeDefaultSettings,
  normalizeSettings,
  readLocalSettings,
  updateSettingsTimestamp,
  writeLocalSettings,
  type AppSettings,
} from "@/lib/settings";
import {
  rowToSettings,
  settingsToInsert,
  type DbAppSettingsRow,
} from "@/lib/supabase/settings";

type UseAppSettingsArgs = {
  supabase: SupabaseClient | null;
  userId: string | null;
  authReady: boolean;
  onError?: (message: string) => void;
};

type SaveResult = { ok: true } | { ok: false; message: string };

export function useAppSettings({ supabase, userId, authReady, onError }: UseAppSettingsArgs) {
  const [settings, setSettings] = useState<AppSettings>(() => makeDefaultSettings());
  const [settingsReady, setSettingsReady] = useState(false);
  const isCloudMode = Boolean(supabase && userId);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;

    async function loadSettings() {
      if (isCloudMode && supabase && userId) {
        const { data, error } = await supabase
          .from("app_settings")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          onErrorRef.current?.(error.message);
          setSettings(makeDefaultSettings());
          setSettingsReady(true);
          return;
        }

        if (data) {
          setSettings(rowToSettings(data as DbAppSettingsRow));
          setSettingsReady(true);
          return;
        }
        // First-time setup: use runtime-detected defaults in memory.
        // We only persist after the user explicitly saves settings.
        setSettings(makeDefaultSettings());
        setSettingsReady(true);
        return;
      }

      const local = readLocalSettings();
      if (cancelled) return;
      setSettings(local);
      setSettingsReady(true);
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [authReady, isCloudMode, supabase, userId]);

  const saveSettings = useCallback(
    async (next: AppSettings): Promise<SaveResult> => {
      const normalized = normalizeSettings(updateSettingsTimestamp(next));
      setSettings(normalized);

      if (isCloudMode && supabase && userId) {
        const { error } = await supabase
          .from("app_settings")
          .upsert(settingsToInsert(userId, normalized), { onConflict: "user_id" });
        if (error) {
          onErrorRef.current?.(error.message);
          return { ok: false, message: error.message };
        }
        return { ok: true };
      }

      writeLocalSettings(normalized);
      return { ok: true };
    },
    [isCloudMode, supabase, userId],
  );

  return {
    settings,
    setSettings,
    settingsReady,
    saveSettings,
    isCloudMode,
  };
}
