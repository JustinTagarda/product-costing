"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { MainNavMenu } from "@/components/MainNavMenu";
import { signOutAndClearClientAuth } from "@/lib/supabase/auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import { goToWelcomePage } from "@/lib/navigation";

const KNOWN_MENU_ITEMS = new Set([
  "Dashboard",
  "Cost Calculator",
  "Products",
  "Materials",
  "Purchases",
  "BOM",
  "Reports",
  "Settings",
]);

function cardClassName(): string {
  return [
    "rounded-2xl border border-border bg-card/80",
    "shadow-[0_18px_55px_rgba(0,0,0,.08)]",
    "backdrop-blur-md",
  ].join(" ");
}

export default function ComingSoonApp() {
  const searchParams = useSearchParams();
  const section = (searchParams.get("section") || "").trim();

  const [{ supabase, supabaseError }] = useState(() => {
    try {
      return { supabase: getSupabaseClient(), supabaseError: null as string | null };
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Supabase is not configured. Check your environment variables.";
      return {
        supabase: null as ReturnType<typeof getSupabaseClient> | null,
        supabaseError: msg,
      };
    }
  });

  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;

    async function loadSession() {
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
    }

    void loadSession();
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const activeItem = useMemo(
    () => (KNOWN_MENU_ITEMS.has(section) ? section : undefined),
    [section],
  );

  async function signOut() {
    const errorMessage = await signOutAndClearClientAuth(supabase);
    if (errorMessage) {
      setError(errorMessage);
      return;
    }
    setSession(null);
    goToWelcomePage();
  }

  function openSettings() {
    window.location.assign("/settings");
  }

  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/");
  }

  return (
    <div className="min-h-[calc(100dvh-var(--app-shell-topbar-height))]">
      <MainNavMenu
        activeItem={activeItem}
        onSettings={openSettings}
        onLogout={() => void signOut()}
        searchPlaceholder="Search..."
        onQuickAdd={() => window.location.assign("/calculator")}
        quickAddLabel="+ New Product"
        profileLabel={session?.user?.email || "Profile"}
      />

      <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
        <div className="flex min-h-[calc(100dvh-180px)] items-center justify-center animate-[fadeUp_.45s_ease-out]">
          <section className={cardClassName() + " w-full max-w-2xl p-8 text-center"}>
            <p className="font-mono text-xs uppercase tracking-wide text-muted">
              {section ? `${section} page` : "Page status"}
            </p>
            <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">Coming soon</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted">
              {(section || "This page")} is under construction and will be available in a future update.
            </p>

            {!supabase ? (
              <p className="mx-auto mt-3 max-w-xl text-xs text-muted">
                {supabaseError || "Supabase is not configured in this environment."}
              </p>
            ) : null}
            {error ? <p className="mx-auto mt-3 max-w-xl text-xs text-danger">{error}</p> : null}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-border bg-paper/55 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-paper/70"
                onClick={goBack}
              >
                Go back
              </button>
              <button
                type="button"
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95"
                onClick={() => window.location.assign("/")}
              >
                Go to Dashboard
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
