import React from "react";
import {
  BarChart3,
  TableProperties,
  Target,
  ShieldCheck,
  SlidersHorizontal,
  Wind,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { NavSection } from "../types/analytics";

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  upstreamStatus: "ONLINE" | "CACHED_FALLBACK" | "ERROR";
  fuelhhCount: number;
  windforCount: number;
}

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "explorer", label: "Forecast Explorer", icon: TableProperties },
  { id: "accuracy", label: "Accuracy Analysis", icon: Target },
  { id: "quality", label: "Data Quality", icon: ShieldCheck },
  { id: "settings", label: "Settings", icon: SlidersHorizontal },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  collapsed,
  onToggleCollapse,
  upstreamStatus,
  fuelhhCount,
  windforCount,
}) => {
  return (
    <aside
      className={`bg-[#0E131F] border-r border-slate-800/90 flex flex-col justify-between shrink-0 select-none transition-opacity ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Top Brand + Nav */}
      <div>
        <div className="h-14 px-4 border-b border-slate-800/90 flex items-center justify-between">
          <button
            onClick={() => onSelectSection("overview")}
            className="flex items-center gap-2.5 text-left focus:outline-none group whitespace-nowrap overflow-hidden"
          >
            <div className="w-7 h-7 rounded bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
              <Wind className="w-4 h-4 text-cyan-400" />
            </div>
            {!collapsed && (
              <span className="text-base font-bold tracking-tight text-slate-100">
                WindSight
              </span>
            )}
          </button>
          <button
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded transition-colors shrink-0"
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        <nav className="p-2.5 space-y-1" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectSection(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? "text-cyan-400" : "text-slate-400"
                  }`}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Data Provider & Coverage Footer */}
      <div className="p-3.5 border-t border-slate-800/90 text-xs">
        {collapsed ? (
          <div
            className="text-center font-mono text-[10px] text-slate-400"
            title="Elexon BMRS · Jan 2026"
          >
            BMRS
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span>Data Provider</span>
              <span className="font-mono text-slate-200">Elexon BMRS</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>API Status</span>
              <span
                className={`font-mono ${
                  upstreamStatus === "ONLINE"
                    ? "text-emerald-400"
                    : upstreamStatus === "CACHED_FALLBACK"
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                {upstreamStatus === "ONLINE"
                  ? "Connected"
                  : upstreamStatus === "CACHED_FALLBACK"
                  ? "Local Cache"
                  : "Offline"}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-800/70 space-y-1 text-[11px] text-slate-400 font-mono">
              <div className="flex items-center justify-between">
                <span>Window</span>
                <span className="text-slate-300 tabular-nums">Jan 2026 (31d)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>FUELHH</span>
                <span className="text-slate-300 tabular-nums">
                  {fuelhhCount.toLocaleString()} recs
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>WINDFOR</span>
                <span className="text-slate-300 tabular-nums">
                  {windforCount.toLocaleString()} recs
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
