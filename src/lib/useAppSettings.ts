"use client";

import { useCallback, useEffect, useState } from "react";
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
  settingsToUpdate,
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
          onError?.(error.message);
          setSettings(makeDefaultSettings());
          setSettingsReady(true);
          return;
        }

        if (data) {
          setSettings(rowToSettings(data as DbAppSettingsRow));
          setSettingsReady(true);
          return;
        }

        const defaults = makeDefaultSettings();
        const { data: inserted, error: insertError } = await supabase
          .from("app_settings")
          .insert(settingsToInsert(userId, defaults))
          .select("*")
          .single();

        if (cancelled) return;
        if (insertError) {
          onError?.(insertError.message);
          setSettings(defaults);
          setSettingsReady(true);
          return;
        }

        setSettings(rowToSettings(inserted as DbAppSettingsRow));
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
  }, [authReady, isCloudMode, onError, supabase, userId]);

  const saveSettings = useCallback(
    async (next: AppSettings): Promise<SaveResult> => {
      const normalized = normalizeSettings(updateSettingsTimestamp(next));
      setSettings(normalized);

      if (isCloudMode && supabase && userId) {
        const { error } = await supabase
          .from("app_settings")
          .update(settingsToUpdate(normalized))
          .eq("user_id", userId);
        if (error) {
          onError?.(error.message);
          return { ok: false, message: error.message };
        }
        return { ok: true };
      }

      writeLocalSettings(normalized);
      return { ok: true };
    },
    [isCloudMode, onError, supabase, userId],
  );

  return {
    settings,
    setSettings,
    settingsReady,
    saveSettings,
    isCloudMode,
  };
}
