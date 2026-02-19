"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  getSelectedOwnerUserIdForSession,
  setSelectedOwnerUserIdForSession,
} from "@/lib/accountScopeSelection";

export type SharedAccountOption = {
  ownerUserId: string;
  ownerEmail: string;
  sharedAt: string | null;
};

type UseAccountDataScopeArgs = {
  supabase: SupabaseClient | null;
  session: Session | null;
  authReady: boolean;
  onError?: (message: string) => void;
};

type SharedAccountRpcRow = {
  owner_user_id: string;
  owner_email: string | null;
  shared_at: string | null;
};

export function useAccountDataScope({
  supabase,
  session,
  authReady,
  onError,
}: UseAccountDataScopeArgs) {
  const signedInUserId = session?.user?.id ?? null;
  const signedInEmail = (session?.user?.email || "").trim().toLowerCase();
  const isSignedInCloud = Boolean(supabase && signedInUserId);
  const onErrorRef = useRef(onError);

  const [sharedAccounts, setSharedAccounts] = useState<SharedAccountOption[]>([]);
  const [activeOwnerUserId, setActiveOwnerUserId] = useState<string | null>(null);
  const [scopeReady, setScopeReady] = useState(() => !isSignedInCloud);
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [selectionRequired, setSelectionRequired] = useState(false);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;

    async function loadScope() {
      if (!isSignedInCloud || !signedInUserId || !supabase) {
        setSharedAccounts([]);
        setActiveOwnerUserId(signedInUserId);
        setSelectionRequired(false);
        setScopeReady(true);
        setShowSelectionModal(false);
        return;
      }

      setScopeReady(false);
      const { data, error } = await supabase.rpc("list_shared_accounts_for_current_user");

      if (cancelled) return;

      if (error) {
        onErrorRef.current?.(error.message);
        setSharedAccounts([]);
        setActiveOwnerUserId(signedInUserId);
        setScopeReady(true);
        return;
      }

      const rows = ((data ?? []) as SharedAccountRpcRow[])
        .filter((row) => row.owner_user_id && row.owner_user_id !== signedInUserId)
        .map((row) => ({
          ownerUserId: row.owner_user_id,
          ownerEmail: (row.owner_email || row.owner_user_id).trim().toLowerCase(),
          sharedAt: row.shared_at || null,
        }));

      const deduped = Array.from(
        new Map(rows.map((row) => [row.ownerUserId, row])).values(),
      );

      const validOwnerIds = new Set([signedInUserId, ...deduped.map((row) => row.ownerUserId)]);
      setSharedAccounts(deduped);
      setShowSelectionModal(false);

      const storedOwnerUserId = getSelectedOwnerUserIdForSession(signedInUserId);
      const nextOwnerUserId =
        storedOwnerUserId && validOwnerIds.has(storedOwnerUserId) ? storedOwnerUserId : null;

      if (nextOwnerUserId) {
        setActiveOwnerUserId(nextOwnerUserId);
        setSelectionRequired(false);
        setScopeReady(true);
        return;
      }

      setActiveOwnerUserId(null);
      setSelectionRequired(true);

      if (typeof window !== "undefined") {
        const pathname = window.location.pathname;
        if (pathname !== "/dataset-select" && pathname !== "/auth/callback") {
          window.location.replace("/dataset-select");
        }
      }
      setScopeReady(false);
    }

    void loadScope();
    return () => {
      cancelled = true;
    };
  }, [authReady, isSignedInCloud, signedInUserId, supabase]);

  const selectOwnData = useCallback(() => {
    if (!signedInUserId) return;
    setActiveOwnerUserId(signedInUserId);
    setSelectedOwnerUserIdForSession(signedInUserId, signedInUserId);
    setSelectionRequired(false);
    setShowSelectionModal(false);
  }, [signedInUserId]);

  const selectSharedData = useCallback(
    (ownerUserId: string) => {
      if (!signedInUserId) return;
      setActiveOwnerUserId(ownerUserId);
      setSelectedOwnerUserIdForSession(signedInUserId, ownerUserId);
      setSelectionRequired(false);
      setShowSelectionModal(false);
    },
    [signedInUserId],
  );

  const activeOwnerEmail = useMemo(() => {
    if (!signedInUserId || !activeOwnerUserId) return "";
    if (activeOwnerUserId === signedInUserId) return signedInEmail;
    return sharedAccounts.find((row) => row.ownerUserId === activeOwnerUserId)?.ownerEmail || "";
  }, [activeOwnerUserId, sharedAccounts, signedInEmail, signedInUserId]);

  const isUsingSharedData = Boolean(
    signedInUserId && activeOwnerUserId && activeOwnerUserId !== signedInUserId,
  );

  return {
    signedInUserId,
    signedInEmail,
    activeOwnerUserId,
    activeOwnerEmail,
    sharedAccounts,
    scopeReady,
    selectionRequired,
    isUsingSharedData,
    showSelectionModal,
    setShowSelectionModal,
    selectOwnData,
    selectSharedData,
  };
}
