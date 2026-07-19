"use client";

import dynamic from "next/dynamic";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";

const DatasetSelectionApp = dynamic(() => import("@/components/DatasetSelectionApp"), {
  ssr: false,
  loading: () => <RouteLoadingFallback label="Preparing your data..." />,
});

export default function DatasetSelectPage() {
  return <DatasetSelectionApp />;
}
