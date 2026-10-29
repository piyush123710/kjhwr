import React, { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { IntervalAnalysisRow, KPISummary } from "../types/analytics";
import { formatMw, formatSignedMw, formatShortDate } from "../lib/formatters";
import { ArrowUpRight } from "lucide-react";

interface ErrorChartProps {
  timeSeries: IntervalAnalysisRow[];
  highestErrorIntervals: IntervalAnalysisRow[];
  kpis: KPISummary;
  onInspectInterval: (row: IntervalAnalysisRow) => void;
}

export const ErrorChart: React.FC<ErrorChartProps> = ({
  timeSeries,
  highestErrorIntervals,
  kpis,
  onInspectInterval,
}) => {
  const [mode, setMode] = useState<"SIGNED" | "ABSOLUTE">("SIGNED");

  const formatXAxis = (ts: string) => {
    const row = timeSeries.find((d) => d.startTime === ts);
    if (!row) return ts;
    return `${formatShortDate(row.deliveryDate)} ${row.deliveryTimeLondon}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left 7 Columns: Error Time-Series + Percentile Distribution */}
      <div className="lg:col-span-7 bg-[#111726] border border-slate-800/90 rounded-md p-5 flex flex-col justify-between">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Forecast Error Trajectory ({mode === "SIGNED" ? "Signed: Forecast − Actual" : "Absolute: |Forecast − Actual|"})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Positive (+) = Overforecast · Negative (−) = Underforecast · Scope: Wind Generation Error Only
              </p>
            </div>

            <div className="flex items-center gap-1 bg-[#0B0F17] p-0.5 rounded border border-slate-800">
              <button
                type="button"
                onClick={() => setMode("SIGNED")}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                  mode === "SIGNED"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                Signed Error (MW)
              </button>
              <button
                type="button"
                onClick={() => setMode("ABSOLUTE")}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                  mode === "ABSOLUTE"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                Absolute Error (MW)
              </button>
            </div>
          </div>

          <div className="h-[245px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={timeSeries}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                onClick={(state: any) => {
                  if (
                    state &&
                    state.activePayload &&
                    state.activePayload.length > 0
                  ) {
                    onInspectInterval(
                      state.activePayload[0].payload as IntervalAnalysisRow
                    );
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis
                  dataKey="startTime"
                  tickFormatter={formatXAxis}
                  stroke="#64748B"
                  tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#94A3B8" }}
                  minTickGap={48}
                />
                <YAxis
                  stroke="#64748B"
                  tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#94A3B8" }}
                  width={46}
                />
                <ReferenceLine y={0} stroke="#475569" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0].payload as IntervalAnalysisRow;
                    return (
                      <div className="bg-[#0B0F17] border border-slate-700 rounded p-2.5 shadow-xl text-xs font-mono tabular-nums">
                        <div className="text-slate-200 font-semibold mb-1">
                          {row.startTimeLondon} (SP {row.settlementPeriod})
                        </div>
                        <div className="text-slate-300">
                          Signed Error:{" "}
                          <span
                            className={
                              (row.signedErrorMw ?? 0) >= 0
                                ? "text-amber-300 font-semibold"
                                : "text-rose-300 font-semibold"
                            }
                          >
                            {formatSignedMw(row.signedErrorMw, 1)} MW
                          </span>
                        </div>
                        <div className="text-slate-300">
                          Absolute Error: {formatMw(row.absErrorMw, 1)} MW
                        </div>
                        <div className="text-slate-400 text-[11px] mt-1">
                          Actual: {formatMw(row.actualMw)} MW · Forecast:{" "}
                          {formatMw(row.forecastMw)} MW
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey={mode === "SIGNED" ? "signedErrorMw" : "absErrorMw"}
                  isAnimationActive={false}
                >
                  {timeSeries.map((entry, idx) => {
                    const val = entry.signedErrorMw ?? 0;
                    const fill =
                      mode === "ABSOLUTE"
                        ? "#38BDF8"
                        : val >= 0
                        ? "#F59E0B"
                        : "#F43F5E";
                    return <Cell key={`cell-${idx}`} fill={fill} fillOpacity={0.85} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Signed Error Percentile Summary Strip */}
        <div className="mt-4 pt-3.5 border-t border-slate-800/90">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
            <span>Signed Error Percentile Distribution (Forecast − Actual MW)</span>
            <span className="font-mono">
              Overforecast: {kpis.overforecastCount} intervals · Underforecast:{" "}
              {kpis.underforecastCount} intervals
            </span>
          </div>
          <div className="grid grid-cols-6 gap-2 bg-[#0B0F17] border border-slate-800/80 rounded p-2.5 text-center font-mono tabular-nums">
            <div>
              <div className="text-[10px] text-slate-500">P05 (Under)</div>
              <div className="text-xs font-semibold text-rose-300 mt-0.5">
                {formatSignedMw(kpis.percentilesSignedMw.p05)} MW
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">P25</div>
              <div className="text-xs font-semibold text-slate-200 mt-0.5">
                {formatSignedMw(kpis.percentilesSignedMw.p25)} MW
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">P50 (Median)</div>
              <div className="text-xs font-semibold text-cyan-300 mt-0.5">
                {formatSignedMw(kpis.percentilesSignedMw.p50)} MW
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Mean Bias</div>
              <div className="text-xs font-semibold text-slate-100 mt-0.5">
                {formatSignedMw(kpis.biasMw, 1)} MW
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">P75</div>
              <div className="text-xs font-semibold text-slate-200 mt-0.5">
                {formatSignedMw(kpis.percentilesSignedMw.p75)} MW
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">P95 (Over)</div>
              <div className="text-xs font-semibold text-amber-300 mt-0.5">
                {formatSignedMw(kpis.percentilesSignedMw.p95)} MW
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right 5 Columns: Highest-Error Intervals Table */}
      <div className="lg:col-span-5 bg-[#111726] border border-slate-800/90 rounded-md p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Largest Observed Forecast Deviations
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Ranked by |Forecast − Actual| MW · Click row to audit vintages
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400">
                  <th className="py-2 pr-2 font-medium">Delivery (London)</th>
                  <th className="py-2 px-2 text-right font-medium">Actual</th>
                  <th className="py-2 px-2 text-right font-medium">Forecast</th>
                  <th className="py-2 px-2 text-right font-medium">Signed Err</th>
                  <th className="py-2 pl-2 text-right font-medium">|Error|</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums">
                {highestErrorIntervals.slice(0, 8).map((row) => {
                  const isOver = (row.signedErrorMw ?? 0) > 0;
                  return (
                    <tr
                      key={row.startTime}
                      onClick={() => onInspectInterval(row)}
                      className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                    >
                      <td className="py-2 pr-2 text-slate-200 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span>
                            {formatShortDate(row.deliveryDate)} {row.deliveryTimeLondon}
                          </span>
                          <ArrowUpRight className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right text-slate-300">
                        {formatMw(row.actualMw)}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-300">
                        {formatMw(row.forecastMw)}
                      </td>
                      <td
                        className={`py-2 px-2 text-right font-medium ${
                          isOver ? "text-amber-300" : "text-rose-300"
                        }`}
                      >
                        {formatSignedMw(row.signedErrorMw)}
                      </td>
                      <td className="py-2 pl-2 text-right font-semibold text-slate-100">
                        {formatMw(row.absErrorMw)} MW
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
          Note: Overforecast (+) indicates forecast wind exceeded actual generation; underforecast (−) indicates actual wind exceeded forecast. System procurement volume depends on demand and non-wind plant availability outside this dataset&apos;s scope.
        </div>
      </div>
    </div>
  );
};
