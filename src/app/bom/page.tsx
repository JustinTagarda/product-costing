"use client";

import dynamic from "next/dynamic";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";

const BomApp = dynamic(() => import("@/components/BomApp"), {
  ssr: false,
  loading: () => <RouteLoadingFallback label="Loading BOM..." />,
});

export default function BomPage() {
  return <BomApp />;
}
