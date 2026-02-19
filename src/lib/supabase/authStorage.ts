"use client";

const MEMORY_AUTH_STORAGE = new Map<string, string>();

export const SUPABASE_AUTH_STORAGE_KEY = "product-costing:supabase-auth";
const ACCOUNT_SCOPE_STORAGE_KEY_PREFIX = "product-costing:selected-owner:";

function canUseBrowserStorage(): boolean {
  return typeof window !== "undefined";
}

function readStorageItem(key: string): string | null {
  if (!canUseBrowserStorage()) return MEMORY_AUTH_STORAGE.get(key) ?? null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return MEMORY_AUTH_STORAGE.get(key) ?? null;
  }
}

function writeStorageItem(key: string, value: string): void {
  MEMORY_AUTH_STORAGE.set(key, value);
  if (!canUseBrowserStorage()) return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore browser storage write errors and keep memory fallback in sync.
  }
}

function removeStorageItem(key: string): void {
  MEMORY_AUTH_STORAGE.delete(key);
  if (!canUseBrowserStorage()) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore browser storage remove errors and keep memory fallback in sync.
  }
}

export function createSessionAuthStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  return {
    getItem: (key) => readStorageItem(key),
    setItem: (key, value) => writeStorageItem(key, value),
    removeItem: (key) => removeStorageItem(key),
  };
}

export function getLegacySupabaseStorageKey(supabaseUrl?: string): string | null {
  if (!supabaseUrl) return null;
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const projectRef = hostname.split(".")[0];
    if (!projectRef) return null;
    return `sb-${projectRef}-auth-token`;
  } catch {
    return null;
  }
}

function isAuthStorageKey(key: string, legacyStorageKey: string | null): boolean {
  const matchesStorageKey = (storageKey: string | null): boolean => {
    if (!storageKey) return false;
    return (
      key === storageKey ||
      key.startsWith(`${storageKey}-`) ||
      key.startsWith(`${storageKey}.`)
    );
  };

  if (!key) return false;
  if (matchesStorageKey(SUPABASE_AUTH_STORAGE_KEY)) {
    return true;
  }
  if (matchesStorageKey(legacyStorageKey)) {
    return true;
  }
  if (key.startsWith(ACCOUNT_SCOPE_STORAGE_KEY_PREFIX)) {
    return true;
  }
  return false;
}

function clearAuthKeysFromStorage(storage: Storage | null, legacyStorageKey: string | null): void {
  if (!storage) return;
  const keys: string[] = [];

  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key) keys.push(key);
    }
  } catch {
    return;
  }

  for (const key of keys) {
    if (!isAuthStorageKey(key, legacyStorageKey)) continue;
    try {
      storage.removeItem(key);
    } catch {
      // Ignore per-key cleanup errors.
    }
  }
}

function expireCookie(name: string): void {
  if (typeof document === "undefined") return;
  const encodedName = encodeURIComponent(name);
  document.cookie = `${encodedName}=; Max-Age=0; path=/; SameSite=Lax`;
  document.cookie = `${encodedName}=; Max-Age=0; path=/; SameSite=Lax; Secure`;
}

function clearAuthCookies(legacyStorageKey: string | null): void {
  if (typeof document === "undefined") return;
  const cookieParts = document.cookie.split(";");
  for (const cookiePart of cookieParts) {
    const rawName = cookiePart.split("=")[0]?.trim();
    if (!rawName) continue;
    const name = decodeURIComponent(rawName);
    if (!isAuthStorageKey(name, legacyStorageKey)) continue;
    expireCookie(name);
  }
}

export function clearClientAuthData(legacyStorageKey: string | null): void {
  MEMORY_AUTH_STORAGE.clear();
  if (!canUseBrowserStorage()) return;

  clearAuthKeysFromStorage(window.sessionStorage, legacyStorageKey);
  clearAuthKeysFromStorage(window.localStorage, legacyStorageKey);
  clearAuthCookies(legacyStorageKey);
}
