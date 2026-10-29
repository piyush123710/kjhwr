import React, { useCallback, useEffect, useState } from "react";
import {
  GlobalFilterState,
  NavSection,
  OverviewResponse,
  IntervalAnalysisRow,
} from "./types/analytics";
import { fetchOverview, triggerDatasetRefresh } from "./services/api";
import {
  formatMw,
  formatSignedMw,
  formatMwh,
  formatPct,
  formatCutoffLabel,
  formatAlignmentLabel,
  formatShortDate,
} from "./lib/formatters";
import { AppLayout } from "./components/AppLayout";
import { DateFilter } from "./components/DateFilter";
import { MetricCard } from "./components/MetricCard";
import { GenerationChart } from "./components/GenerationChart";
import { ErrorChart } from "./components/ErrorChart";
import { ForecastTable } from "./components/ForecastTable";
import { AccuracyView } from "./components/AccuracyView";
import { DataQualityView } from "./components/DataQualityView";
import { SettingsView } from "./components/SettingsView";
import { VintageAuditModal } from "./components/VintageAuditModal";
import { LoadingState, ErrorState, EmptyState } from "./components/States";

export function App() {
  const [activeSection, setActiveSection] = useState<NavSection>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  const [filters, setFilters] = useState<GlobalFilterState>({
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    cutoffMode: "d_minus_1_1100",
    alignmentMode: "strict_exact",
    mapeThreshold: 100,
  });

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [auditStartTime, setAuditStartTime] = useState<string | null>(null);

  const loadOverviewData = useCallback(
    (signal?: AbortSignal) => {
      setLoadingOverview(true);
      setOverviewError(null);
      fetchOverview(filters, signal)
        .then((res) => {
          setOverview(res);
          setLoadingOverview(false);
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            setOverviewError(
              err.message || "Failed to retrieve Elexon BMRS overview data"
            );
            setLoadingOverview(false);
          }
        });
    },
    [filters]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    loadOverviewData(ctrl.signal);
    return () => ctrl.abort();
  }, [loadOverviewData]);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await triggerDatasetRefresh();
      loadOverviewData();
    } catch (err: any) {
      setOverviewError(err.message || "Failed to refresh Elexon BMRS dataset");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleInspectInterval = (row: IntervalAnalysisRow) => {
    setAuditStartTime(row.startTime);
  };

  const dateRangeShort = `${formatShortDate(filters.startDate)} – ${formatShortDate(
    filters.endDate
  )}`;

  const kpis = overview?.kpis;
  const opSummary = overview?.operationalSummary;

  return (
    <>
      <AppLayout
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        upstreamStatus={
          overviewError
            ? "ERROR"
            : overview?.upstreamStatus || "ONLINE"
        }
        fetchedAt={overview?.fetchedAt}
        fuelhhCount={
          opSummary?.qualityStats.fuelhhRawTotal ?? 1488
        }
        windforCount={
          opSummary?.qualityStats.windforJan2026TargetTotal ?? 18080
        }
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        {/* Persistent Date & Cutoff Filter Bar */}
        <DateFilter
          startDate={filters.startDate}
          endDate={filters.endDate}
          cutoffMode={filters.cutoffMode}
          alignmentMode={filters.alignmentMode}
          onChangeDates={(startDate, endDate) =>
            setFilters((prev) => ({ ...prev, startDate, endDate }))
          }
          onChangeCutoff={(cutoffMode) =>
            setFilters((prev) => ({ ...prev, cutoffMode }))
          }
          onChangeAlignment={(alignmentMode) =>
            setFilters((prev) => ({ ...prev, alignmentMode }))
          }
        />

        {/* SECTION 1: OVERVIEW DASHBOARD */}
        {activeSection === "overview" && (
          <div className="space-y-5">
            {loadingOverview && (
              <LoadingState
                label="Computing January 2026 day-ahead wind generation KPIs and matched interval series..."
                rows={6}
              />
            )}

            {overviewError && !loadingOverview && (
              <ErrorState
                message={overviewError}
                onRetry={() => loadOverviewData()}
              />
            )}

            {!loadingOverview &&
              !overviewError &&
              overview &&
              kpis &&
              kpis.matchedIntervalCount === 0 && (
                <EmptyState
                  description="No valid matched actual/forecast intervals exist in the selected January 2026 window."
                  actionLabel="Reset to Full January 2026"
                  onAction={() =>
                    setFilters((prev) => ({
                      ...prev,
                      startDate: "2026-01-01",
                      endDate: "2026-01-31",
                    }))
                  }
                />
              )}

            {!loadingOverview &&
              !overviewError &&
              overview &&
              kpis &&
              kpis.matchedIntervalCount > 0 && (
                <>
                  {/* 5 Executive KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <MetricCard
                      title="Actual Wind Generation"
                      primaryValue={formatMwh(kpis.actualEnergyMwh)}
                      unit="MWh"
                      secondaryLabel="Avg Power"
                      secondaryValue={`${formatMw(kpis.actualAvgPowerMw)} MW`}
                      dateRangeLabel={dateRangeShort}
                      semanticTone="emerald"
                      tooltipFormula={`Energy (MWh) = Σ(Actual_MW × ${kpis.intervalDurationHours}h)`}
                      tooltipDetail={`Derived from ${kpis.matchedIntervalCount} matched Elexon FUELHH wind records. Clearly separates average power (MW) from interval energy (MWh).`}
                    />

                    <MetricCard
                      title="Forecast Wind Generation"
                      primaryValue={formatMwh(kpis.forecastEnergyMwh)}
                      unit="MWh"
                      secondaryLabel="Avg Power"
                      secondaryValue={`${formatMw(kpis.forecastAvgPowerMw)} MW`}
                      dateRangeLabel={dateRangeShort}
                      semanticTone="cyan"
                      tooltipFormula={`Energy (MWh) = Σ(Selected_Forecast_MW × ${kpis.intervalDurationHours}h)`}
                      tooltipDetail={`Uses the latest Elexon WINDFOR publication available at or before ${formatCutoffLabel(
                        filters.cutoffMode
                      )} for each delivery interval.`}
                    />

                    <MetricCard
                      title="Mean Absolute Error (MAE)"
                      primaryValue={formatMw(kpis.maeMw, 1)}
                      unit="MW"
                      secondaryLabel="Signed Bias"
                      secondaryValue={`${formatSignedMw(kpis.biasMw, 1)} MW`}
                      dateRangeLabel={`N=${kpis.matchedIntervalCount}`}
                      semanticTone="neutral"
                      tooltipFormula="MAE = (1/N) × Σ |Forecast_MW − Actual_MW|"
                      tooltipDetail="Average magnitude of day-ahead wind forecast deviation in MW across valid matched intervals. Missing values are never replaced with zero."
                    />

                    <MetricCard
                      title="Root Mean Squared Error"
                      primaryValue={formatMw(kpis.rmseMw, 1)}
                      unit="MW"
                      secondaryLabel="P95 |Error|"
                      secondaryValue={`${formatMw(kpis.percentilesAbsMw.p95)} MW`}
                      dateRangeLabel={`N=${kpis.matchedIntervalCount}`}
                      semanticTone="amber"
                      tooltipFormula="RMSE = √[ (1/N) × Σ (Forecast_MW − Actual_MW)² ]"
                      tooltipDetail="Penalizes large tail forecast deviations more heavily than MAE, reflecting extreme weather front timing risk for day-ahead procurement."
                    />

                    <MetricCard
                      title="Mean Abs Percentage Error"
                      primaryValue={
                        kpis.mapePct !== null ? `${kpis.mapePct.toFixed(2)}` : "—"
                      }
                      unit="%"
                      secondaryLabel="Valid Denom"
                      secondaryValue={`${kpis.mapeValidCount}/${kpis.matchedIntervalCount}`}
                      dateRangeLabel={`>${kpis.mapeMinActualMwThreshold} MW`}
                      semanticTone="neutral"
                      tooltipFormula="MAPE = (100/N_valid) × Σ (|Forecast − Actual| / Actual)"
                      tooltipDetail={`Explicitly guards against zero/near-zero denominator distortion by requiring Actual > ${kpis.mapeMinActualMwThreshold} MW (${kpis.mapeExcludedCount} intervals excluded).`}
                    />
                  </div>

                  {/* Main Time-Series Chart */}
                  <GenerationChart
                    data={overview.timeSeries}
                    cutoffLabel={formatCutoffLabel(filters.cutoffMode)}
                    onSelectInterval={handleInspectInterval}
                  />

                  {/* Forecast Error Panel (Signed/Abs Chart + Percentiles + Highest Error Table) */}
                  <ErrorChart
                    timeSeries={overview.timeSeries}
                    highestErrorIntervals={overview.highestErrorIntervals}
                    kpis={kpis}
                    onInspectInterval={handleInspectInterval}
                  />

                  {/* Operational Summary Panel */}
                  <div className="bg-[#111726] border border-slate-800/90 rounded-md p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-800">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-100">
                          Operational Period Summary (Data-Derived Audit)
                        </h3>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                          Objective statistical summary of matched Elexon FUELHH and WINDFOR records for {filters.startDate} to {filters.endDate}
                        </p>
                      </div>
                      <span className="text-xs font-mono text-slate-400">
                        {formatAlignmentLabel(filters.alignmentMode)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 text-xs font-mono tabular-nums">
                      <div className="bg-[#0B0F17] border border-slate-800/80 rounded p-3.5 space-y-1">
                        <div className="text-slate-400 font-sans text-[11px]">
                          1. Selected Evaluation Window
                        </div>
                        <div className="text-slate-100 font-semibold">
                          {filters.startDate} &rarr; {filters.endDate}
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          Timezone: Europe/London (GMT)
                        </div>
                      </div>

                      <div className="bg-[#0B0F17] border border-slate-800/80 rounded p-3.5 space-y-1">
                        <div className="text-slate-400 font-sans text-[11px]">
                          2. Matched Interval Population
                        </div>
                        <div className="text-cyan-300 font-semibold">
                          {kpis.matchedIntervalCount.toLocaleString()} matched intervals
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          Out of {kpis.totalHalfHourSlotsInPeriod} half-hour settlement periods
                        </div>
                      </div>

                      <div className="bg-[#0B0F17] border border-slate-800/80 rounded p-3.5 space-y-1">
                        <div className="text-slate-400 font-sans text-[11px]">
                          3. Forecast Error Profile
                        </div>
                        <div className="text-slate-100 font-semibold">
                          Bias: {formatSignedMw(kpis.biasMw, 1)} MW
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          {kpis.overforecastCount} Over (+) · {kpis.underforecastCount} Under (−)
                        </div>
                      </div>

                      <div className="bg-[#0B0F17] border border-slate-800/80 rounded p-3.5 space-y-1">
                        <div className="text-slate-400 font-sans text-[11px]">
                          4. Largest Observed Deviation
                        </div>
                        {overview.highestErrorIntervals[0] ? (
                          <>
                            <div className="text-amber-300 font-semibold">
                              {formatSignedMw(
                                overview.highestErrorIntervals[0].signedErrorMw
                              )}{" "}
                              MW (|Err|{" "}
                              {formatMw(overview.highestErrorIntervals[0].absErrorMw)} MW)
                            </div>
                            <div className="text-slate-400 text-[11px]">
                              At {overview.highestErrorIntervals[0].startTimeLondon}
                            </div>
                          </>
                        ) : (
                          <div className="text-slate-400">None</div>
                        )}
                      </div>

                      <div className="bg-[#0B0F17] border border-slate-800/80 rounded p-3.5 space-y-1">
                        <div className="text-slate-400 font-sans text-[11px]">
                          5. Missing &amp; Unmatched Records
                        </div>
                        <div className="text-slate-100 font-semibold">
                          Missing Actuals:{" "}
                          {opSummary?.qualityStats.missingActualCount ?? 0} · Missing Fc:{" "}
                          {opSummary?.qualityStats.missingForecastBeforeCutoffCount ?? 0}
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          Unmatched :30 HH Actuals:{" "}
                          {opSummary?.qualityStats.unmatchedActualOnlyHhCount ?? 0}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
          </div>
        )}

        {/* SECTION 2: FORECAST EXPLORER */}
        {activeSection === "explorer" && (
          <ForecastTable
            filters={filters}
            onInspectInterval={handleInspectInterval}
          />
        )}

        {/* SECTION 3: ACCURACY ANALYSIS */}
        {activeSection === "accuracy" && (
          <AccuracyView
            filters={filters}
            onChangeCutoff={(cutoffMode) =>
              setFilters((prev) => ({ ...prev, cutoffMode }))
            }
          />
        )}

        {/* SECTION 4: DATA QUALITY */}
        {activeSection === "quality" && <DataQualityView filters={filters} />}

        {/* SECTION 5: SETTINGS */}
        {activeSection === "settings" && (
          <SettingsView
            filters={filters}
            onUpdateFilters={(patch) =>
              setFilters((prev) => ({ ...prev, ...patch }))
            }
          />
        )}
      </AppLayout>

      {/* Historical Forecast Vintage Audit Drawer / Modal */}
      <VintageAuditModal
        startTime={auditStartTime}
        cutoffMode={filters.cutoffMode}
        alignmentMode={filters.alignmentMode}
        onClose={() => setAuditStartTime(null)}
      />
    </>
  );
}

export default App;
