"use client";

import dynamic from "next/dynamic";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";

const ActivitiesApp = dynamic(() => import("@/components/ActivitiesApp"), {
  ssr: false,
  loading: () => <RouteLoadingFallback label="Loading activities..." />,
});

export default function ActivitiesPage() {
  return <ActivitiesApp />;
}
