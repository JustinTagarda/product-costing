"use client";

const KEY_PREFIX = "product-costing:selected-owner:";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

export function getSelectedOwnerUserIdForSession(signedInUserId: string): string | null {
  const storage = getStorage();
  if (!storage || !signedInUserId) return null;
  const value = storage.getItem(`${KEY_PREFIX}${signedInUserId}`);
  return value && value.trim() ? value.trim() : null;
}

export function setSelectedOwnerUserIdForSession(
  signedInUserId: string,
  ownerUserId: string,
): void {
  const storage = getStorage();
  if (!storage || !signedInUserId || !ownerUserId) return;
  storage.setItem(`${KEY_PREFIX}${signedInUserId}`, ownerUserId);
}

export function clearSelectedOwnerUserIdForSession(signedInUserId: string): void {
  const storage = getStorage();
  if (!storage || !signedInUserId) return;
  storage.removeItem(`${KEY_PREFIX}${signedInUserId}`);
}
