"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type MainNavMenuProps = {
  activeItem?: string;
  onSettings: () => void;
  onLogout: () => void;
  onUnimplementedNavigate?: (section: string) => void;
};

const MAIN_NAV_ITEMS: Array<{ label: string; href?: string }> = [
  { label: "Dashboard", href: "/" },
  { label: "Materials", href: "/materials" },
  { label: "Purchases", href: "/purchases" },
  { label: "Components" },
  { label: "BOM" },
  { label: "Products" },
  { label: "Labor" },
  { label: "Overheads" },
  { label: "Reports" },
];

export function MainNavMenu({
  activeItem,
  onSettings,
  onLogout,
  onUnimplementedNavigate,
}: MainNavMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  function navigateTo(item: { label: string; href?: string }) {
    if (item.href) {
      if (pathname !== item.href) router.push(item.href);
      return;
    }
    onUnimplementedNavigate?.(item.label);
  }

  function runAndClose(action: () => void) {
    action();
    setIsOpen(false);
  }

  return (
    <div className="sticky top-0 z-50">
      {isOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/5 backdrop-blur-[1px]"
          onClick={() => setIsOpen(false)}
        />
      ) : null}

      <div className="relative z-50 border-b border-zinc-300 bg-zinc-200/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <button
            type="button"
            aria-expanded={isOpen}
            aria-haspopup="menu"
            aria-controls="main-nav-dropdown"
            className="inline-flex items-center gap-2 rounded-lg py-0.5 text-left font-semibold text-ink transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
            onClick={() => setIsOpen((prev) => !prev)}
          >
            <span aria-hidden="true" className="font-mono text-[1.85rem] leading-none">
              {isOpen ? "x" : "\u2630"}
            </span>
            <span className="text-[1.85rem] leading-none">Small Business Costing</span>
          </button>
        </div>
      </div>

      <div className="relative z-50 mx-auto max-w-6xl px-4">
        {isOpen ? (
          <nav
            id="main-nav-dropdown"
            aria-label="Main menu"
            className="absolute left-4 top-2 w-[220px] overflow-hidden rounded-xl border border-zinc-400/70 bg-zinc-300 text-ink shadow-[0_18px_45px_rgba(0,0,0,.18)] animate-[popIn_.18s_ease-out]"
          >
            <div className="px-2 py-2">
              {MAIN_NAV_ITEMS.map((item) => {
                const isActive = activeItem
                  ? activeItem === item.label
                  : item.href
                    ? pathname === item.href
                    : false;
                return (
                  <button
                    key={item.label}
                    type="button"
                    className={[
                      "w-full rounded-md px-3 py-2 text-left text-[1.05rem] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
                      isActive ? "bg-zinc-200/85" : "hover:bg-zinc-200/70",
                    ].join(" ")}
                    onClick={() => runAndClose(() => navigateTo(item))}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <div className="border-t border-zinc-400/70 px-2 py-2">
              <button
                type="button"
                className={[
                  "w-full rounded-md px-3 py-2 text-left text-[1.05rem] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
                  activeItem === "Settings" ? "bg-zinc-200/85" : "hover:bg-zinc-200/70",
                ].join(" ")}
                onClick={() => runAndClose(onSettings)}
              >
                Settings
              </button>
              <button
                type="button"
                className="mt-1 w-full rounded-md px-3 py-2 text-left text-[1.05rem] font-semibold transition hover:bg-zinc-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
                onClick={() => runAndClose(onLogout)}
              >
                Log out
              </button>
            </div>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
