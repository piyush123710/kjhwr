import React, { useEffect, useState } from "react";
import { X, CheckCircle2, Clock, ShieldAlert } from "lucide-react";
import {
  CutoffMode,
  AlignmentMode,
  VintageAuditResponse,
} from "../types/analytics";
import { fetchIntervalVintages } from "../services/api";
import {
  formatMw,
  formatSignedMw,
  formatCutoffLabel,
} from "../lib/formatters";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface VintageAuditModalProps {
  startTime: string | null;
  cutoffMode: CutoffMode;
  alignmentMode: AlignmentMode;
  onClose: () => void;
}

export const VintageAuditModal: React.FC<VintageAuditModalProps> = ({
  startTime,
  cutoffMode,
  alignmentMode,
  onClose,
}) => {
  const [audit, setAudit] = useState<VintageAuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!startTime) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchIntervalVintages(startTime, cutoffMode, alignmentMode, ctrl.signal)
      .then((res) => {
        setAudit(res);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load forecast vintage history");
          setLoading(false);
        }
      });
    return () => ctrl.abort();
  }, [startTime, cutoffMode, alignmentMode]);

  if (!startTime) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Forecast Vintage Decision-Time Audit"
    >
      <div className="bg-[#0E131F] border-l border-slate-800 w-full max-w-3xl h-full flex flex-col justify-between overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-cyan-400">
              Historical Decision-Time Vintage Audit
            </div>
            <h2 className="text-base font-semibold text-slate-100 mt-0.5">
              Delivery Target: {audit?.startTimeLondon || startTime}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close audit panel"
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {loading && (
            <div className="text-xs font-mono text-slate-400 py-12 text-center">
              Retrieving chronological WINDFOR publication runs from Elexon BMRS...
            </div>
          )}

          {error && (
            <div className="bg-red-950/30 border border-red-900/60 rounded p-4 text-xs text-red-300 font-mono">
              {error}
            </div>
          )}

          {audit && !loading && (
            <>
              {/* Audit Rule Summary Box */}
              <div className="bg-[#111726] border border-slate-800 rounded-md p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs tabular-nums">
                <div>
                  <div className="text-slate-400 text-[11px]">
                    Actual Wind Generation (FUELHH)
                  </div>
                  <div className="text-lg font-semibold text-emerald-300 mt-1">
                    {formatMw(audit.actualMw)} MW
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[11px]">
                    Procurement Decision Cutoff
                  </div>
                  <div className="text-sm font-semibold text-amber-300 mt-1">
                    {audit.cutoffTimeLondon}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {formatCutoffLabel(audit.cutoffMode)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[11px]">
                    Selected Eligible Publication
                  </div>
                  <div className="text-sm font-semibold text-cyan-300 mt-1">
                    {audit.selectedPublishTime
                      ? audit.vintages.find((v) => v.isSelected)?.publishTimeLondon
                      : "None <= Cutoff"}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {audit.vintages.filter((v) => v.eligibleBeforeCutoff).length} eligible /{" "}
                    {audit.vintages.length} total runs
                  </div>
                </div>
              </div>

              {/* Vintage Trajectory Chart */}
              {audit.vintages.length > 0 && (
                <div className="bg-[#111726] border border-slate-800 rounded-md p-4">
                  <div className="text-xs font-medium text-slate-200 mb-3">
                    Forecast Evolution Across Elexon Publication Runs (MW)
                  </div>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={audit.vintages}
                        margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#1E293B"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="publishTimeLondon"
                          stroke="#64748B"
                          tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#94A3B8" }}
                          tickFormatter={(v) => v.slice(5, 16)}
                        />
                        <YAxis
                          stroke="#64748B"
                          tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#94A3B8" }}
                          domain={["auto", "auto"]}
                          width={48}
                        />
                        {audit.actualMw !== null && (
                          <ReferenceLine
                            y={audit.actualMw}
                            stroke="#10B981"
                            strokeDasharray="3 3"
                            label={{
                              value: `Actual: ${formatMw(audit.actualMw)} MW`,
                              fill: "#10B981",
                              fontSize: 10,
                              position: "insideTopLeft",
                            }}
                          />
                        )}
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
                          dataKey="generationMw"
                          name="Forecast MW"
                          stroke="#22D3EE"
                          strokeWidth={2}
                          dot={(props: any) => {
                            const { cx, cy, payload } = props;
                            if (payload.isSelected) {
                              return (
                                <circle
                                  key={payload.publishTime}
                                  cx={cx}
                                  cy={cy}
                                  r={5}
                                  fill="#22D3EE"
                                  stroke="#0B0F17"
                                  strokeWidth={2}
                                />
                              );
                            }
                            return (
                              <circle
                                key={payload.publishTime}
                                cx={cx}
                                cy={cy}
                                r={3}
                                fill={payload.eligibleBeforeCutoff ? "#38BDF8" : "#64748B"}
                              />
                            );
                          }}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Chronological Vintage Table */}
              <div className="bg-[#111726] border border-slate-800 rounded-md overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    All WINDFOR Publication Vintages for {audit.lookupForecastHour}
                  </span>
                  <span className="font-mono text-slate-400">
                    Latest publishTime &le; cutoff is selected
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 bg-[#0B0F17]/60">
                        <th className="py-2 px-3 font-medium">Publish Time (London)</th>
                        <th className="py-2 px-3 text-right font-medium">Lead Time</th>
                        <th className="py-2 px-3 text-right font-medium">Forecast (MW)</th>
                        <th className="py-2 px-3 text-right font-medium">Signed Error</th>
                        <th className="py-2 px-3 font-medium">Cutoff Eligibility Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums">
                      {audit.vintages.map((v) => (
                        <tr
                          key={v.publishTime}
                          className={
                            v.isSelected
                              ? "bg-cyan-500/15"
                              : !v.eligibleBeforeCutoff
                              ? "opacity-60 bg-[#0B0F17]/40"
                              : ""
                          }
                        >
                          <td className="py-2 px-3 text-slate-200 whitespace-nowrap">
                            {v.publishTimeLondon}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-300">
                            {v.leadTimeHours}h
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-slate-100">
                            {formatMw(v.generationMw)} MW
                          </td>
                          <td
                            className={`py-2 px-3 text-right ${
                              (v.signedErrorMw ?? 0) > 0
                                ? "text-amber-300"
                                : "text-rose-300"
                            }`}
                          >
                            {formatSignedMw(v.signedErrorMw)} MW
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            {v.isSelected ? (
                              <span className="inline-flex items-center gap-1.5 text-cyan-300 font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                                SELECTED (Latest &le; Cutoff)
                              </span>
                            ) : v.eligibleBeforeCutoff ? (
                              <span className="inline-flex items-center gap-1.5 text-slate-400">
                                <Clock className="w-3.5 h-3.5 text-slate-500" />
                                Eligible (Superseded before cutoff)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-amber-400/90">
                                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                                Excluded (Published after cutoff)
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-[#0B0F17] flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>Audit Rule: publishTime &le; cutoffTimeUtc</span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
};
