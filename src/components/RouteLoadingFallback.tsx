import { Spinner } from "@/components/Spinner";

// Shown by next/dynamic while a route's page chunk is still being fetched —
// before the page component (and therefore the real MainNavMenu/session
// state) exists at all. Only ever visible on a cold load of that chunk
// (first visit, hard refresh, or a route Next hasn't prefetched yet); once
// cached, client-side navigation skips straight to the mounted page. Kept as
// a plain centered spinner rather than a fake content skeleton — without the
// real chrome around it, a shaped skeleton just reads as an empty box.
export function RouteLoadingFallback({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <Spinner size={28} />
      <p className="text-xs font-medium tracking-wide text-muted">{label}</p>
    </div>
  );
}
