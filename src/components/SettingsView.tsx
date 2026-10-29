import React from "react";
import {
  GlobalFilterState,
  CutoffMode,
  AlignmentMode,
} from "../types/analytics";

interface SettingsViewProps {
  filters: GlobalFilterState;
  onUpdateFilters: (next: Partial<GlobalFilterState>) => void;
}

const CUTOFF_OPTIONS: Array<{
  value: CutoffMode;
  title: string;
  rule: string;
  rationale: string;
}> = [
  {
    value: "d_minus_1_1100",
    title: "D-1 11:00 Europe/London (Default — GB Day-Ahead Auction Gate Closure)",
    rule: "publishTime <= (DeliveryDate - 1 day) 11:00 GMT",
    rationale:
      "Standard Great Britain Day-Ahead coupled/1-hour auction gate closure at 11:00 UK time on D-1. Selects the Elexon 09:30Z WINDFOR publication run.",
  },
  {
    value: "d_minus_1_1200",
    title: "D-1 12:00 Europe/London (Midday Bilateral / OTC Hedging Cutoff)",
    rule: "publishTime <= (DeliveryDate - 1 day) 12:00 GMT",
    rationale:
      "Captures the Elexon 11:30Z morning WINDFOR forecast run used by trading desks for midday day-ahead OTC balancing.",
  },
  {
    value: "d_minus_1_1830",
    title: "D-1 18:30 Europe/London (Evening EFA Block Finalization)",
    rule: "publishTime <= (DeliveryDate - 1 day) 18:30 GMT",
    rationale:
      "Selects the Elexon 18:30Z evening WINDFOR forecast run prior to overnight delivery settlement period entry.",
  },
  {
    value: "lead_time_12h",
    title: "Rolling 12-Hour Minimum Lead Horizon",
    rule: "publishTime <= startTime - 12 hours",
    rationale:
      "Evaluates forecast skill at a constant minimum 12-hour look-ahead window before each target delivery interval.",
  },
  {
    value: "lead_time_4h",
    title: "Rolling 4-Hour Minimum Lead Horizon (Intraday Benchmark)",
    rule: "publishTime <= startTime - 4 hours",
    rationale:
      "Near-delivery benchmark showing residual wind forecast uncertainty 4 hours prior to delivery.",
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  filters,
  onUpdateFilters,
}) => {
  return (
    <div className="max-w-4xl space-y-5">
      {/* Decision Cutoff Selection */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-md p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            1. UK Day-Ahead Procurement Decision Cutoff Rule
          </h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            For every delivery interval <code className="text-cyan-300">startTime</code>, WindSight selects the single forecast with the latest{" "}
            <code className="text-cyan-300">publishTime</code> at or before the configured decision cutoff. Any forecast published after the cutoff is strictly excluded from active KPI and error calculations.
          </p>
        </div>

        <div className="space-y-2.5">
          {CUTOFF_OPTIONS.map((opt) => {
            const active = filters.cutoffMode === opt.value;
            return (
              <label
                key={opt.value}
                className={`block p-3.5 rounded border cursor-pointer transition-colors ${
                  active
                    ? "bg-cyan-500/10 border-cyan-500/40"
                    : "bg-[#0B0F17] border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="cutoffMode"
                    checked={active}
                    onChange={() => onUpdateFilters({ cutoffMode: opt.value })}
                    className="mt-1 accent-cyan-400"
                  />
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-slate-100">
                      {opt.title}
                    </div>
                    <div className="text-[11px] font-mono text-cyan-300">
                      Eligibility Predicate: {opt.rule}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {opt.rationale}
                    </p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Interval Alignment Mode */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-md p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            2. Temporal Resolution &amp; Settlement Period Matching Mode
          </h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Elexon&apos;s <code className="text-emerald-300">FUELHH</code> dataset reports 48 half-hourly settlement periods per day (`:00` and `:30`), whereas{" "}
            <code className="text-cyan-300">WINDFOR</code> reports 24 hourly target timestamps (`:00`). Choose how half-hour intervals are aligned:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(
            [
              {
                value: "strict_exact" as AlignmentMode,
                title: "Strict Exact startTime Match (Default)",
                detail:
                  "Matches only identical timestamps (744 hourly intervals in Jan 2026). Half-hour :30 actual records are preserved in the Explorer and flagged as ACTUAL_ONLY_UNMATCHED_HH without synthetic interpolation.",
              },
              {
                value: "hh_step" as AlignmentMode,
                title: "Half-Hourly Settlement Step-Hold (SP1–SP48)",
                detail:
                  "Applies each hourly WINDFOR forecast across both 30-minute settlement periods of that hour (1,488 matched intervals in Jan 2026; Interval Energy = MW × 0.5h MWh).",
              },
            ] as const
          ).map((item) => {
            const active = filters.alignmentMode === item.value;
            return (
              <label
                key={item.value}
                className={`block p-3.5 rounded border cursor-pointer transition-colors ${
                  active
                    ? "bg-cyan-500/10 border-cyan-500/40"
                    : "bg-[#0B0F17] border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="alignmentMode"
                    checked={active}
                    onChange={() =>
                      onUpdateFilters({ alignmentMode: item.value })
                    }
                    className="mt-1 accent-cyan-400"
                  />
                  <div>
                    <div className="text-xs font-semibold text-slate-100">
                      {item.title}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {item.detail}
                    </p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* MAPE Zero/Low-Denominator Threshold */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-md p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            3. MAPE Denominator Guard Threshold (MW)
          </h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Mean Absolute Percentage Error (<code className="text-cyan-300">|Forecast − Actual| / Actual</code>) becomes statistically unstable when actual generation approaches zero. Intervals with Actual Generation &le; this threshold are excluded from MAPE and explicitly disclosed.
          </p>
        </div>

        <div className="flex items-center gap-4 pt-1">
          <select
            value={filters.mapeThreshold}
            onChange={(e) =>
              onUpdateFilters({ mapeThreshold: Number(e.target.value) })
            }
            className="bg-[#0B0F17] border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-100"
          >
            <option value={0}>0 MW (Exclude Zero Only)</option>
            <option value={100}>100 MW (Default Institutional Guard)</option>
            <option value={500}>500 MW (Low-Wind Regime Filter)</option>
            <option value={1000}>1,000 MW (Conservative Guard)</option>
          </select>
          <span className="text-xs font-mono text-slate-400">
            Active Guard: Actual &gt; {filters.mapeThreshold} MW
          </span>
        </div>
      </div>
    </div>
  );
};
