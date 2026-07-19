"use client";

import Image from "next/image";
import Link from "next/link";
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
  viewerMode?: boolean;
  profileLabel?: string;
  profileImageUrl?: string | null;
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
  viewerMode,
  profileLabel,
  profileImageUrl,
  onProfileClick,
}: MainNavMenuProps) {
  const [isTabletExpanded, setIsTabletExpanded] = useState(true);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const [failedProfileImageUrl, setFailedProfileImageUrl] = useState<string | null>(null);

  const router = useRouter();
  const pathname = usePathname();

  const effectiveSearchValue = searchValue ?? localSearch;
  const effectiveShareLabel = shareLabel || "Share";
  const effectiveQuickAddLabel = quickAddLabel || "+ New Product";
  const normalizedProfileImageUrl = (profileImageUrl || "").trim();
  const showProfileImage =
    normalizedProfileImageUrl.length > 0 && failedProfileImageUrl !== normalizedProfileImageUrl;

  const compactModeClasses = useMemo(
    () => ({
      button: isTabletExpanded ? "justify-start px-3" : "justify-center px-2 xl:justify-start xl:px-3",
      label: isTabletExpanded ? "" : "hidden md:inline xl:hidden",
      fullLabel: isTabletExpanded ? "" : "md:hidden xl:inline",
    }),
    [isTabletExpanded],
  );

  useEffect(() => {
    const root = document.documentElement;
    const blurViewerModeSelect = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const select = target.closest("select");
      if (!(select instanceof HTMLSelectElement)) return;
      window.requestAnimationFrame(() => {
        select.blur();
      });
    };

    if (viewerMode) {
      root.setAttribute("data-viewer-mode", "true");
      document.addEventListener("focusin", blurViewerModeSelect, true);
      return () => {
        document.removeEventListener("focusin", blurViewerModeSelect, true);
        root.removeAttribute("data-viewer-mode");
      };
    }

    document.removeEventListener("focusin", blurViewerModeSelect, true);
    root.removeAttribute("data-viewer-mode");
    return () => {
      document.removeEventListener("focusin", blurViewerModeSelect, true);
      root.removeAttribute("data-viewer-mode");
    };
  }, [viewerMode]);

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
        className="fixed left-0 right-0 top-0 z-[55] border-b border-zinc-200 bg-white/80 backdrop-blur-md"
        style={{ left: "var(--app-shell-sidebar-offset)" }}
      >
        <div className="flex h-[65px] items-center gap-1.5 px-2.5 sm:gap-2 sm:px-4 lg:px-6">
          <button
            type="button"
            aria-label="Open navigation menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 md:hidden"
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
            aria-label={effectiveShareLabel}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-paper px-2.5 text-sm font-semibold text-ink transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:gap-2 sm:px-3"
            onClick={handleShareClick}
            disabled={Boolean(shareDisabled)}
          >
            <ShareIcon />
            <span className="hidden sm:inline">{effectiveShareLabel}</span>
          </button>

          <button
            type="button"
            aria-label="Open profile"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-paper px-2.5 text-sm font-semibold text-ink transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 sm:h-10 sm:gap-2"
            onClick={() => (onProfileClick || onSettings)()}
          >
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-200">
              {showProfileImage ? (
                <Image
                  src={normalizedProfileImageUrl}
                  alt={profileLabel ? `${profileLabel} profile photo` : "Profile photo"}
                  width={24}
                  height={24}
                  unoptimized
                  className="h-6 w-6 object-cover"
                  onError={() => setFailedProfileImageUrl(normalizedProfileImageUrl)}
                />
              ) : (
                <span className="text-[11px] font-semibold text-ink">{profileInitials()}</span>
              )}
            </span>
            <span className="hidden sm:inline">{profileLabel || "Profile"}</span>
          </button>

          {onQuickAdd ? (
            <button
              type="button"
              aria-label={effectiveQuickAddLabel}
              className="inline-flex h-9 items-center rounded-xl app-btn-primary px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:px-3"
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
          "fixed left-0 top-0 z-50 flex h-dvh w-[280px] flex-col border-r border-zinc-200 bg-white/75 shadow-[0_18px_45px_rgba(0,0,0,.18)] backdrop-blur-md transition-transform duration-200 ease-out md:hidden",
          isMobileDrawerOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-[65px] items-center justify-between border-b border-zinc-200 px-3">
          <div className="min-w-0 text-left">
            <p className="font-serif text-[1.14rem] font-bold leading-tight tracking-tight text-ink">
              Product Costing
            </p>
            <p className="text-sm font-semibold leading-tight text-ink">for Small Business</p>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink transition hover:bg-zinc-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
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
          isActivitiesActive={activeItem === "Activities" || pathname === "/activities"}
          onNavigate={() => setIsMobileDrawerOpen(false)}
          onLogout={() => runAction(onLogout)}
        />
      </aside>

      <aside
        aria-label="Main menu"
        className="fixed left-0 top-0 z-40 hidden h-dvh flex-col border-r border-zinc-200 bg-white/75 backdrop-blur-md md:flex"
        style={{ width: "var(--app-shell-sidebar-offset)" }}
      >
        <div className="flex h-[65px] items-center border-b border-zinc-200 px-3">
          <button
            type="button"
            aria-label={isTabletExpanded ? "Collapse sidebar" : "Expand sidebar"}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink transition hover:bg-zinc-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 xl:hidden"
            onClick={() => setIsTabletExpanded((prev) => !prev)}
          >
            {isTabletExpanded ? <CloseIcon /> : <MenuIcon />}
          </button>

          <div className={["ml-2 min-w-0 text-left xl:ml-0", compactModeClasses.fullLabel].join(" ")}>
            <p className="truncate font-serif text-[1.14rem] font-bold leading-tight tracking-tight text-ink">
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
          compactFullLabelClasses={compactModeClasses.fullLabel}
          isMainItemActive={isMainItemActive}
          isSettingsActive={activeItem === "Settings" || pathname === "/settings"}
          isActivitiesActive={activeItem === "Activities" || pathname === "/activities"}
          onNavigate={() => {}}
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
  compactFullLabelClasses?: string;
  isMainItemActive: (item: { label: string; href?: string }) => boolean;
  isSettingsActive: boolean;
  isActivitiesActive: boolean;
  onNavigate: (item: { label: string; href?: string }) => void;
  onLogout: () => void;
};

function SidebarSections({
  items,
  compact,
  compactButtonClasses,
  compactFullLabelClasses,
  isMainItemActive,
  isSettingsActive,
  isActivitiesActive,
  onNavigate,
  onLogout,
}: SidebarSectionsProps) {
  const buttonClasses = compactButtonClasses || (compact ? "justify-center px-2" : "justify-start px-3");
  const labelClasses = compactFullLabelClasses || (compact ? "hidden md:inline" : "");

  const itemClasses = (isActive: boolean) =>
    [
      "group flex w-full items-center gap-2.5 rounded-lg py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
      buttonClasses,
      isActive
        ? "bg-accent/10 font-semibold text-accent2"
        : "text-muted hover:bg-zinc-100/90 hover:text-ink",
    ].join(" ");

  return (
    <>
      <nav aria-label="Main menu" className="flex-1 overflow-y-auto px-2 py-3">
        <SidebarSectionLabel compact={compact} label="Workspace" compactLabel="W" />
        <div className="mt-2 space-y-0.5">
          {items.map((item) => {
            const isActive = isMainItemActive(item);
            return (
              <Link
                key={item.label}
                href={item.href ?? `/coming-soon?section=${encodeURIComponent(item.label)}`}
                title={compact ? item.label : undefined}
                aria-current={isActive ? "page" : undefined}
                className={itemClasses(isActive)}
                onClick={() => onNavigate(item)}
              >
                <NavItemIcon label={item.label} />
                <span className={labelClasses}>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-4 border-t border-zinc-200 pt-3">
          <SidebarSectionLabel compact={compact} label="Account" compactLabel="A" />
          <div className="mt-2 space-y-0.5">
            <Link
              href="/settings"
              title={compact ? "Settings" : undefined}
              aria-current={isSettingsActive ? "page" : undefined}
              className={itemClasses(isSettingsActive)}
              onClick={() => onNavigate({ label: "Settings", href: "/settings" })}
            >
              <NavItemIcon label="Settings" />
              <span className={labelClasses}>Settings</span>
            </Link>

            <Link
              href="/activities"
              title={compact ? "Activities" : undefined}
              aria-current={isActivitiesActive ? "page" : undefined}
              className={itemClasses(isActivitiesActive)}
              onClick={() => onNavigate({ label: "Activities", href: "/activities" })}
            >
              <NavItemIcon label="Activities" />
              <span className={labelClasses}>Activities</span>
            </Link>

            <button
              type="button"
              title={compact ? "Log out" : undefined}
              className={itemClasses(false)}
              onClick={onLogout}
            >
              <NavItemIcon label="Log out" />
              <span className={labelClasses}>Log out</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="px-2 py-3">

        <footer className="mt-3 border-t border-zinc-200/80 pt-3" aria-label="Sidebar footer">
          {compact ? (
            <p
              className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-muted"
              title="© 2026 Justiniano Tagarda · Full-Stack Developer"
            >
              JT
              <span className="sr-only">© 2026 Justiniano Tagarda · Full-Stack Developer</span>
            </p>
          ) : (
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80">
                Built with
              </p>
              <p className="mt-1 text-[10px] leading-4 text-muted">
                Next.js · React · TypeScript · Tailwind · Supabase · Vercel
              </p>
              <p className="mt-2.5 text-[10px] text-muted/80">
                © 2026 JustinTagarda · All rights reserved
              </p>
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

function NavItemIcon({ label }: { label: string }) {
  const common = {
    viewBox: "0 0 24 24",
    width: 18,
    height: 18,
    "aria-hidden": true,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "shrink-0",
  };

  switch (label) {
    case "Dashboard":
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "Cost Calculator":
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M8.5 7h7" />
          <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
          <path d="M8.5 15h.01M12 15h.01M15.5 15v3" />
        </svg>
      );
    case "Products":
      return (
        <svg {...common}>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
          <path d="M4 7.5l8 4.5 8-4.5" />
          <path d="M12 12v9" />
        </svg>
      );
    case "Materials":
      return (
        <svg {...common}>
          <path d="M12 3l9 5-9 5-9-5 9-5z" />
          <path d="M3 13l9 5 9-5" />
          <path d="M3 17l9 5 9-5" />
        </svg>
      );
    case "Purchases":
      return (
        <svg {...common}>
          <circle cx="9" cy="20" r="1.4" />
          <circle cx="17" cy="20" r="1.4" />
          <path d="M3 4h2.5l2.2 11.5a1.6 1.6 0 001.6 1.3h7.6a1.6 1.6 0 001.6-1.3L20 8H6" />
        </svg>
      );
    case "Settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.55V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1-1.55 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.55-1H3a2 2 0 110-4h.09a1.7 1.7 0 001.55-1 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34h0a1.7 1.7 0 001-1.55V3a2 2 0 114 0v.09a1.7 1.7 0 001 1.55h0a1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87v0a1.7 1.7 0 001.55 1H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.55 1z" />
        </svg>
      );
    case "Activities":
      return (
        <svg {...common}>
          <path d="M3 12h4l3-8 4 16 3-8h4" />
        </svg>
      );
    case "Log out":
      return (
        <svg {...common}>
          <path d="M9 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
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
