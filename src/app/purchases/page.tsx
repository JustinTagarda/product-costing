"use client";

import dynamic from "next/dynamic";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";

const PurchasesApp = dynamic(() => import("@/components/PurchasesApp"), {
  ssr: false,
  loading: () => <RouteLoadingFallback label="Loading purchases..." />,
});

export default function PurchasesPage() {
  return <PurchasesApp />;
}
