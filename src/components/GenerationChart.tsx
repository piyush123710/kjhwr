import React, { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from "recharts";
import { IntervalAnalysisRow } from "../types/analytics";
import { formatMw, formatSignedMw, formatShortDate } from "../lib/formatters";

interface GenerationChartProps {
  data: IntervalAnalysisRow[];
  cutoffLabel: string;
  onSelectInterval?: (row: IntervalAnalysisRow) => void;
}

type WindowSlice = "ALL" | "FIRST_72H" | "PEAK_DEVIATION_72H";

export const GenerationChart: React.FC<GenerationChartProps> = ({
  data,
  cutoffLabel,
  onSelectInterval,
}) => {
  const [windowSlice, setWindowSlice] = useState<WindowSlice>("ALL");
  const [showErrorBand, setShowErrorBand] = useState<boolean>(true);

  const slicedData = useMemo(() => {
    if (data.length === 0) return [];
    if (windowSlice === "FIRST_72H") {
      return data.slice(0, Math.min(data.length, 72));
    }
    if (windowSlice === "PEAK_DEVIATION_72H") {
      let maxIdx = 0;
      let maxErr = -1;
      data.forEach((r, idx) => {
        if ((r.absErrorMw ?? 0) > maxErr) {
          maxErr = r.absErrorMw ?? 0;
          maxIdx = idx;
        }
      });
      const half = 36;
      const start = Math.max(0, maxIdx - half);
      return data.slice(start, Math.min(data.length, start + 72));
    }
    return data;
  }, [data, windowSlice]);

  const formatXAxis = (ts: string) => {
    const row = data.find((d) => d.startTime === ts);
    if (!row) return ts;
    return `${formatShortDate(row.deliveryDate)} ${row.deliveryTimeLondon}`;
  };

  return (
    <div className="bg-[#111726] border border-slate-800/90 rounded-md p-5">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            Actual vs. Cutoff-Eligible Day-Ahead Wind Generation (MW)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">
            Active Rule: {cutoffLabel} · Timezone: Europe/London · Click any interval point to audit forecast vintages
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Legend */}
          <div className="flex items-center gap-4 text-xs font-mono mr-2">
            <span className="flex items-center gap-1.5 text-emerald-300">
              <span className="w-3 h-0.5 bg-emerald-400 inline-block" />
              Actual (FUELHH MW)
            </span>
            <span className="flex items-center gap-1.5 text-cyan-300">
              <span className="w-3 h-0.5 bg-cyan-400 inline-block border-b border-dashed border-cyan-300" />
              Selected Forecast (WINDFOR MW)
            </span>
            {showErrorBand && (
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="w-2.5 h-2.5 bg-amber-500/25 border border-amber-400/50 inline-block rounded-xs" />
                Signed Error (MW)
              </span>
            )}
          </div>

          {/* Toggle Error Overlay */}
          <button
            type="button"
            onClick={() => setShowErrorBand((v) => !v)}
            className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors whitespace-nowrap ${
              showErrorBand
                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                : "bg-[#0B0F17] text-slate-400 border-slate-800 hover:text-slate-200"
            }`}
          >
            {showErrorBand ? "Hide Error Overlay" : "Show Error Overlay"}
          </button>

          {/* Time Window Slice Buttons */}
          <div className="flex items-center gap-1 bg-[#0B0F17] p-0.5 rounded border border-slate-800">
            <button
              type="button"
              onClick={() => setWindowSlice("ALL")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                windowSlice === "ALL"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              All Selected ({data.length})
            </button>
            <button
              type="button"
              onClick={() => setWindowSlice("FIRST_72H")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                windowSlice === "FIRST_72H"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              First 72 Intervals
            </button>
            <button
              type="button"
              onClick={() => setWindowSlice("PEAK_DEVIATION_72H")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                windowSlice === "PEAK_DEVIATION_72H"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              Peak Error Window
            </button>
          </div>
        </div>
      </div>

      {/* Main Chart Canvas */}
      <div className="h-[370px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={slicedData}
            margin={{ top: 10, right: 16, left: 8, bottom: 8 }}
            onClick={(state: any) => {
              if (
                onSelectInterval &&
                state &&
                state.activePayload &&
                state.activePayload.length > 0
              ) {
                const row = state.activePayload[0].payload as IntervalAnalysisRow;
                onSelectInterval(row);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
            <XAxis
              dataKey="startTime"
              tickFormatter={formatXAxis}
              stroke="#64748B"
              tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#94A3B8" }}
              minTickGap={48}
            />
            <YAxis
              stroke="#64748B"
              tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#94A3B8" }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              width={48}
              label={{
                value: "Generation (MW)",
                angle: -90,
                position: "insideLeft",
                style: { fill: "#64748B", fontSize: 11, fontFamily: "IBM Plex Mono" },
              }}
            />
            <ReferenceLine y={0} stroke="#334155" />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const row = payload[0].payload as IntervalAnalysisRow;
                const isOver = (row.signedErrorMw ?? 0) > 0;
                return (
                  <div className="bg-[#0B0F17] border border-slate-700 rounded-md p-3 shadow-2xl text-xs font-mono min-w-[270px]">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
                      <span className="text-slate-100 font-semibold">
                        {row.startTimeLondon}
                      </span>
                      <span className="text-slate-400">SP {row.settlementPeriod}</span>
                    </div>
                    <div className="space-y-1.5 tabular-nums">
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-400">Actual Generation:</span>
                        <span className="text-slate-100 font-semibold">
                          {formatMw(row.actualMw)} MW
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-cyan-400">Selected Forecast:</span>
                        <span className="text-slate-100 font-semibold">
                          {formatMw(row.forecastMw)} MW
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                        <span className="text-slate-400">
                          Signed Error (Fc − Act):
                        </span>
                        <span
                          className={`font-semibold ${
                            row.signedErrorMw === null
                              ? "text-slate-400"
                              : isOver
                              ? "text-amber-300"
                              : "text-rose-300"
                          }`}
                        >
                          {formatSignedMw(row.signedErrorMw)} MW{" "}
                          {row.signedErrorMw !== null
                            ? isOver
                              ? "(Over)"
                              : "(Under)"
                            : ""}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Absolute Error:</span>
                        <span className="text-slate-200">
                          {formatMw(row.absErrorMw)} MW ({row.pctError ?? "—"}%)
                        </span>
                      </div>
                      <div className="pt-1.5 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-0.5">
                        <div className="flex justify-between">
                          <span>Forecast Published:</span>
                          <span className="text-slate-300">
                            {row.publishTimeLondon || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Decision Cutoff:</span>
                          <span className="text-slate-300">{row.cutoffTimeLondon}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Lead Horizon:</span>
                          <span className="text-cyan-300">
                            {row.leadTimeHours !== null ? `${row.leadTimeHours}h` : "—"} (
                            {row.vintageCountEligible}/{row.vintageCountTotal} eligible runs)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            {showErrorBand && (
              <Area
                type="monotone"
                dataKey="signedErrorMw"
                name="Signed Error (MW)"
                fill="#F59E0B"
                fillOpacity={0.14}
                stroke="#F59E0B"
                strokeWidth={1}
                isAnimationActive={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="actualMw"
              name="Actual Wind (MW)"
              stroke="#10B981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#10B981" }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="forecastMw"
              name="Selected Forecast (MW)"
              stroke="#22D3EE"
              strokeWidth={1.75}
              strokeDasharray="4 2"
              dot={false}
              activeDot={{ r: 4, fill: "#22D3EE" }}
              isAnimationActive={false}
            />
            {slicedData.length > 48 && (
              <Brush
                dataKey="startTime"
                height={22}
                stroke="#334155"
                fill="#0B0F17"
                tickFormatter={() => ""}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
