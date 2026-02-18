"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

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

const STORAGE_PREFIX = "product-costing:data-owner:";

type SharedAccountRpcRow = {
  owner_user_id: string;
  owner_email: string | null;
  shared_at: string | null;
};

function storageKeyForUser(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function readStoredOwnerId(userId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(storageKeyForUser(userId));
    if (!value) return null;
    return value.trim() || null;
  } catch {
    return null;
  }
}

function writeStoredOwnerId(userId: string, ownerUserId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKeyForUser(userId), ownerUserId);
  } catch {
    // Ignore storage failures.
  }
}

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
  const promptedUserIdRef = useRef<string | null>(null);

  const [sharedAccounts, setSharedAccounts] = useState<SharedAccountOption[]>([]);
  const [activeOwnerUserId, setActiveOwnerUserId] = useState<string | null>(null);
  const [scopeReady, setScopeReady] = useState(() => !isSignedInCloud);
  const [showSelectionModal, setShowSelectionModal] = useState(false);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    promptedUserIdRef.current = null;
  }, [signedInUserId]);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;

    async function loadScope() {
      if (!isSignedInCloud || !signedInUserId || !supabase) {
        setSharedAccounts([]);
        setActiveOwnerUserId(signedInUserId);
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
      const storedOwnerId = readStoredOwnerId(signedInUserId);
      const nextOwnerId =
        storedOwnerId && validOwnerIds.has(storedOwnerId) ? storedOwnerId : signedInUserId;

      setSharedAccounts(deduped);
      setActiveOwnerUserId(nextOwnerId);
      writeStoredOwnerId(signedInUserId, nextOwnerId);
      setScopeReady(true);

      if (deduped.length > 0 && promptedUserIdRef.current !== signedInUserId) {
        setShowSelectionModal(true);
      }
    }

    void loadScope();
    return () => {
      cancelled = true;
    };
  }, [authReady, isSignedInCloud, signedInUserId, supabase]);

  const selectOwnData = useCallback(() => {
    if (!signedInUserId) return;
    setActiveOwnerUserId(signedInUserId);
    writeStoredOwnerId(signedInUserId, signedInUserId);
    promptedUserIdRef.current = signedInUserId;
    setShowSelectionModal(false);
  }, [signedInUserId]);

  const selectSharedData = useCallback(
    (ownerUserId: string) => {
      if (!signedInUserId) return;
      setActiveOwnerUserId(ownerUserId);
      writeStoredOwnerId(signedInUserId, ownerUserId);
      promptedUserIdRef.current = signedInUserId;
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
    isUsingSharedData,
    showSelectionModal,
    setShowSelectionModal,
    selectOwnData,
    selectSharedData,
  };
}
