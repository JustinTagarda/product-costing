"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type MainNavMenuProps = {
  activeItem?: string;
  onSettings: () => void;
  onLogout: () => void;
  onUnimplementedNavigate?: (section: string) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onShare?: () => void;
  shareLabel?: string;
  shareDisabled?: boolean;
  onQuickAdd?: () => void;
  quickAddLabel?: string;
  quickAddDisabled?: boolean;
  profileLabel?: string;
  onProfileClick?: () => void;
};

const TOP_BAR_HEIGHT = 65;
const DESKTOP_SIDEBAR_WIDTH = 272;
const TABLET_EXPANDED_SIDEBAR_WIDTH = 248;
const TABLET_COLLAPSED_SIDEBAR_WIDTH = 88;

const MAIN_NAV_ITEMS: Array<{ label: string; href?: string }> = [
  { label: "Dashboard", href: "/" },
  { label: "Cost Calculator", href: "/calculator" },
  { label: "Products", href: "/products" },
  { label: "Materials", href: "/materials" },
  { label: "Purchases", href: "/purchases" },
];

export function MainNavMenu({
  activeItem,
  onSettings,
  onLogout,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onShare,
  shareLabel,
  shareDisabled,
  onQuickAdd,
  quickAddLabel,
  quickAddDisabled,
  profileLabel,
  onProfileClick,
}: MainNavMenuProps) {
  const [isTabletExpanded, setIsTabletExpanded] = useState(true);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");

  const router = useRouter();
  const pathname = usePathname();

  const effectiveSearchValue = searchValue ?? localSearch;
  const effectiveShareLabel = shareLabel || "Share";
  const effectiveQuickAddLabel = quickAddLabel || "+ New Product";

  const compactModeClasses = useMemo(
    () => ({
      button: isTabletExpanded ? "justify-start px-3" : "justify-center px-2 xl:justify-start xl:px-3",
      label: isTabletExpanded ? "" : "hidden md:inline xl:hidden",
      fullLabel: isTabletExpanded ? "" : "md:hidden xl:inline",
    }),
    [isTabletExpanded],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const desktopQuery = window.matchMedia("(min-width: 1280px)");
    const tabletQuery = window.matchMedia("(min-width: 768px)");

    const computeSidebarOffset = () => {
      if (desktopQuery.matches) return DESKTOP_SIDEBAR_WIDTH;
      if (tabletQuery.matches) {
        return isTabletExpanded ? TABLET_EXPANDED_SIDEBAR_WIDTH : TABLET_COLLAPSED_SIDEBAR_WIDTH;
      }
      return 0;
    };

    const applyLayoutOffsets = () => {
      const sidebarOffset = computeSidebarOffset();
      document.body.style.paddingLeft = `${sidebarOffset}px`;
      document.body.style.paddingTop = `${TOP_BAR_HEIGHT}px`;
      document.documentElement.style.setProperty("--app-shell-sidebar-offset", `${sidebarOffset}px`);
      document.documentElement.style.setProperty("--app-shell-topbar-height", `${TOP_BAR_HEIGHT}px`);
    };

    const onDesktopChange = () => applyLayoutOffsets();
    const onTabletChange = (event: MediaQueryListEvent) => {
      if (event.matches) setIsMobileDrawerOpen(false);
      applyLayoutOffsets();
    };

    applyLayoutOffsets();
    desktopQuery.addEventListener("change", onDesktopChange);
    tabletQuery.addEventListener("change", onTabletChange);

    return () => {
      desktopQuery.removeEventListener("change", onDesktopChange);
      tabletQuery.removeEventListener("change", onTabletChange);
      document.body.style.paddingLeft = "";
      document.body.style.paddingTop = "";
      document.documentElement.style.setProperty("--app-shell-sidebar-offset", "0px");
    };
  }, [isTabletExpanded]);

  useEffect(() => {
    if (!isMobileDrawerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileDrawerOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileDrawerOpen]);

  function navigateTo(item: { label: string; href?: string }) {
    if (item.href) {
      if (pathname !== item.href) router.push(item.href);
      return;
    }
    router.push(`/coming-soon?section=${encodeURIComponent(item.label)}`);
  }

  function isMainItemActive(item: { label: string; href?: string }): boolean {
    if (activeItem) return activeItem === item.label;
    return Boolean(item.href && pathname === item.href);
  }

  function runAction(action: () => void) {
    action();
    setIsMobileDrawerOpen(false);
  }

  function handleSearchInput(next: string) {
    if (onSearchChange) {
      onSearchChange(next);
      return;
    }
    setLocalSearch(next);
  }

  function handleShareClick() {
    if (onShare) {
      onShare();
      return;
    }
    router.push("/calculator?share=1");
  }

  function profileInitials() {
    const raw = (profileLabel || "Profile").trim();
    if (!raw) return "P";
    const parts = raw.split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "P";
  }

  return (
    <>
      <header
        className="fixed left-0 right-0 top-0 z-[55] border-b border-zinc-300 bg-zinc-100/95 backdrop-blur"
        style={{ left: "var(--app-shell-sidebar-offset)" }}
      >
        <div className="flex h-[65px] items-center gap-1.5 px-2.5 sm:gap-2 sm:px-4 lg:px-6">
          <button
            type="button"
            aria-label="Open navigation menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink transition hover:bg-zinc-200/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 md:hidden"
            onClick={() => setIsMobileDrawerOpen(true)}
          >
            <MenuIcon />
          </button>

          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={effectiveSearchValue}
              onChange={(event) => handleSearchInput(event.target.value)}
              placeholder={searchPlaceholder || "Search"}
              aria-label="Search"
              className="w-full rounded-xl border border-border bg-paper px-10 py-2 text-sm text-ink placeholder:text-muted/75 outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15 sm:py-2.5"
            />
          </div>

          <button
            type="button"
            aria-label="Notifications"
            className="hidden h-10 w-10 items-center justify-center rounded-lg border border-border bg-paper text-ink transition hover:bg-zinc-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 sm:inline-flex"
          >
            <BellIcon />
          </button>

          <button
            type="button"
            aria-label={effectiveShareLabel}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-paper px-2.5 text-sm font-semibold text-ink transition hover:bg-zinc-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:gap-2 sm:px-3"
            onClick={handleShareClick}
            disabled={Boolean(shareDisabled)}
          >
            <ShareIcon />
            <span className="hidden sm:inline">{effectiveShareLabel}</span>
          </button>

          <button
            type="button"
            aria-label="Open profile"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-paper px-2.5 text-sm font-semibold text-ink transition hover:bg-zinc-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 sm:h-10 sm:gap-2"
            onClick={() => (onProfileClick || onSettings)()}
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-semibold text-ink">
              {profileInitials()}
            </span>
            <span className="hidden sm:inline">{profileLabel || "Profile"}</span>
          </button>

          {onQuickAdd ? (
            <button
              type="button"
              aria-label={effectiveQuickAddLabel}
              className="inline-flex h-9 items-center rounded-xl bg-accent px-2.5 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:px-3"
              onClick={() => onQuickAdd()}
              disabled={Boolean(quickAddDisabled)}
            >
              <span className="sm:hidden">+</span>
              <span className="hidden sm:inline">{effectiveQuickAddLabel}</span>
            </button>
          ) : null}
        </div>
      </header>

      {isMobileDrawerOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/35 md:hidden"
          onClick={() => setIsMobileDrawerOpen(false)}
        />
      ) : null}

      <aside
        aria-label="Main menu"
        className={[
          "fixed left-0 top-0 z-50 flex h-dvh w-[280px] flex-col border-r border-zinc-300 bg-zinc-200/95 shadow-[0_18px_45px_rgba(0,0,0,.18)] backdrop-blur transition-transform duration-200 ease-out md:hidden",
          isMobileDrawerOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-[65px] items-center justify-between border-b border-zinc-300 px-3">
          <div className="min-w-0 text-left">
            <p className="text-[1.14rem] font-bold leading-tight tracking-tight text-black">
              Product Costing
            </p>
            <p className="text-sm font-semibold leading-tight text-ink">for Small Business</p>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink transition hover:bg-zinc-100/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
            onClick={() => setIsMobileDrawerOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>

        <SidebarSections
          items={MAIN_NAV_ITEMS}
          compact={false}
          isMainItemActive={isMainItemActive}
          isSettingsActive={activeItem === "Settings" || pathname === "/settings"}
          onNavigate={(item) => runAction(() => navigateTo(item))}
          onSettings={() => runAction(onSettings)}
          onLogout={() => runAction(onLogout)}
        />
      </aside>

      <aside
        aria-label="Main menu"
        className="fixed left-0 top-0 z-40 hidden h-dvh flex-col border-r border-zinc-300 bg-zinc-200/95 backdrop-blur md:flex"
        style={{ width: "var(--app-shell-sidebar-offset)" }}
      >
        <div className="flex h-[65px] items-center border-b border-zinc-300 px-3">
          <button
            type="button"
            aria-label={isTabletExpanded ? "Collapse sidebar" : "Expand sidebar"}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink transition hover:bg-zinc-100/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 xl:hidden"
            onClick={() => setIsTabletExpanded((prev) => !prev)}
          >
            {isTabletExpanded ? <CloseIcon /> : <MenuIcon />}
          </button>

          <div className={["ml-2 min-w-0 text-left xl:ml-0", compactModeClasses.fullLabel].join(" ")}>
            <p className="truncate text-[1.14rem] font-bold leading-tight tracking-tight text-black">
              Product Costing
            </p>
            <p className="truncate text-sm font-semibold leading-tight text-ink">
              for Small Business
            </p>
          </div>
        </div>

        <SidebarSections
          items={MAIN_NAV_ITEMS}
          compact={!isTabletExpanded}
          compactButtonClasses={compactModeClasses.button}
          compactLabelClasses={compactModeClasses.label}
          compactFullLabelClasses={compactModeClasses.fullLabel}
          isMainItemActive={isMainItemActive}
          isSettingsActive={activeItem === "Settings" || pathname === "/settings"}
          onNavigate={navigateTo}
          onSettings={onSettings}
          onLogout={onLogout}
        />
      </aside>
    </>
  );
}

type SidebarSectionsProps = {
  items: Array<{ label: string; href?: string }>;
  compact: boolean;
  compactButtonClasses?: string;
  compactLabelClasses?: string;
  compactFullLabelClasses?: string;
  isMainItemActive: (item: { label: string; href?: string }) => boolean;
  isSettingsActive: boolean;
  onNavigate: (item: { label: string; href?: string }) => void;
  onSettings: () => void;
  onLogout: () => void;
};

function SidebarSections({
  items,
  compact,
  compactButtonClasses,
  compactLabelClasses,
  compactFullLabelClasses,
  isMainItemActive,
  isSettingsActive,
  onNavigate,
  onSettings,
  onLogout,
}: SidebarSectionsProps) {
  const buttonClasses = compactButtonClasses || (compact ? "justify-center px-2" : "justify-start px-3");

  return (
    <>
      <nav aria-label="Main menu" className="flex-1 overflow-y-auto px-2 py-3">
        <SidebarSectionLabel compact={compact} label="Workspace" compactLabel="W" />
        <div className="mt-2 space-y-1">
          {items.map((item) => {
            const isActive = isMainItemActive(item);
            return (
              <button
                key={item.label}
                type="button"
                title={compact ? item.label : undefined}
                className={[
                  "flex w-full items-center rounded-lg border-l-2 py-2.5 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
                  buttonClasses,
                  isActive
                    ? "border-accent bg-zinc-100 text-ink shadow-[0_1px_3px_rgba(0,0,0,.08)]"
                    : "border-transparent text-ink hover:bg-zinc-100/75",
                ].join(" ")}
                onClick={() => onNavigate(item)}
              >
                <span className={compactFullLabelClasses || (compact ? "hidden md:inline" : "")}>{item.label}</span>
                {compact ? <span className={compactLabelClasses || "md:hidden"}>{item.label.slice(0, 1).toUpperCase()}</span> : null}
              </button>
            );
          })}
        </div>

        <div className="mt-4 border-t border-zinc-300 pt-3">
          <SidebarSectionLabel compact={compact} label="Account" compactLabel="A" />
          <button
            type="button"
            title={compact ? "Settings" : undefined}
            className={[
              "mt-2 flex w-full items-center rounded-lg border-l-2 py-2.5 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
              buttonClasses,
              isSettingsActive
                ? "border-accent bg-zinc-100 text-ink shadow-[0_1px_3px_rgba(0,0,0,.08)]"
                : "border-transparent text-ink hover:bg-zinc-100/75",
            ].join(" ")}
            onClick={onSettings}
          >
            <span className={compactFullLabelClasses || (compact ? "hidden md:inline" : "")}>Settings</span>
            {compact ? <span className={compactLabelClasses || "md:hidden"}>S</span> : null}
          </button>

          <button
            type="button"
            title={compact ? "Log out" : undefined}
            className={[
              "mt-1 flex w-full items-center rounded-lg border-l-2 border-transparent py-2.5 text-left text-sm font-semibold text-ink transition hover:bg-zinc-100/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
              buttonClasses,
            ].join(" ")}
            onClick={onLogout}
          >
            <span className={compactFullLabelClasses || (compact ? "hidden md:inline" : "")}>Log out</span>
            {compact ? <span className={compactLabelClasses || "md:hidden"}>L</span> : null}
          </button>
        </div>
      </nav>

      <div className="px-2 py-3">

        <footer className="mt-3 border-t border-zinc-300/80 pt-3" aria-label="Sidebar footer">
          {compact ? (
            <p
              className="text-center text-[10px] font-normal leading-4 text-muted"
              title="© 2026 Justiniano Tagarda · Full-Stack Developer"
            >
              JT
              <span className="sr-only">© 2026 Justiniano Tagarda · Full-Stack Developer</span>
            </p>
          ) : (
            <div className="space-y-1 text-[10px] font-normal leading-4 text-muted">
              <p>© 2026 Justiniano Tagarda · Full-Stack Developer</p>
              <address className="not-italic">
                <a
                  href="mailto:justintagarda@gmail.com"
                  className="hover:underline"
                >
                  Email: justintagarda@gmail.com
                </a>
              </address>
              <p>Stack: Next.js, React, TypeScript, Tailwind CSS</p>
              <p>Hosting: Vercel</p>
              <p>Database/Auth: Supabase (Postgres + Google OAuth)</p>
            </div>
          )}
        </footer>
      </div>
    </>
  );
}

type SidebarSectionLabelProps = {
  compact: boolean;
  label: string;
  compactLabel: string;
};

function SidebarSectionLabel({ compact, label, compactLabel }: SidebarSectionLabelProps) {
  if (compact) {
    return (
      <p className="px-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80">
        {compactLabel}
        <span className="sr-only">{label}</span>
      </p>
    );
  }

  return <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80">{label}</p>;
}

type IconProps = { className?: string };

function MenuIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={className}
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function CloseIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={className}
    >
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function ShareIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      className={className}
    >
      <g>
        <path
          transform="rotate(0,12,12) translate(1,4.07312518358231) scale(0.6875,0.6875)"
          fill="currentColor"
          d="M22.134003,13.192995C27.583008,13.192995,32,17.610019,32,23.06L12.267029,23.06C12.267029,17.610019,16.685028,13.192995,22.134003,13.192995z M9.8650208,12.192995C11.811005,12.192995 13.622009,12.765016 15.150024,13.738008 12.440002,15.645998 10.548004,18.627017 10.085022,22.06L0,22.06C0,16.610019,4.4170227,12.192995,9.8650208,12.192995z M22.134003,1.6340032C25,1.634003 27.323029,3.9570013 27.323029,6.8229989 27.323029,9.6879891 25,12.011995 22.134003,12.011995 19.267029,12.011995 16.945007,9.6879891 16.945007,6.8229989 16.945007,3.9570013 19.267029,1.634003 22.134003,1.6340032z M9.8660278,0C12.731018,1.156568E-07 15.054016,2.3229984 15.054016,5.1879891 15.054016,8.0549935 12.731018,10.377993 9.8660278,10.377993 7,10.377993 4.677002,8.0549935 4.677002,5.1879891 4.677002,2.3229984 7,1.156568E-07 9.8660278,0z"
        />
      </g>
    </svg>
  );
}

function SearchIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={className}
    >
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

function BellIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={className}
    >
      <path d="M12 4a5 5 0 0 0-5 5v3.5L5 15v1h14v-1l-2-2.5V9a5 5 0 0 0-5-5Z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
    </svg>
  );
}
