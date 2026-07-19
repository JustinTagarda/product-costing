"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/80 p-6 text-center shadow-sm">
        <h1 className="font-serif text-2xl tracking-tight text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          {error.message || "An unexpected error occurred while rendering this page."}
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl border border-border bg-paper/65 px-4 py-2 text-sm text-ink shadow-sm hover:border-accent/60"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.assign("/")}
            className="rounded-xl border border-border bg-paper/65 px-4 py-2 text-sm text-ink shadow-sm hover:border-accent/60"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    </main>
  );
}
