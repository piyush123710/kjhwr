export type CutoffMode =
  | "d_minus_1_1100"
  | "d_minus_1_1200"
  | "d_minus_1_1830"
  | "lead_time_4h"
  | "lead_time_12h";

export type AlignmentMode = "strict_exact" | "hh_step";

export type NavSection =
  | "overview"
  | "explorer"
  | "accuracy"
  | "quality"
  | "settings";

export interface GlobalFilterState {
  startDate: string;
  endDate: string;
  cutoffMode: CutoffMode;
  alignmentMode: AlignmentMode;
  mapeThreshold: number;
}

export interface IntervalAnalysisRow {
  startTime: string;
  startTimeLondon: string;
  deliveryDate: string;
  deliveryTimeLondon: string;
  settlementPeriod: number;
  actualMw: number | null;
  forecastMw: number | null;
  actualMwh: number | null;
  forecastMwh: number | null;
  publishTime: string | null;
  publishTimeLondon: string | null;
  cutoffTimeUtc: string;
  cutoffTimeLondon: string;
  leadTimeHours: number | null;
  signedErrorMw: number | null;
  absErrorMw: number | null;
  pctError: number | null;
  status:
    | "MATCHED"
    | "ACTUAL_ONLY_UNMATCHED_HH"
    | "MISSING_FORECAST_BEFORE_CUTOFF"
    | "MISSING_ACTUAL";
  vintageCountTotal: number;
  vintageCountEligible: number;
}

export interface KPISummary {
  matchedIntervalCount: number;
  totalHalfHourSlotsInPeriod: number;
  intervalDurationHours: number;
  actualEnergyMwh: number;
  forecastEnergyMwh: number;
  energyDeltaMwh: number;
  actualAvgPowerMw: number;
  forecastAvgPowerMw: number;
  maeMw: number;
  rmseMw: number;
  biasMw: number;
  mapePct: number | null;
  mapeValidCount: number;
  mapeExcludedCount: number;
  mapeMinActualMwThreshold: number;
  overforecastCount: number;
  underforecastCount: number;
  exactMatchCount: number;
  percentilesSignedMw: {
    p05: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
  percentilesAbsMw: {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
}

export interface QualityStatsSummary {
  fuelhhRawTotal: number;
  windforRawTotal: number;
  windforJan2026TargetTotal: number;
  validActualRecords: number;
  validForecastVintages: number;
  distinctForecastTargetHours: number;
  duplicateActuals: number;
  duplicateForecasts: number;
  invalidActuals: number;
  invalidForecasts: number;
  earliestActualPub: string | null;
  latestActualPub: string | null;
  earliestForecastPub: string | null;
  latestForecastPub: string | null;
  matchedCount: number;
  unmatchedActualOnlyHhCount: number;
  missingForecastBeforeCutoffCount: number;
  missingActualCount: number;
}

export interface OverviewResponse {
  period: {
    startDate: string;
    endDate: string;
    timezone: string;
  };
  config: {
    cutoffMode: CutoffMode;
    alignmentMode: AlignmentMode;
    mapeMinActualMwThreshold: number;
  };
  fetchedAt: string;
  upstreamStatus: "ONLINE" | "CACHED_FALLBACK";
  kpis: KPISummary;
  timeSeries: IntervalAnalysisRow[];
  highestErrorIntervals: IntervalAnalysisRow[];
  operationalSummary: {
    largestOverforecast: IntervalAnalysisRow | null;
    largestUnderforecast: IntervalAnalysisRow | null;
    qualityStats: QualityStatsSummary;
  };
}

export interface ForecastsResponse {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  config: {
    cutoffMode: CutoffMode;
    alignmentMode: AlignmentMode;
  };
  items: IntervalAnalysisRow[];
}

export interface VintageAuditItem {
  publishTime: string;
  publishTimeLondon: string;
  generationMw: number;
  leadTimeHours: number;
  eligibleBeforeCutoff: boolean;
  isSelected: boolean;
  signedErrorMw: number | null;
  absErrorMw: number | null;
}

export interface VintageAuditResponse {
  startTime: string;
  startTimeLondon: string;
  lookupForecastHour: string;
  actualMw: number | null;
  cutoffMode: CutoffMode;
  cutoffTimeUtc: string;
  cutoffTimeLondon: string;
  selectedPublishTime: string | null;
  vintages: VintageAuditItem[];
}

export interface DailyAccuracySummary {
  date: string;
  matchedIntervals: number;
  totalHalfHours: number;
  actualEnergyMwh: number;
  forecastEnergyMwh: number;
  actualAvgMw: number;
  forecastAvgMw: number;
  maeMw: number;
  rmseMw: number;
  biasMw: number;
  maxAbsErrorMw: number;
  mapePct: number | null;
}

export interface HourlyProfileRow {
  hour: string;
  count: number;
  maeMw: number;
  rmseMw: number;
  biasMw: number;
  avgActualMw: number;
  avgForecastMw: number;
}

export interface ErrorHistogramBin {
  rangeLabel: string;
  binCenterMw: number;
  count: number;
  direction: "UNDERFORECAST" | "OVERFORECAST" | "NEUTRAL";
}

export interface CutoffComparisonRow {
  mode: CutoffMode;
  label: string;
  description: string;
  matchedCount: number;
  avgLeadTimeHours: number;
  maeMw: number;
  rmseMw: number;
  biasMw: number;
  mapePct: number | null;
}

export interface AccuracyResponse {
  period: {
    startDate: string;
    endDate: string;
    timezone: string;
  };
  config: {
    cutoffMode: CutoffMode;
    alignmentMode: AlignmentMode;
    mapeMinActualMwThreshold: number;
  };
  kpis: KPISummary;
  dailySummaries: DailyAccuracySummary[];
  hourlyProfile: HourlyProfileRow[];
  errorHistogram: ErrorHistogramBin[];
  cutoffComparison: CutoffComparisonRow[];
}

export interface DailyCoverageRow {
  date: string;
  expectedHalfHours: number;
  actualPresent: number;
  forecastMatched: number;
  unmatchedHh: number;
  missingForecastCutoff: number;
  missingActual: number;
  completenessPct: number;
}

export interface DataQualityResponse {
  retrievalState: "SUCCESS" | "INCOMPLETE" | "NO_DATA" | "API_FAILURE";
  upstreamStatus: "ONLINE" | "CACHED_FALLBACK";
  fetchedAt: string;
  source: string;
  config: {
    cutoffMode: CutoffMode;
    alignmentMode: AlignmentMode;
  };
  summary: QualityStatsSummary;
  dailyCoverage: DailyCoverageRow[];
  schemaNotes: Array<{
    dataset: string;
    endpoint: string;
    granularity: string;
    unit: string;
  }>;
}
