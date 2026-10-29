import React from "react";
import { AlertTriangle, Database, RefreshCw, CheckCircle2, Clock } from "lucide-react";

export const LoadingState: React.FC<{ label?: string; rows?: number }> = ({
  label = "Loading Elexon BMRS January 2026 dataset...",
  rows = 5,
}) => {
  return (
    <div className="bg-[#111726] border border-slate-800/90 rounded-md p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5 text-xs text-slate-400 font-mono">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
          <span>{label}</span>
        </div>
        <span className="text-xs text-slate-500 font-mono">FUELHH · WINDFOR</span>
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-9 bg-slate-800/40 rounded animate-pulse border border-slate-800/50"
          />
        ))}
      </div>
    </div>
  );
};

export const ErrorState: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
}> = ({ title = "Elexon BMRS Data Retrieval Error", message, onRetry }) => {
  return (
    <div className="bg-[#111726] border border-red-900/60 rounded-md p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {message}
            </p>
            <p className="text-xs text-slate-500 mt-2 font-mono">
              WindSight never fabricates or substitutes synthetic metrics when upstream Elexon data is unavailable.
            </p>
          </div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Fetch</span>
          </button>
        )}
      </div>
    </div>
  );
};

export const EmptyState: React.FC<{
  title?: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({
  title = "No Matched Intervals in Current Selection",
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="bg-[#111726] border border-slate-800/90 rounded-md p-8 text-center">
      <Database className="w-6 h-6 text-slate-500 mx-auto mb-2.5" />
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-3.5 py-1.5 text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded transition-colors whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export const DataStatus: React.FC<{
  upstreamStatus: "ONLINE" | "CACHED_FALLBACK" | "ERROR";
  fetchedAt?: string;
}> = ({ upstreamStatus, fetchedAt }) => {
  const formattedTime = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString("en-GB", {
        timeZone: "Europe/London",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  return (
    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono whitespace-nowrap">
      {upstreamStatus === "ONLINE" ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      ) : upstreamStatus === "CACHED_FALLBACK" ? (
        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      ) : (
        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
      )}
      <span className="text-slate-300">
        {upstreamStatus === "ONLINE"
          ? "Elexon BMRS Verified"
          : upstreamStatus === "CACHED_FALLBACK"
          ? "Cached Historical Snapshot"
          : "Feed Offline"}
      </span>
      <span aria-hidden="true" className="text-slate-600">
        ·
      </span>
      <span className="text-slate-400 tabular-nums">Sync {formattedTime} GMT</span>
    </div>
  );
};
