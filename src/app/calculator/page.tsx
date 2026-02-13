"use client";

import dynamic from "next/dynamic";

const CostingApp = dynamic(() => import("@/components/CostingApp"), {
  ssr: false,
  loading: () => (
    <div className="px-4 py-10">
      <div className="mx-auto max-w-[1400px] animate-[fadeUp_.45s_ease-out]">
        <p className="font-mono text-xs text-muted">Loading calculator...</p>
        <div className="mt-6 grid gap-6 md:grid-cols-[320px_minmax(0,1fr)]">
          <div className="h-[520px] rounded-2xl border border-border bg-card/80 shadow-[0_18px_55px_rgba(0,0,0,.08)] backdrop-blur-md" />
          <div className="h-[520px] rounded-2xl border border-border bg-card/80 shadow-[0_18px_55px_rgba(0,0,0,.08)] backdrop-blur-md" />
        </div>
      </div>
    </div>
  ),
});

export default function CalculatorPage() {
  return <CostingApp />;
}
