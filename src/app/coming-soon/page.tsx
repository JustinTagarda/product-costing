"use client";

import dynamic from "next/dynamic";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";

const ComingSoonApp = dynamic(() => import("@/components/ComingSoonApp"), {
  ssr: false,
  loading: () => <RouteLoadingFallback label="Loading page..." />,
});

export default function ComingSoonPage() {
  return <ComingSoonApp />;
}
