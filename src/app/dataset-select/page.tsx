"use client";

import dynamic from "next/dynamic";

const DatasetSelectionApp = dynamic(() => import("@/components/DatasetSelectionApp"), {
  ssr: false,
  loading: () => (
    <div className="min-h-dvh px-6 py-8">
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card/80 p-6 shadow-sm">
        <h1 className="font-serif text-2xl tracking-tight text-ink">Preparing your data</h1>
        <p className="mt-2 text-sm text-muted">Loading available account datasets...</p>
      </div>
    </div>
  ),
});

export default function DatasetSelectPage() {
  return <DatasetSelectionApp />;
}
