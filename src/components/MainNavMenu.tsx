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
  onQuickAdd?: () => void;
  quickAddLabel?: string;
  profileLabel?: string;
  onProfileClick?: () => void;
};

const TOP_BAR_HEIGHT = 72;
const DESKTOP_SIDEBAR_WIDTH = 272;
const TABLET_EXPANDED_SIDEBAR_WIDTH = 248;
const TABLET_COLLAPSED_SIDEBAR_WIDTH = 88;

const MAIN_NAV_ITEMS: Array<{ label: string; href?: string }> = [
  { label: "Dashboard", href: "/" },
  { label: "Cost Calculator", href: "/calculator" },
  { label: "Products", href: "/products" },
  { label: "Materials", href: "/materials" },
  { label: "Purchases", href: "/purchases" },
  { label: "BOM", href: "/bom" },
  { label: "Reports" },
];

export function MainNavMenu({
  activeItem,
  onSettings,
  onLogout,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onQuickAdd,
  quickAddLabel,
  profileLabel,
  onProfileClick,
}: MainNavMenuProps) {
  const [isTabletExpanded, setIsTabletExpanded] = useState(true);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");

  const router = useRouter();
  const pathname = usePathname();

  const effectiveSearchValue = searchValue ?? localSearch;

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
        <div className="flex h-[72px] items-center gap-2 px-3 sm:px-4 lg:px-6">
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
              className="w-full rounded-xl border border-border bg-paper px-10 py-2 text-sm text-ink placeholder:text-muted/75 outline-none shadow-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
            />
          </div>

          <button
            type="button"
            aria-label="Notifications"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-paper text-ink transition hover:bg-zinc-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
          >
            <BellIcon />
          </button>

          <button
            type="button"
            aria-label="Open profile"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-paper px-2.5 py-2 text-sm font-semibold text-ink transition hover:bg-zinc-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
            onClick={() => (onProfileClick || onSettings)()}
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-semibold text-ink">
              {profileInitials()}
            </span>
            <span className="hidden sm:inline">{profileLabel || "Profile"}</span>
          </button>

          <button
            type="button"
            className="inline-flex items-center rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-paper shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
            onClick={() => onQuickAdd?.()}
          >
            {quickAddLabel || "+ New Product"}
          </button>
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
        <div className="flex h-[72px] items-center justify-between border-b border-zinc-300 px-3">
          <p className="text-base font-semibold tracking-tight text-ink">Small Business Costing</p>
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
        <div className="flex h-[72px] items-center border-b border-zinc-300 px-3">
          <button
            type="button"
            aria-label={isTabletExpanded ? "Collapse sidebar" : "Expand sidebar"}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink transition hover:bg-zinc-100/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 xl:hidden"
            onClick={() => setIsTabletExpanded((prev) => !prev)}
          >
            {isTabletExpanded ? <CloseIcon /> : <MenuIcon />}
          </button>

          <p className={["ml-2 truncate text-base font-semibold tracking-tight text-ink", compactModeClasses.fullLabel].join(" ")}>
            Small Business Costing
          </p>
          <p className={["ml-2 text-sm font-semibold text-ink", compactModeClasses.label].join(" ")}>SBC</p>
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
        {items.map((item) => {
          const isActive = isMainItemActive(item);
          return (
            <button
              key={item.label}
              type="button"
              title={compact ? item.label : undefined}
              className={[
                "mt-1 flex w-full items-center rounded-md py-2 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
                buttonClasses,
                isActive ? "bg-zinc-100 text-ink" : "text-ink hover:bg-zinc-100/75",
              ].join(" ")}
              onClick={() => onNavigate(item)}
            >
              <span className={compactFullLabelClasses || (compact ? "hidden md:inline" : "")}>{item.label}</span>
              {compact ? <span className={compactLabelClasses || "md:hidden"}>{item.label.slice(0, 1).toUpperCase()}</span> : null}
            </button>
          );
        })}
        <div className="mt-3 border-t border-zinc-300 pt-3">
          <button
            type="button"
            title={compact ? "Settings" : undefined}
            className={[
              "flex w-full items-center rounded-md py-2 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
              buttonClasses,
              isSettingsActive ? "bg-zinc-100 text-ink" : "text-ink hover:bg-zinc-100/75",
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
              "mt-1 flex w-full items-center rounded-md py-2 text-left text-sm font-semibold text-ink transition hover:bg-zinc-100/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
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
