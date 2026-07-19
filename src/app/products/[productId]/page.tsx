"use client";

import dynamic from "next/dynamic";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";

const ProductDetailsApp = dynamic(() => import("@/components/ProductDetailsApp"), {
  ssr: false,
  loading: () => <RouteLoadingFallback label="Loading product details..." />,
});

export default function ProductDetailsPage() {
  return <ProductDetailsApp />;
}
