"use client";

import dynamic from "next/dynamic";

const SettingsApp = dynamic(() => import("@/components/SettingsApp"), {
  ssr: false,
  loading: () => (
    <div className="px-4 py-10">
      <div className="mx-auto max-w-[1400px] animate-[fadeUp_.45s_ease-out]">
        <p className="font-mono text-xs text-muted">Loading settings...</p>
        <div className="mt-6 h-[420px] rounded-2xl border border-border bg-card/80 shadow-[0_18px_55px_rgba(0,0,0,.08)] backdrop-blur-md" />
      </div>
    </div>
  ),
});

export default function SettingsPage() {
  return <SettingsApp />;
}
