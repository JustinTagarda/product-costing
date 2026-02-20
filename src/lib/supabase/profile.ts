import type { User } from "@supabase/supabase-js";

function normalizeProfileImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("data:image/")) return null;
  return trimmed;
}

function readObjectField(target: unknown, key: string): unknown {
  if (!target || typeof target !== "object") return null;
  return (target as Record<string, unknown>)[key];
}

export function getUserProfileImageUrl(user: User | null | undefined): string | null {
  if (!user) return null;

  const metadataAvatar =
    normalizeProfileImageUrl(readObjectField(user.user_metadata, "avatar_url")) ||
    normalizeProfileImageUrl(readObjectField(user.user_metadata, "picture"));
  if (metadataAvatar) return metadataAvatar;

  if (!Array.isArray(user.identities)) return null;
  for (const identity of user.identities) {
    const identityData = readObjectField(identity, "identity_data");
    const identityAvatar =
      normalizeProfileImageUrl(readObjectField(identityData, "avatar_url")) ||
      normalizeProfileImageUrl(readObjectField(identityData, "picture"));
    if (identityAvatar) return identityAvatar;
  }

  return null;
}
