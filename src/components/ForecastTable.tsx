import React, { useEffect, useState } from "react";
import {
  Search,
  Download,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  History,
} from "lucide-react";
import {
  GlobalFilterState,
  IntervalAnalysisRow,
  ForecastsResponse,
} from "../types/analytics";
import { fetchForecasts } from "../services/api";
import {
  formatMw,
  formatSignedMw,
  exportIntervalsToCsv,
} from "../lib/formatters";
import { LoadingState, ErrorState, EmptyState } from "./States";

interface ForecastTableProps {
  filters: GlobalFilterState;
  onInspectInterval: (row: IntervalAnalysisRow) => void;
}

export const ForecastTable: React.FC<ForecastTableProps> = ({
  filters,
  onInspectInterval,
}) => {
  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("MATCHED");
  const [timeWindow, setTimeWindow] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("startTime");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(48);

  const [data, setData] = useState<ForecastsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [
    filters.startDate,
    filters.endDate,
    filters.cutoffMode,
    filters.alignmentMode,
    deliveryDate,
    statusFilter,
    timeWindow,
    search,
    sortBy,
    sortDir,
    pageSize,
  ]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetchForecasts(
      {
        startDate: filters.startDate,
        endDate: filters.endDate,
        deliveryDate: deliveryDate || undefined,
        cutoffMode: filters.cutoffMode,
        alignmentMode: filters.alignmentMode,
        mapeThreshold: filters.mapeThreshold,
        status: statusFilter,
        timeWindow,
        search,
        sortBy,
        sortDir,
        page,
        pageSize,
      },
      ctrl.signal
    )
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load Forecast Explorer intervals");
          setLoading(false);
        }
      });

    return () => ctrl.abort();
  }, [
    filters,
    deliveryDate,
    statusFilter,
    timeWindow,
    search,
    sortBy,
    sortDir,
    page,
    pageSize,
  ]);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir(col === "startTime" ? "asc" : "desc");
    }
  };

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const fullRes = await fetchForecasts({
        startDate: filters.startDate,
        endDate: filters.endDate,
        deliveryDate: deliveryDate || undefined,
        cutoffMode: filters.cutoffMode,
        alignmentMode: filters.alignmentMode,
        mapeThreshold: filters.mapeThreshold,
        status: statusFilter,
        timeWindow,
        search,
        sortBy,
        sortDir,
        page: 1,
        pageSize: 2000,
      });
      exportIntervalsToCsv(
        fullRes.items,
        `windsight_explorer_${deliveryDate || `${filters.startDate}_to_${filters.endDate}`}_${filters.cutoffMode}.csv`
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Explorer Filter Toolbar */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-md p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              30-Minute Delivery Interval Explorer
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Inspect matched actuals, cutoff-selected forecasts, lead times, and signed errors in Europe/London time
            </p>
          </div>

          <button
            onClick={handleExportCsv}
            disabled={exporting || !data || data.totalCount === 0}
            className="px-3.5 py-1.5 text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 disabled:opacity-40 text-cyan-300 border border-cyan-500/30 rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {exporting
                ? "Exporting CSV..."
                : `Export Filtered CSV (${data?.totalCount ?? 0} rows)`}
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-800/80 text-xs">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search date, time (14:00), or SP..."
              className="w-full bg-[#0B0F17] border border-slate-700/90 rounded pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>

          {/* Specific Single Delivery Date Filter */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 whitespace-nowrap">Single Day:</span>
            <input
              type="date"
              min="2026-01-01"
              max="2026-01-31"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="flex-1 bg-[#0B0F17] border border-slate-700/90 rounded px-2 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
            />
            {deliveryDate && (
              <button
                onClick={() => setDeliveryDate("")}
                className="text-[11px] text-cyan-400 hover:underline whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>

          {/* Time Window Filter */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 whitespace-nowrap">Time Block:</span>
            <select
              value={timeWindow}
              onChange={(e) => setTimeWindow(e.target.value)}
              className="flex-1 bg-[#0B0F17] border border-slate-700/90 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="ALL">All 24 Hours (00:00–23:30)</option>
              <option value="NIGHT_00_06">Overnight (00:00–05:30)</option>
              <option value="MORNING_06_12">Morning Ramp (06:00–11:30)</option>
              <option value="AFTERNOON_12_18">Afternoon (12:00–17:30)</option>
              <option value="EVENING_PEAK_16_20">UK Peak (16:00–19:30)</option>
              <option value="EVENING_18_24">Evening (18:00–23:30)</option>
            </select>
          </div>

          {/* Record Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 whitespace-nowrap">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 bg-[#0B0F17] border border-slate-700/90 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="MATCHED">Matched Intervals Only</option>
              <option value="ALL">All 30-Min Slots (Incl. Unmatched HH)</option>
              <option value="OVERFORECAST">Overforecast Only (+ Error)</option>
              <option value="UNDERFORECAST">Underforecast Only (− Error)</option>
              <option value="UNMATCHED">Unmatched / Actual-Only HH</option>
            </select>
          </div>

          {/* Sort Preset */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 whitespace-nowrap">Sort By:</span>
            <select
              value={`${sortBy}:${sortDir}`}
              onChange={(e) => {
                const [col, dir] = e.target.value.split(":");
                setSortBy(col);
                setSortDir(dir as "asc" | "desc");
              }}
              className="flex-1 bg-[#0B0F17] border border-slate-700/90 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="startTime:asc">Chronological (Oldest First)</option>
              <option value="startTime:desc">Chronological (Newest First)</option>
              <option value="absErrorMw:desc">Largest |Error| Magnitude</option>
              <option value="signedErrorMw:desc">Highest Overforecast (+)</option>
              <option value="signedErrorMw:asc">Deepest Underforecast (−)</option>
              <option value="actualMw:desc">Highest Actual Wind (MW)</option>
            </select>
          </div>
        </div>
      </div>

      {/* States */}
      {loading && <LoadingState label="Filtering 30-minute delivery intervals..." rows={8} />}
      {error && <ErrorState message={error} />}
      {!loading && !error && data && data.items.length === 0 && (
        <EmptyState
          description="No 30-minute delivery intervals match the current date, time-window, or status filters."
          actionLabel="Reset Explorer Filters"
          onAction={() => {
            setDeliveryDate("");
            setStatusFilter("ALL");
            setTimeWindow("ALL");
            setSearch("");
          }}
        />
      )}

      {/* High-Density Data Table */}
      {!loading && !error && data && data.items.length > 0 && (
        <div className="bg-[#111726] border border-slate-800/90 rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-[#0B0F17]/70 text-[11px] font-mono text-slate-400">
                  <th className="py-2.5 px-3 font-medium">
                    <button
                      onClick={() => toggleSort("startTime")}
                      className="flex items-center gap-1 hover:text-slate-200"
                    >
                      <span>Delivery Date &amp; Interval (London)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 font-medium text-right">SP</th>
                  <th className="py-2.5 px-3 font-medium text-right">
                    <button
                      onClick={() => toggleSort("actualMw")}
                      className="inline-flex items-center gap-1 hover:text-slate-200"
                    >
                      <span>Actual (MW)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 font-medium text-right">
                    <button
                      onClick={() => toggleSort("forecastMw")}
                      className="inline-flex items-center gap-1 hover:text-slate-200"
                    >
                      <span>Forecast (MW)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 font-medium">
                    Forecast Publish Time (London)
                  </th>
                  <th className="py-2.5 px-2.5 font-medium text-right">
                    <button
                      onClick={() => toggleSort("leadTimeHours")}
                      className="inline-flex items-center gap-1 hover:text-slate-200"
                    >
                      <span>Lead</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 font-medium text-right">
                    <button
                      onClick={() => toggleSort("signedErrorMw")}
                      className="inline-flex items-center gap-1 hover:text-slate-200"
                    >
                      <span>Signed Error</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 font-medium text-right">
                    <button
                      onClick={() => toggleSort("absErrorMw")}
                      className="inline-flex items-center gap-1 hover:text-slate-200"
                    >
                      <span>|Error| (MW)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 font-medium">Record Status &amp; Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums">
                {data.items.map((row) => {
                  const isOver = (row.signedErrorMw ?? 0) > 0;
                  return (
                    <tr
                      key={row.startTime}
                      onClick={() => onInspectInterval(row)}
                      className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 text-slate-100 whitespace-nowrap">
                        <span className="font-medium">{row.deliveryDate}</span>
                        <span className="text-slate-500 mx-1.5">·</span>
                        <span className="text-cyan-300">{row.deliveryTimeLondon} GMT</span>
                      </td>
                      <td className="py-2.5 px-2.5 text-right text-slate-400">
                        {row.settlementPeriod}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-300 font-medium">
                        {formatMw(row.actualMw)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-cyan-300 font-medium">
                        {formatMw(row.forecastMw)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">
                        {row.publishTimeLondon || "—"}
                      </td>
                      <td className="py-2.5 px-2.5 text-right text-slate-300">
                        {row.leadTimeHours !== null ? `${row.leadTimeHours}h` : "—"}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-medium ${
                          row.signedErrorMw === null
                            ? "text-slate-500"
                            : isOver
                            ? "text-amber-300"
                            : "text-rose-300"
                        }`}
                      >
                        {formatSignedMw(row.signedErrorMw)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-100">
                        {formatMw(row.absErrorMw)}
                        {row.pctError !== null && (
                          <span className="text-[11px] text-slate-400 font-normal ml-1.5">
                            ({row.pctError}%)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[11px] ${
                              row.status === "MATCHED"
                                ? "text-emerald-400"
                                : "text-slate-400"
                            }`}
                          >
                            {row.status === "MATCHED"
                              ? `Matched (${row.vintageCountEligible}/${row.vintageCountTotal} runs)`
                              : row.status === "ACTUAL_ONLY_UNMATCHED_HH"
                              ? "Actual Only (:30 HH)"
                              : "No Eligible Forecast"}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onInspectInterval(row);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                          >
                            <History className="w-3 h-3" />
                            <span>Audit</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="px-4 py-3 border-t border-slate-800 bg-[#0B0F17]/60 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-3">
              <span>
                Showing{" "}
                <strong className="text-slate-200">
                  {(data.page - 1) * data.pageSize + 1}
                </strong>
                –
                <strong className="text-slate-200">
                  {Math.min(data.page * data.pageSize, data.totalCount)}
                </strong>{" "}
                of <strong className="text-slate-200">{data.totalCount}</strong>{" "}
                intervals
              </span>
              <span aria-hidden="true">·</span>
              <label className="flex items-center gap-1.5">
                <span>Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-[#111726] border border-slate-700 rounded px-2 py-0.5 text-slate-200"
                >
                  <option value={24}>24 (1 Day Hourly)</option>
                  <option value={48}>48 (1 Day Half-Hourly)</option>
                  <option value={96}>96 (2 Days)</option>
                  <option value={168}>168 (1 Week Hourly)</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded border border-slate-700 flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>
              <span className="px-2 text-slate-300 tabular-nums">
                Page {data.page} / {data.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={data.page >= data.totalPages}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded border border-slate-700 flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
