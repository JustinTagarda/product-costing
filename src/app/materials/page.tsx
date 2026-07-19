"use client";

import dynamic from "next/dynamic";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";

const MaterialsApp = dynamic(() => import("@/components/MaterialsApp"), {
  ssr: false,
  loading: () => <RouteLoadingFallback label="Loading materials..." />,
});

export default function MaterialsPage() {
  return <MaterialsApp />;
}
