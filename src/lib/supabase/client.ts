import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

  cached = createClient(url, anonKey, {
    auth: {
      // Use implicit flow so sign-in works without any persistent browser storage.
      flowType: "implicit",
      // Force explicit sign-in per app open (no persisted browser session).
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: true,
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
