import React from "react";
import { RefreshCw } from "lucide-react";
import { NavSection } from "../types/analytics";
import { DataStatus } from "./States";

interface TopBarProps {
  activeSection: NavSection;
  upstreamStatus: "ONLINE" | "CACHED_FALLBACK" | "ERROR";
  fetchedAt?: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}

const SECTION_TITLES: Record<NavSection, { title: string; subtitle: string }> = {
  overview: {
    title: "Day-Ahead Wind Procurement Intelligence",
    subtitle: "Executive comparison of UK national wind actuals (FUELHH) and cutoff-eligible forecasts (WINDFOR)",
  },
  explorer: {
    title: "30-Minute Delivery Interval & Vintage Explorer",
    subtitle: "Granular settlement period inspection with historical forecast publication audit trails",
  },
  accuracy: {
    title: "Statistical Forecast Accuracy & Bias Evaluation",
    subtitle: "Quantitative error metrics, diurnal profiles, and cutoff horizon sensitivity across January 2026",
  },
  quality: {
    title: "Elexon Dataset Integrity & Coverage Audit",
    subtitle: "Transparency report on record completeness, duplicate filtering, and temporal resolution alignment",
  },
  settings: {
    title: "Market Convention & Methodology Configuration",
    subtitle: "Configure UK day-ahead gate closure cutoff rules, interval alignment, and MAPE denominator guards",
  },
};

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  upstreamStatus,
  fetchedAt,
  isRefreshing,
  onRefresh,
}) => {
  const info = SECTION_TITLES[activeSection];

  return (
    <header className="bg-[#0E131F] border-b border-slate-800/90 px-6 py-3 flex items-center justify-between gap-8 shrink-0">
      {/* Zone 1: Breadcrumb & Page Title */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono whitespace-nowrap">
          <span>WindSight</span>
          <span aria-hidden="true">/</span>
          <span className="text-cyan-400 font-medium">{info.title}</span>
          <span aria-hidden="true">·</span>
          <span className="text-amber-300/90">
            Historical Evaluation Window: Jan 2026 (Not Live Trading)
          </span>
        </div>
      </div>

      {/* Zone 2: Timezone & Data Sync Telemetry */}
      <div className="hidden xl:flex items-center gap-4 text-xs text-slate-400 font-mono whitespace-nowrap shrink-0">
        <span>Timezone: Europe/London (GMT)</span>
        <span aria-hidden="true" className="text-slate-600">
          ·
        </span>
        <DataStatus upstreamStatus={upstreamStatus} fetchedAt={fetchedAt} />
      </div>

      {/* Zone 3: Primary Refresh Action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="px-3.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-cyan-400 ${
              isRefreshing ? "animate-spin" : ""
            }`}
          />
          <span>{isRefreshing ? "Syncing Elexon..." : "Refresh Elexon Data"}</span>
        </button>
      </div>
    </header>
  );
};
