import {
  GlobalFilterState,
  OverviewResponse,
  ForecastsResponse,
  VintageAuditResponse,
  AccuracyResponse,
  DataQualityResponse,
  CutoffMode,
  AlignmentMode,
} from "../types/analytics";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

const responseCache = new Map<string, any>();

export function clearClientCache(): void {
  responseCache.clear();
}

async function fetchJson<T>(url: string, signal?: AbortSignal, useCache = true): Promise<T> {
  if (useCache && responseCache.has(url)) {
    return responseCache.get(url) as T;
  }
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    let errText = `HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      errText = errJson.error || errJson.detail || errText;
    } catch {
      // ignore json parse failure
    }
    throw new Error(errText);
  }
  const data = (await res.json()) as T;
  if (useCache) {
    responseCache.set(url, data);
  }
  return data;
}

export async function fetchOverview(
  filters: GlobalFilterState,
  signal?: AbortSignal
): Promise<OverviewResponse> {
  const params = new URLSearchParams({
    start_date: filters.startDate,
    end_date: filters.endDate,
    cutoff_mode: filters.cutoffMode,
    alignment_mode: filters.alignmentMode,
    mape_threshold: String(filters.mapeThreshold),
  });
  return fetchJson<OverviewResponse>(`${API_BASE}/overview?${params.toString()}`, signal);
}

export interface ForecastQueryOptions {
  startDate: string;
  endDate: string;
  deliveryDate?: string;
  cutoffMode: CutoffMode;
  alignmentMode: AlignmentMode;
  mapeThreshold: number;
  status: string;
  timeWindow: string;
  search: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export async function fetchForecasts(
  opts: ForecastQueryOptions,
  signal?: AbortSignal
): Promise<ForecastsResponse> {
  const params = new URLSearchParams({
    start_date: opts.startDate,
    end_date: opts.endDate,
    cutoff_mode: opts.cutoffMode,
    alignment_mode: opts.alignmentMode,
    mape_threshold: String(opts.mapeThreshold),
    status: opts.status,
    time_window: opts.timeWindow,
    search: opts.search,
    sort_by: opts.sortBy,
    sort_dir: opts.sortDir,
    page: String(opts.page),
    page_size: String(opts.pageSize),
  });
  if (opts.deliveryDate) {
    params.set("delivery_date", opts.deliveryDate);
  }
  return fetchJson<ForecastsResponse>(`${API_BASE}/forecasts?${params.toString()}`, signal);
}

export async function fetchIntervalVintages(
  startTime: string,
  cutoffMode: CutoffMode,
  alignmentMode: AlignmentMode,
  signal?: AbortSignal
): Promise<VintageAuditResponse> {
  const params = new URLSearchParams({
    start_time: startTime,
    cutoff_mode: cutoffMode,
    alignment_mode: alignmentMode,
  });
  return fetchJson<VintageAuditResponse>(
    `${API_BASE}/forecasts/vintages?${params.toString()}`,
    signal
  );
}

export async function fetchAccuracy(
  filters: GlobalFilterState,
  signal?: AbortSignal
): Promise<AccuracyResponse> {
  const params = new URLSearchParams({
    start_date: filters.startDate,
    end_date: filters.endDate,
    cutoff_mode: filters.cutoffMode,
    alignment_mode: filters.alignmentMode,
    mape_threshold: String(filters.mapeThreshold),
  });
  return fetchJson<AccuracyResponse>(`${API_BASE}/accuracy?${params.toString()}`, signal);
}

export async function fetchDataQuality(
  filters: GlobalFilterState,
  signal?: AbortSignal
): Promise<DataQualityResponse> {
  const params = new URLSearchParams({
    start_date: filters.startDate,
    end_date: filters.endDate,
    cutoff_mode: filters.cutoffMode,
    alignment_mode: filters.alignmentMode,
  });
  return fetchJson<DataQualityResponse>(`${API_BASE}/data-quality?${params.toString()}`, signal);
}

export async function triggerDatasetRefresh(): Promise<{
  status: string;
  fetchedAt: string;
  upstreamStatus: string;
  lastFetchLatencyMs?: number;
}> {
  clearClientCache();
  const res = await fetch(`${API_BASE}/refresh`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Refresh failed with status ${res.status}`);
  }
  return res.json();
}
