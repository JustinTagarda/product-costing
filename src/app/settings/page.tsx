"use client";

import dynamic from "next/dynamic";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";

const SettingsApp = dynamic(() => import("@/components/SettingsApp"), {
  ssr: false,
  loading: () => <RouteLoadingFallback label="Loading settings..." />,
});

export default function SettingsPage() {
  return <SettingsApp />;
}
