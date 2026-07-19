"use client";

import dynamic from "next/dynamic";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";

const ProductsApp = dynamic(() => import("@/components/ProductsApp"), {
  ssr: false,
  loading: () => <RouteLoadingFallback label="Loading products..." />,
});

export default function ProductsPage() {
  return <ProductsApp />;
}
