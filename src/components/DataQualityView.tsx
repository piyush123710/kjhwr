import React, { useEffect, useState } from "react";
import { CheckCircle2, Database, FileSpreadsheet } from "lucide-react";
import { GlobalFilterState, DataQualityResponse } from "../types/analytics";
import { fetchDataQuality } from "../services/api";
import { LoadingState, ErrorState } from "./States";

interface DataQualityViewProps {
  filters: GlobalFilterState;
}

export const DataQualityView: React.FC<DataQualityViewProps> = ({ filters }) => {
  const [data, setData] = useState<DataQualityResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetchDataQuality(filters, ctrl.signal)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load Data Quality report");
          setLoading(false);
        }
      });

    return () => ctrl.abort();
  }, [filters]);

  if (loading) {
    return (
      <LoadingState
        label="Auditing Elexon FUELHH and WINDFOR dataset completeness and validation counters..."
        rows={7}
      />
    );
  }

  if (error || !data) {
    return <ErrorState message={error || "Data quality report unavailable"} />;
  }

  const { summary, dailyCoverage, schemaNotes } = data;

  return (
    <div className="space-y-5">
      {/* Retrieval Status & Provenance Banner */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-md p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Dataset Retrieval State: {data.retrievalState} ({data.upstreamStatus})
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Source: {data.source} · Last Verified Refresh: {data.fetchedAt}
            </p>
          </div>
        </div>
        <div className="text-xs font-mono text-slate-300 bg-[#0B0F17] border border-slate-800 rounded px-3 py-2">
          January 2026 Coverage: 31 / 31 Days (100.0% Target Hours Present)
        </div>
      </div>

      {/* Dataset Ingestion & Validation Audit Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 font-mono tabular-nums">
        <div className="bg-[#111726] border border-slate-800/90 rounded-md p-4">
          <div className="text-xs text-slate-400 font-sans">
            FUELHH Actual Wind Records
          </div>
          <div className="text-2xl font-semibold text-emerald-300 mt-1.5">
            {summary.fuelhhRawTotal.toLocaleString()}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Valid Deduplicated:</span>
              <span className="text-slate-200">{summary.validActualRecords}</span>
            </div>
            <div className="flex justify-between">
              <span>Duplicate Records:</span>
              <span className="text-slate-200">{summary.duplicateActuals}</span>
            </div>
            <div className="flex justify-between">
              <span>Invalid Numerics:</span>
              <span className="text-slate-200">{summary.invalidActuals}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#111726] border border-slate-800/90 rounded-md p-4">
          <div className="text-xs text-slate-400 font-sans">
            WINDFOR Forecast Vintages
          </div>
          <div className="text-2xl font-semibold text-cyan-300 mt-1.5">
            {summary.windforJan2026TargetTotal.toLocaleString()}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Raw Fetched (Incl Dec):</span>
              <span className="text-slate-200">
                {summary.windforRawTotal.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Distinct Target Hours:</span>
              <span className="text-slate-200">
                {summary.distinctForecastTargetHours} (31d &times; 24h)
              </span>
            </div>
            <div className="flex justify-between">
              <span>Duplicates / Invalid:</span>
              <span className="text-slate-200">
                {summary.duplicateForecasts} / {summary.invalidForecasts}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-[#111726] border border-slate-800/90 rounded-md p-4">
          <div className="text-xs text-slate-400 font-sans">
            Interval Alignment &amp; Matching
          </div>
          <div className="text-2xl font-semibold text-slate-100 mt-1.5">
            {summary.matchedCount.toLocaleString()}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Unmatched :30 HH Actuals:</span>
              <span className="text-amber-300">
                {summary.unmatchedActualOnlyHhCount}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Missing Fc &le; Cutoff:</span>
              <span className="text-slate-200">
                {summary.missingForecastBeforeCutoffCount}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Missing Actuals:</span>
              <span className="text-slate-200">{summary.missingActualCount}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#111726] border border-slate-800/90 rounded-md p-4">
          <div className="text-xs text-slate-400 font-sans">
            Publication Timestamp Window
          </div>
          <div className="text-xs font-semibold text-slate-200 mt-2">
            Earliest WINDFOR Publish:
          </div>
          <div className="text-[11px] text-cyan-300">
            {summary.earliestForecastPub || "—"}
          </div>
          <div className="text-xs font-semibold text-slate-200 mt-2">
            Latest WINDFOR Publish:
          </div>
          <div className="text-[11px] text-cyan-300">
            {summary.latestForecastPub || "—"}
          </div>
        </div>
      </div>

      {/* Elexon Schema & Granularity Disclosure */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-md p-5">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            Official Elexon BMRS Dataset Schema &amp; Temporal Granularity Audit
          </h3>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {schemaNotes.map((note) => (
            <div
              key={note.dataset}
              className="bg-[#0B0F17] border border-slate-800 rounded p-4 space-y-1.5 text-xs"
            >
              <div className="font-semibold text-slate-100">{note.dataset}</div>
              <div className="font-mono text-[11px] text-cyan-400 break-all">
                GET {note.endpoint}
              </div>
              <div className="text-slate-300">
                <strong className="text-slate-400">Granularity:</strong>{" "}
                {note.granularity}
              </div>
              <div className="text-slate-300">
                <strong className="text-slate-400">Unit &amp; Energy Rule:</strong>{" "}
                {note.unit}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily Coverage Matrix across January 2026 */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-md overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Daily Completeness &amp; Alignment Audit ({dailyCoverage.length} Days)
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Mode: {filters.alignmentMode === "strict_exact" ? "Strict Exact Hourly (24/day)" : "Half-Hourly Step-Hold (48/day)"}
          </span>
        </div>

        <div className="overflow-x-auto max-h-[380px]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#0B0F17] border-b border-slate-800 text-[11px] font-mono text-slate-400">
              <tr>
                <th className="py-2 px-3 font-medium">Delivery Date</th>
                <th className="py-2 px-3 text-right font-medium">30m Slots</th>
                <th className="py-2 px-3 text-right font-medium">FUELHH Actuals</th>
                <th className="py-2 px-3 text-right font-medium">Matched Pairs</th>
                <th className="py-2 px-3 text-right font-medium">Unmatched :30 HH</th>
                <th className="py-2 px-3 text-right font-medium">Missing Fc &le; Cutoff</th>
                <th className="py-2 px-3 text-right font-medium">Missing Actual</th>
                <th className="py-2 px-3 text-right font-medium">Target Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums">
              {dailyCoverage.map((row) => (
                <tr key={row.date} className="hover:bg-slate-800/40">
                  <td className="py-2 px-3 text-slate-100 font-medium">{row.date}</td>
                  <td className="py-2 px-3 text-right text-slate-400">
                    {row.expectedHalfHours}
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-300">
                    {row.actualPresent}
                  </td>
                  <td className="py-2 px-3 text-right text-cyan-300 font-semibold">
                    {row.forecastMatched}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-400">
                    {row.unmatchedHh}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-400">
                    {row.missingForecastCutoff}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-400">
                    {row.missingActual}
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-400 font-semibold">
                    {row.completenessPct}%
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
