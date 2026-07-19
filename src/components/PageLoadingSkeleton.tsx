// Shared page-content placeholder shown while a page's auth/account-scope
// bootstrap is still resolving. Rendered alongside the real MainNavMenu so
// the topbar/sidebar chrome stays visually identical across the navigation
// transition instead of flashing away and back.
export function PageLoadingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="px-2 pb-6 pt-3 sm:px-3 sm:pb-7 sm:pt-4 lg:px-4 lg:pb-8 lg:pt-5">
      <div className="w-full animate-[fadeUp_.3s_ease-out]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="app-skeleton h-8 w-48 rounded-lg" />
            <div className="app-skeleton mt-3 h-4 w-72 max-w-full rounded" />
          </div>
          <div className="flex gap-2">
            <div className="app-skeleton h-10 w-24 rounded-xl" />
            <div className="app-skeleton h-10 w-28 rounded-xl" />
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card/80 shadow-[0_8px_28px_rgba(0,0,0,.06)]">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <div className="app-skeleton h-4 w-28 rounded" />
            <div className="app-skeleton h-4 w-20 rounded" />
            <div className="app-skeleton ml-auto h-4 w-16 rounded" />
          </div>
          {Array.from({ length: rows }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-b-0"
            >
              <div className="app-skeleton h-3.5 w-1/4 rounded" />
              <div className="app-skeleton h-3.5 w-1/5 rounded" />
              <div className="app-skeleton ml-auto h-3.5 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
