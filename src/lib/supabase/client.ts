import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_AUTH_STORAGE_KEY,
  createSessionAuthStorage,
} from "@/lib/supabase/authStorage";

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  if (typeof window !== "undefined" && window.__productCostingSupabaseClient) {
    cached = window.__productCostingSupabaseClient;
    return cached;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const authStorage = createSessionAuthStorage();

  cached = createClient(url, anonKey, {
    auth: {
      // Keep session across refresh, but limit persistence to browser-tab lifetime.
      storage: authStorage,
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      // The app handles callback URL processing explicitly in /auth/callback.
      detectSessionInUrl: false,
    },
  });

  if (typeof window !== "undefined") {
    window.__productCostingSupabaseClient = cached;
  }

  return cached;
}

declare global {
  interface Window {
    __productCostingSupabaseClient?: SupabaseClient;
  }
}
