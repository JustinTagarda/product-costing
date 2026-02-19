"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { clearSelectedOwnerUserIdForSession } from "@/lib/accountScopeSelection";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const supabase = getSupabaseClient();
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        let nextSessionUserId: string | null = null;
        for (let i = 0; i < 20; i += 1) {
          const { data, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
          if (data.session) {
            nextSessionUserId = data.session.user.id;
            break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 100));
        }

        if (!nextSessionUserId) throw new Error("No active session after sign-in.");
        clearSelectedOwnerUserIdForSession(nextSessionUserId);

        if (!cancelled) router.replace("/dataset-select");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Auth callback failed.";
        if (!cancelled) setError(msg);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card/80 p-6 shadow-sm backdrop-blur-md">
        <h1 className="font-serif text-2xl tracking-tight text-ink">Signing you in</h1>
        <p className="mt-2 text-sm text-muted">You can close this tab if it does not redirect.</p>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </div>
    </div>
  );
}

