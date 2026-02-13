"use client";

import dynamic from "next/dynamic";

const ProductDetailsApp = dynamic(() => import("@/components/ProductDetailsApp"), {
  ssr: false,
  loading: () => (
    <div className="px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
      <div className="w-full animate-[fadeUp_.45s_ease-out]">
        <p className="font-mono text-xs text-muted">Loading product details...</p>
        <div className="mt-6 h-[420px] rounded-2xl border border-border bg-card/80 shadow-[0_18px_55px_rgba(0,0,0,.08)] backdrop-blur-md" />
      </div>
    </div>
  ),
});

export default function ProductDetailsPage() {
  return <ProductDetailsApp />;
}

