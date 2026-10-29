import React from "react";
import { Calendar } from "lucide-react";
import { CutoffMode, AlignmentMode } from "../types/analytics";

interface DateFilterProps {
  startDate: string;
  endDate: string;
  cutoffMode: CutoffMode;
  alignmentMode: AlignmentMode;
  onChangeDates: (start: string, end: string) => void;
  onChangeCutoff: (mode: CutoffMode) => void;
  onChangeAlignment: (mode: AlignmentMode) => void;
}

const PRESETS: Array<{ label: string; start: string; end: string }> = [
  { label: "Full Jan 2026", start: "2026-01-01", end: "2026-01-31" },
  { label: "Jan 01–07", start: "2026-01-01", end: "2026-01-07" },
  { label: "Jan 08–14", start: "2026-01-08", end: "2026-01-14" },
  { label: "Jan 15–21", start: "2026-01-15", end: "2026-01-21" },
  { label: "Jan 22–31", start: "2026-01-22", end: "2026-01-31" },
];

export const DateFilter: React.FC<DateFilterProps> = ({
  startDate,
  endDate,
  cutoffMode,
  alignmentMode,
  onChangeDates,
  onChangeCutoff,
  onChangeAlignment,
}) => {
  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    const clamped = val < "2026-01-01" ? "2026-01-01" : val > "2026-01-31" ? "2026-01-31" : val;
    if (clamped > endDate) {
      onChangeDates(clamped, clamped);
    } else {
      onChangeDates(clamped, endDate);
    }
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    const clamped = val < "2026-01-01" ? "2026-01-01" : val > "2026-01-31" ? "2026-01-31" : val;
    if (clamped < startDate) {
      onChangeDates(clamped, clamped);
    } else {
      onChangeDates(startDate, clamped);
    }
  };

  return (
    <div className="bg-[#111726] border border-slate-800/90 rounded-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
      {/* Left: Date Inputs + Quick Presets */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium text-slate-300 whitespace-nowrap">
            Delivery Window (Jan 2026):
          </span>
        </div>

        <div className="flex items-center gap-1.5 font-mono text-xs">
          <input
            type="date"
            aria-label="Start date in January 2026"
            min="2026-01-01"
            max="2026-01-31"
            value={startDate}
            onChange={handleStartChange}
            className="bg-[#0B0F17] border border-slate-700/90 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-cyan-400 tabular-nums"
          />
          <span className="text-slate-500">to</span>
          <input
            type="date"
            aria-label="End date in January 2026"
            min="2026-01-01"
            max="2026-01-31"
            value={endDate}
            onChange={handleEndChange}
            className="bg-[#0B0F17] border border-slate-700/90 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-cyan-400 tabular-nums"
          />
        </div>

        <div className="flex items-center gap-1 bg-[#0B0F17] p-0.5 rounded border border-slate-800">
          {PRESETS.map((p) => {
            const active = startDate === p.start && endDate === p.end;
            return (
              <button
                key={p.label}
                onClick={() => onChangeDates(p.start, p.end)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Day-Ahead Decision Cutoff & Alignment selectors */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5 text-slate-400 whitespace-nowrap">
          <span>Decision Cutoff:</span>
          <select
            value={cutoffMode}
            onChange={(e) => onChangeCutoff(e.target.value as CutoffMode)}
            className="bg-[#0B0F17] border border-slate-700/90 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
          >
            <option value="d_minus_1_1100">D-1 11:00 GMT (GB Auction Gate)</option>
            <option value="d_minus_1_1200">D-1 12:00 GMT (Midday Run)</option>
            <option value="d_minus_1_1830">D-1 18:30 GMT (Evening EFA)</option>
            <option value="lead_time_12h">Rolling &ge; 12h Lead Time</option>
            <option value="lead_time_4h">Rolling &ge; 4h Lead Time</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-slate-400 whitespace-nowrap">
          <span>Matching:</span>
          <select
            value={alignmentMode}
            onChange={(e) => onChangeAlignment(e.target.value as AlignmentMode)}
            className="bg-[#0B0F17] border border-slate-700/90 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
          >
            <option value="strict_exact">Strict Exact startTime (60m)</option>
            <option value="hh_step">Half-Hourly Step-Hold (30m SP1–48)</option>
          </select>
        </label>
      </div>
    </div>
  );
};
