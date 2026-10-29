import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import {
  GlobalFilterState,
  AccuracyResponse,
  CutoffMode,
} from "../types/analytics";
import { fetchAccuracy } from "../services/api";
import {
  formatMw,
  formatSignedMw,
  formatMwh,
  formatPct,
  formatShortDate,
} from "../lib/formatters";
import { LoadingState, ErrorState } from "./States";

interface AccuracyViewProps {
  filters: GlobalFilterState;
  onChangeCutoff: (mode: CutoffMode) => void;
}

export const AccuracyView: React.FC<AccuracyViewProps> = ({
  filters,
  onChangeCutoff,
}) => {
  const [data, setData] = useState<AccuracyResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetchAccuracy(filters, ctrl.signal)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to compute accuracy analysis");
          setLoading(false);
        }
      });

    return () => ctrl.abort();
  }, [filters]);

  if (loading) {
    return (
      <LoadingState
        label="Computing statistical forecast accuracy metrics, diurnal profiles, and cutoff benchmarks..."
        rows={8}
      />
    );
  }

  if (error || !data) {
    return <ErrorState message={error || "No accuracy data available"} />;
  }

  const { kpis, cutoffComparison, hourlyProfile, errorHistogram, dailySummaries } =
    data;

  return (
    <div className="space-y-5">
      {/* Top Statistical Summary Strip */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-md p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Statistical Error Summary ({filters.startDate} to {filters.endDate})
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Calculated strictly on N = {kpis.matchedIntervalCount} valid matched intervals · Missing records are never replaced with zero
            </p>
          </div>
          <div className="text-xs font-mono text-slate-400">
            MAPE Denominator Guard: Actual &gt; {kpis.mapeMinActualMwThreshold} MW (
            {kpis.mapeExcludedCount} intervals excluded)
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono tabular-nums">
          <div className="bg-[#0B0F17] border border-slate-800/90 rounded p-3">
            <div className="text-[11px] text-slate-400">MAE (Mean Abs Error)</div>
            <div className="text-lg font-semibold text-cyan-300 mt-1">
              {formatMw(kpis.maeMw, 1)} MW
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              &Sigma;|Fc − Act| / {kpis.matchedIntervalCount}
            </div>
          </div>

          <div className="bg-[#0B0F17] border border-slate-800/90 rounded p-3">
            <div className="text-[11px] text-slate-400">RMSE (Root Mean Sq)</div>
            <div className="text-lg font-semibold text-amber-300 mt-1">
              {formatMw(kpis.rmseMw, 1)} MW
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              &radic;(&Sigma;(Fc − Act)&sup2; / N)
            </div>
          </div>

          <div className="bg-[#0B0F17] border border-slate-800/90 rounded p-3">
            <div className="text-[11px] text-slate-400">Mean Signed Bias</div>
            <div
              className={`text-lg font-semibold mt-1 ${
                kpis.biasMw >= 0 ? "text-amber-300" : "text-rose-300"
              }`}
            >
              {formatSignedMw(kpis.biasMw, 1)} MW
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {kpis.biasMw >= 0 ? "Net Overforecast" : "Net Underforecast"}
            </div>
          </div>

          <div className="bg-[#0B0F17] border border-slate-800/90 rounded p-3">
            <div className="text-[11px] text-slate-400">MAPE (%)</div>
            <div className="text-lg font-semibold text-slate-100 mt-1">
              {formatPct(kpis.mapePct)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              n = {kpis.mapeValidCount} valid intervals
            </div>
          </div>

          <div className="bg-[#0B0F17] border border-slate-800/90 rounded p-3">
            <div className="text-[11px] text-slate-400">P90 Absolute Error</div>
            <div className="text-lg font-semibold text-slate-100 mt-1">
              {formatMw(kpis.percentilesAbsMw.p90, 1)} MW
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              P95: {formatMw(kpis.percentilesAbsMw.p95, 1)} MW
            </div>
          </div>

          <div className="bg-[#0B0F17] border border-slate-800/90 rounded p-3">
            <div className="text-[11px] text-slate-400">Directional Split</div>
            <div className="text-sm font-semibold text-slate-100 mt-1.5">
              +{kpis.overforecastCount} / −{kpis.underforecastCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Over vs Under intervals
            </div>
          </div>
        </div>
      </div>

      {/* Cutoff Sensitivity Benchmark Matrix */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-md p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-100">
            Decision Cutoff Horizon Sensitivity Benchmark
          </h3>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Quantifies how forecast accuracy improves as the decision cutoff moves closer to delivery across Elexon&apos;s 8 daily WINDFOR runs
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 bg-[#0B0F17]/60">
                <th className="py-2.5 px-3 font-medium">Cutoff Rule Convention</th>
                <th className="py-2.5 px-3 font-medium">Market Interpretation</th>
                <th className="py-2.5 px-3 text-right font-medium">Avg Lead Time</th>
                <th className="py-2.5 px-3 text-right font-medium">MAE (MW)</th>
                <th className="py-2.5 px-3 text-right font-medium">RMSE (MW)</th>
                <th className="py-2.5 px-3 text-right font-medium">Signed Bias</th>
                <th className="py-2.5 px-3 text-right font-medium">MAPE (%)</th>
                <th className="py-2.5 px-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums">
              {cutoffComparison.map((row) => {
                const isCurrent = row.mode === filters.cutoffMode;
                return (
                  <tr
                    key={row.mode}
                    className={
                      isCurrent ? "bg-cyan-500/15" : "hover:bg-slate-800/40"
                    }
                  >
                    <td className="py-2.5 px-3 font-medium text-slate-100 whitespace-nowrap">
                      {row.label}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 font-sans text-xs">
                      {row.description}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {row.avgLeadTimeHours}h
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-cyan-300">
                      {formatMw(row.maeMw, 1)} MW
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-300">
                      {formatMw(row.rmseMw, 1)} MW
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200">
                      {formatSignedMw(row.biasMw, 1)} MW
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200">
                      {formatPct(row.mapePct)}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {isCurrent ? (
                        <span className="text-cyan-300 font-semibold">Active</span>
                      ) : (
                        <button
                          onClick={() => onChangeCutoff(row.mode)}
                          className="text-slate-300 hover:text-cyan-300 underline"
                        >
                          Apply Rule
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Two-Column Analytical Charts: Diurnal Error Profile + Error Distribution Histogram */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Diurnal Hour-of-Day Error Profile */}
        <div className="lg:col-span-6 bg-[#111726] border border-slate-800/90 rounded-md p-5">
          <h3 className="text-sm font-semibold text-slate-100">
            Diurnal Hour-of-Day Forecast Error Profile (Europe/London)
          </h3>
          <p className="text-xs text-slate-400 font-mono mt-0.5 mb-4">
            Mean Absolute Error (MAE) and RMSE by delivery hour across selected period
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={hourlyProfile}
                margin={{ top: 8, right: 16, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis
                  dataKey="hour"
                  stroke="#64748B"
                  tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#94A3B8" }}
                />
                <YAxis
                  stroke="#64748B"
                  tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#94A3B8" }}
                  width={44}
                />
                <ReferenceLine y={0} stroke="#475569" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0B0F17",
                    borderColor: "#334155",
                    fontSize: 11,
                    fontFamily: "IBM Plex Mono",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="rmseMw"
                  name="RMSE (MW)"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="maeMw"
                  name="MAE (MW)"
                  stroke="#22D3EE"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="biasMw"
                  name="Signed Bias (MW)"
                  stroke="#10B981"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Signed Error Distribution Histogram */}
        <div className="lg:col-span-6 bg-[#111726] border border-slate-800/90 rounded-md p-5">
          <h3 className="text-sm font-semibold text-slate-100">
            Signed Forecast Error Distribution (Forecast − Actual MW)
          </h3>
          <p className="text-xs text-slate-400 font-mono mt-0.5 mb-4">
            Frequency of 500 MW error buckets · Rose = Underforecast (−) · Amber = Overforecast (+)
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={errorHistogram}
                margin={{ top: 8, right: 16, left: 4, bottom: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis
                  dataKey="rangeLabel"
                  stroke="#64748B"
                  tick={{ fontSize: 9, fontFamily: "IBM Plex Mono", fill: "#94A3B8" }}
                  angle={-25}
                  textAnchor="end"
                  interval={1}
                />
                <YAxis
                  stroke="#64748B"
                  tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#94A3B8" }}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0B0F17",
                    borderColor: "#334155",
                    fontSize: 11,
                    fontFamily: "IBM Plex Mono",
                  }}
                />
                <Bar dataKey="count" name="Intervals" isAnimationActive={false}>
                  {errorHistogram.map((entry, idx) => (
                    <Cell
                      key={`hist-${idx}`}
                      fill={
                        entry.direction === "UNDERFORECAST" ? "#F43F5E" : "#F59E0B"
                      }
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Daily Accuracy Breakdown Table */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-md overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Daily Forecast Accuracy Breakdown ({dailySummaries.length} Delivery Days)
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Daily energy totals (MWh), average power (MW), MAE, RMSE, Signed Bias, and Maximum Deviation
            </p>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[420px]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#0B0F17] border-b border-slate-800 text-[11px] font-mono text-slate-400">
              <tr>
                <th className="py-2.5 px-3 font-medium">Delivery Date</th>
                <th className="py-2.5 px-3 text-right font-medium">Matched</th>
                <th className="py-2.5 px-3 text-right font-medium">Actual (MWh)</th>
                <th className="py-2.5 px-3 text-right font-medium">Forecast (MWh)</th>
                <th className="py-2.5 px-3 text-right font-medium">Avg Actual (MW)</th>
                <th className="py-2.5 px-3 text-right font-medium">MAE (MW)</th>
                <th className="py-2.5 px-3 text-right font-medium">RMSE (MW)</th>
                <th className="py-2.5 px-3 text-right font-medium">Signed Bias</th>
                <th className="py-2.5 px-3 text-right font-medium">Max |Error|</th>
                <th className="py-2.5 px-3 text-right font-medium">MAPE (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums">
              {dailySummaries.map((d) => (
                <tr key={d.date} className="hover:bg-slate-800/40">
                  <td className="py-2 px-3 font-medium text-slate-100 whitespace-nowrap">
                    {d.date} ({formatShortDate(d.date)})
                  </td>
                  <td className="py-2 px-3 text-right text-slate-300">
                    {d.matchedIntervals}/{d.totalHalfHours}
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-300">
                    {formatMwh(d.actualEnergyMwh)}
                  </td>
                  <td className="py-2 px-3 text-right text-cyan-300">
                    {formatMwh(d.forecastEnergyMwh)}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-300">
                    {formatMw(d.actualAvgMw)}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-slate-100">
                    {formatMw(d.maeMw, 1)}
                  </td>
                  <td className="py-2 px-3 text-right text-amber-300">
                    {formatMw(d.rmseMw, 1)}
                  </td>
                  <td
                    className={`py-2 px-3 text-right ${
                      d.biasMw >= 0 ? "text-amber-300" : "text-rose-300"
                    }`}
                  >
                    {formatSignedMw(d.biasMw, 1)}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-200">
                    {formatMw(d.maxAbsErrorMw)} MW
                  </td>
                  <td className="py-2 px-3 text-right text-slate-300">
                    {formatPct(d.mapePct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
