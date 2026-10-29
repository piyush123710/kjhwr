import React from "react";
import { NavSection } from "../types/analytics";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface AppLayoutProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  upstreamStatus: "ONLINE" | "CACHED_FALLBACK" | "ERROR";
  fetchedAt?: string;
  fuelhhCount: number;
  windforCount: number;
  isRefreshing: boolean;
  onRefresh: () => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  activeSection,
  onSelectSection,
  sidebarCollapsed,
  onToggleSidebar,
  upstreamStatus,
  fetchedAt,
  fuelhhCount,
  windforCount,
  isRefreshing,
  onRefresh,
  children,
}) => {
  return (
    <div className="min-h-screen h-screen bg-[#0B0F17] text-slate-100 flex overflow-hidden">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={onSelectSection}
        collapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebar}
        upstreamStatus={upstreamStatus}
        fuelhhCount={fuelhhCount}
        windforCount={windforCount}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          activeSection={activeSection}
          upstreamStatus={upstreamStatus}
          fetchedAt={fetchedAt}
          isRefreshing={isRefreshing}
          onRefresh={onRefresh}
        />

        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {children}
        </main>
      </div>
    </div>
  );
};
