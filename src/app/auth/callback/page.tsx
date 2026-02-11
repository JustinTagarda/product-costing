"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const supabase = getSupabaseClient();
        const url = window.location.href;
        const hasCode = url.includes("code=");
        if (hasCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(url);
          if (error) throw error;
        }
        if (!cancelled) window.location.replace("/");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Auth callback failed.";
        if (!cancelled) setError(msg);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="px-4 py-10">
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card/80 p-6 shadow-sm backdrop-blur-md">
        <h1 className="font-serif text-2xl tracking-tight text-ink">Signing you in</h1>
        <p className="mt-2 text-sm text-muted">You can close this tab if it does not redirect.</p>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </div>
    </div>
  );
}

