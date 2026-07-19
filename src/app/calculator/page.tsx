"use client";

import dynamic from "next/dynamic";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";

const CostingApp = dynamic(() => import("@/components/CostingApp"), {
  ssr: false,
  loading: () => <RouteLoadingFallback label="Loading calculator..." />,
});

export default function CalculatorPage() {
  return <CostingApp />;
}
