"use client";

import dynamic from "next/dynamic";

const ComingSoonApp = dynamic(() => import("@/components/ComingSoonApp"), {
  ssr: false,
  loading: () => (
    <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
      <div className="flex min-h-[calc(100dvh-180px)] items-center justify-center">
        <div className="w-full max-w-xl rounded-2xl border border-border bg-card/80 p-6 shadow-[0_18px_55px_rgba(0,0,0,.08)] backdrop-blur-md">
          <p className="font-mono text-xs text-muted">Loading page...</p>
        </div>
      </div>
    </div>
  ),
});

export default function ComingSoonPage() {
  return <ComingSoonApp />;
}
