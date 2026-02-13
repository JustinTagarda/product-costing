"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type MainNavMenuProps = {
  activeItem?: string;
  onSettings: () => void;
  onLogout: () => void;
  onUnimplementedNavigate?: (section: string) => void;
};

type ViewportMode = "mobile" | "tablet" | "desktop";

const DESKTOP_SIDEBAR_WIDTH = 280;
const TABLET_EXPANDED_SIDEBAR_WIDTH = 248;
const TABLET_COLLAPSED_SIDEBAR_WIDTH = 88;
const MOBILE_HEADER_HEIGHT = 64;

const MAIN_NAV_ITEMS: Array<{ label: string; href?: string }> = [
  { label: "Dashboard", href: "/" },
  { label: "Materials", href: "/materials" },
  { label: "Purchases", href: "/purchases" },
  { label: "Components" },
  { label: "BOM", href: "/bom" },
  { label: "Products" },
  { label: "Labor" },
  { label: "Overheads" },
  { label: "Reports" },
];

type SidebarSectionsProps = {
  compact: boolean;
  items: Array<{ label: string; href?: string }>;
  isMainItemActive: (item: { label: string; href?: string }) => boolean;
  isSettingsActive: boolean;
  onNavigate: (item: { label: string; href?: string }) => void;
  onSettings: () => void;
  onLogout: () => void;
};

export function MainNavMenu({
  activeItem,
  onSettings,
  onLogout,
  onUnimplementedNavigate,
}: MainNavMenuProps) {
  const [viewportMode, setViewportMode] = useState<ViewportMode>("mobile");
  const [isTabletExpanded, setIsTabletExpanded] = useState(true);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const desktopQuery = window.matchMedia("(min-width: 1280px)");
    const tabletQuery = window.matchMedia("(min-width: 768px)");

    const syncViewport = () => {
      if (desktopQuery.matches) {
        setViewportMode("desktop");
        return;
      }
      if (tabletQuery.matches) {
        setViewportMode("tablet");
        return;
      }
      setViewportMode("mobile");
    };

    syncViewport();
    desktopQuery.addEventListener("change", syncViewport);
    tabletQuery.addEventListener("change", syncViewport);

    return () => {
      desktopQuery.removeEventListener("change", syncViewport);
      tabletQuery.removeEventListener("change", syncViewport);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tabletQuery = window.matchMedia("(min-width: 768px)");
    const closeDrawerOnTabletAndUp = (event: MediaQueryListEvent) => {
      if (event.matches) setIsMobileDrawerOpen(false);
    };
    tabletQuery.addEventListener("change", closeDrawerOnTabletAndUp);
    return () => {
      tabletQuery.removeEventListener("change", closeDrawerOnTabletAndUp);
    };
  }, []);

  useEffect(() => {
    if (!isMobileDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobileDrawerOpen]);

  const sidebarWidth = useMemo(() => {
    if (viewportMode === "desktop") return DESKTOP_SIDEBAR_WIDTH;
    if (viewportMode === "tablet") {
      return isTabletExpanded ? TABLET_EXPANDED_SIDEBAR_WIDTH : TABLET_COLLAPSED_SIDEBAR_WIDTH;
    }
    return 0;
  }, [isTabletExpanded, viewportMode]);

  const offsetTop = viewportMode === "mobile" ? MOBILE_HEADER_HEIGHT : 0;

  useEffect(() => {
    const { style } = document.body;
    style.paddingLeft = `${sidebarWidth}px`;
    style.paddingTop = `${offsetTop}px`;

    return () => {
      style.paddingLeft = "";
      style.paddingTop = "";
    };
  }, [offsetTop, sidebarWidth]);

  useEffect(() => {
    if (!isMobileDrawerOpen) return;
    const { style } = document.body;
    const previousOverflow = style.overflow;
    style.overflow = "hidden";

    return () => {
      style.overflow = previousOverflow;
    };
  }, [isMobileDrawerOpen]);

  function navigateTo(item: { label: string; href?: string }) {
    if (item.href) {
      if (pathname !== item.href) router.push(item.href);
      return;
    }
    onUnimplementedNavigate?.(item.label);
  }

  function runAction(action: () => void) {
    action();
    if (viewportMode === "mobile") {
      setIsMobileDrawerOpen(false);
    }
  }

  function isMainItemActive(item: { label: string; href?: string }): boolean {
    if (activeItem) return activeItem === item.label;
    if (!item.href) return false;
    return pathname === item.href;
  }

  const isSettingsActive = activeItem ? activeItem === "Settings" : pathname === "/settings";
  const isTabletCompact = viewportMode === "tablet" && !isTabletExpanded;

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 border-b border-zinc-300 bg-zinc-200/95 backdrop-blur md:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <button
            type="button"
            aria-label="Open navigation menu"
            aria-controls="main-nav-mobile-drawer"
            aria-expanded={isMobileDrawerOpen}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink transition hover:bg-zinc-100/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
            onClick={() => setIsMobileDrawerOpen(true)}
          >
            <MenuIcon />
          </button>
          <p className="text-base font-semibold tracking-tight text-ink">Small Business Costing</p>
          <span className="h-10 w-10" aria-hidden="true" />
        </div>
      </div>

      {isMobileDrawerOpen ? (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-black/35 md:hidden"
          onClick={() => setIsMobileDrawerOpen(false)}
        />
      ) : null}

      <aside
        id="main-nav-mobile-drawer"
        aria-label="Main menu"
        className={[
          "fixed left-0 top-0 z-50 flex h-dvh w-[280px] flex-col border-r border-zinc-300 bg-zinc-200/95 shadow-[0_18px_45px_rgba(0,0,0,.18)] backdrop-blur transition-transform duration-200 ease-out md:hidden",
          isMobileDrawerOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-16 items-center justify-between border-b border-zinc-300 px-3">
          <p className="text-base font-semibold tracking-tight text-ink">Small Business Costing</p>
          <button
            type="button"
            aria-label="Close navigation menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink transition hover:bg-zinc-100/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
            onClick={() => setIsMobileDrawerOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>
        <SidebarSections
          compact={false}
          items={MAIN_NAV_ITEMS}
          isMainItemActive={isMainItemActive}
          isSettingsActive={isSettingsActive}
          onNavigate={(item) => runAction(() => navigateTo(item))}
          onSettings={() => runAction(onSettings)}
          onLogout={() => runAction(onLogout)}
        />
      </aside>

      <aside
        aria-label="Main menu"
        className="fixed left-0 top-0 z-40 hidden h-dvh flex-col border-r border-zinc-300 bg-zinc-200/95 backdrop-blur md:flex"
        style={{ width: `${sidebarWidth}px` }}
      >
        <div className="flex h-16 items-center border-b border-zinc-300 px-3">
          <button
            type="button"
            aria-label={isTabletCompact ? "Expand sidebar" : "Collapse sidebar"}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink transition hover:bg-zinc-100/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 xl:hidden"
            onClick={() => setIsTabletExpanded((prev) => !prev)}
          >
            {isTabletCompact ? <MenuIcon /> : <CloseIcon />}
          </button>

          <p
            className={[
              "ml-2 truncate text-base font-semibold tracking-tight text-ink",
              isTabletCompact ? "sr-only" : "",
            ].join(" ")}
          >
            Small Business Costing
          </p>
        </div>

        <SidebarSections
          compact={isTabletCompact}
          items={MAIN_NAV_ITEMS}
          isMainItemActive={isMainItemActive}
          isSettingsActive={isSettingsActive}
          onNavigate={(item) => runAction(() => navigateTo(item))}
          onSettings={() => runAction(onSettings)}
          onLogout={() => runAction(onLogout)}
        />
      </aside>
    </>
  );
}

function SidebarSections({
  compact,
  items,
  isMainItemActive,
  isSettingsActive,
  onNavigate,
  onSettings,
  onLogout,
}: SidebarSectionsProps) {
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
                compact ? "justify-center px-2" : "justify-start px-3",
                isActive ? "bg-zinc-100 text-ink" : "text-ink hover:bg-zinc-100/75",
              ].join(" ")}
              onClick={() => onNavigate(item)}
            >
              {compact ? item.label.slice(0, 1).toUpperCase() : item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-zinc-300 px-2 py-3">
        <button
          type="button"
          title={compact ? "Settings" : undefined}
          className={[
            "flex w-full items-center rounded-md py-2 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
            compact ? "justify-center px-2" : "justify-start px-3",
            isSettingsActive ? "bg-zinc-100 text-ink" : "text-ink hover:bg-zinc-100/75",
          ].join(" ")}
          onClick={onSettings}
        >
          {compact ? "S" : "Settings"}
        </button>

        <button
          type="button"
          title={compact ? "Log out" : undefined}
          className={[
            "mt-1 flex w-full items-center rounded-md py-2 text-left text-sm font-semibold text-ink transition hover:bg-zinc-100/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
            compact ? "justify-center px-2" : "justify-start px-3",
          ].join(" ")}
          onClick={onLogout}
        >
          {compact ? "L" : "Log out"}
        </button>
      </div>
    </>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}
