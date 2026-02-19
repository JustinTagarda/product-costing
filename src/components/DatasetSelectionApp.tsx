"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { DataSelectionModal } from "@/components/DataSelectionModal";
import { signOutAndClearClientAuth } from "@/lib/supabase/auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import { goToWelcomePage } from "@/lib/navigation";
import { setSelectedOwnerUserIdForSession } from "@/lib/accountScopeSelection";
import type { SharedAccountOption } from "@/lib/useAccountDataScope";

type SharedAccountRpcRow = {
  owner_user_id: string;
  owner_email: string | null;
  access_level: string | null;
  shared_at: string | null;
};

export default function DatasetSelectionApp() {
  const router = useRouter();
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
  const [authReady, setAuthReady] = useState(() => !supabase);
  const [loadingShared, setLoadingShared] = useState(true);
  const [sharedAccounts, setSharedAccounts] = useState<SharedAccountOption[]>([]);
  const [activeOwnerUserId, setActiveOwnerUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;

    async function loadSession() {
      const { data, error: sessionError } = await client.auth.getSession();
      if (cancelled) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setAuthReady(true);
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

  useEffect(() => {
    if (!authReady) return;
    if (!session) {
      router.replace("/calculator");
    }
  }, [authReady, router, session]);

  useEffect(() => {
    let cancelled = false;

    async function loadSharedAccounts() {
      if (!supabase || !session?.user?.id) {
        if (cancelled) return;
        setSharedAccounts([]);
        setActiveOwnerUserId(session?.user?.id ?? null);
        setLoadingShared(false);
        return;
      }

      setLoadingShared(true);
      const { data, error: rpcError } = await supabase.rpc("list_shared_accounts_for_current_user");
      if (cancelled) return;

      if (rpcError) {
        setError(rpcError.message);
        setSharedAccounts([]);
        setActiveOwnerUserId(session.user.id);
        setLoadingShared(false);
        return;
      }

      const rows = ((data ?? []) as SharedAccountRpcRow[])
        .filter((row) => row.owner_user_id && row.owner_user_id !== session.user.id)
        .map((row) => ({
          ownerUserId: row.owner_user_id,
          ownerEmail: (row.owner_email || row.owner_user_id).trim().toLowerCase(),
          accessLevel: (row.access_level === "editor" ? "editor" : "viewer") as
            | "editor"
            | "viewer",
          sharedAt: row.shared_at || null,
        }));

      const deduped = Array.from(new Map(rows.map((row) => [row.ownerUserId, row])).values());

      if (!deduped.length) {
        setSelectedOwnerUserIdForSession(session.user.id, session.user.id);
        setActiveOwnerUserId(session.user.id);
        router.replace("/calculator");
        return;
      }

      setSharedAccounts(deduped);
      setActiveOwnerUserId(session.user.id);
      setLoadingShared(false);
    }

    void loadSharedAccounts();
    return () => {
      cancelled = true;
    };
  }, [router, session, supabase]);

  function selectAndContinue(ownerUserId: string) {
    if (!session?.user?.id) return;
    setSelectedOwnerUserIdForSession(session.user.id, ownerUserId);
    setActiveOwnerUserId(ownerUserId);
    router.replace("/calculator");
  }

  async function cancelAndSignOut() {
    const errorMessage = await signOutAndClearClientAuth(supabase);
    if (errorMessage) {
      setError(errorMessage);
      return;
    }
    goToWelcomePage();
  }

  if (!supabase) {
    return (
      <div className="min-h-dvh px-6 py-8">
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card/80 p-6 shadow-sm">
          <h1 className="font-serif text-2xl tracking-tight text-ink">Select Costing Data</h1>
          <p className="mt-2 text-sm text-muted">
            {supabaseError || "Supabase is required for account data selection."}
          </p>
        </div>
      </div>
    );
  }

  if (!authReady || !session || loadingShared) {
    return (
      <div className="min-h-dvh px-6 py-8">
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card/80 p-6 shadow-sm">
          <h1 className="font-serif text-2xl tracking-tight text-ink">Preparing your data</h1>
          <p className="mt-2 text-sm text-muted">Loading available account datasets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh px-6 py-8">
      <DataSelectionModal
        isOpen
        ownEmail={(session.user.email || "").trim().toLowerCase()}
        activeOwnerUserId={activeOwnerUserId}
        signedInUserId={session.user.id}
        sharedAccounts={sharedAccounts}
        onSelectOwn={() => {
          selectAndContinue(session.user.id);
        }}
        onSelectShared={(ownerUserId) => {
          selectAndContinue(ownerUserId);
        }}
        onClose={() => void cancelAndSignOut()}
      />
      {error ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-xl border border-danger/35 bg-danger/10 px-4 py-2 text-sm text-danger shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
