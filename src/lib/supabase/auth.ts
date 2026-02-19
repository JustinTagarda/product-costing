"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clearClientAuthData,
  getLegacySupabaseStorageKey,
} from "@/lib/supabase/authStorage";

const LEGACY_SUPABASE_STORAGE_KEY = getLegacySupabaseStorageKey(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export async function signOutAndClearClientAuth(
  supabase: SupabaseClient | null,
): Promise<string | null> {
  if (supabase) {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      return error.message;
    }
  }

  clearClientAuthData(LEGACY_SUPABASE_STORAGE_KEY);
  return null;
}

