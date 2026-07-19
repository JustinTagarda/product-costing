"use client";

import dynamic from "next/dynamic";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";

const DashboardApp = dynamic(() => import("@/components/DashboardApp"), {
  ssr: false,
  loading: () => <RouteLoadingFallback label="Loading dashboard..." />,
});

export default function Home() {
  return <DashboardApp />;
}
