import express from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer } from "vite";

const PORT = Number(process.env.PORT) || 3000;
const ELEXON_BASE_URL =
  process.env.ELEXON_API_BASE_URL || "https://data.elexon.co.uk/bmrs/api/v1";
const CACHE_PATH = path.resolve(
  process.cwd(),
  process.env.CACHE_FILE_PATH || "./data/elexon_jan2026_cache.json"
);

export type CutoffMode =
  | "d_minus_1_1100"
  | "d_minus_1_1200"
  | "d_minus_1_1830"
  | "lead_time_4h"
  | "lead_time_12h";

export type AlignmentMode = "strict_exact" | "hh_step";

interface RawFuelHH {
  dataset?: string;
  publishTime: string;
  startTime: string;
  settlementDate?: string;
  settlementPeriod?: number;
  fuelType?: string;
  generation: number;
}

interface RawWindFor {
  dataset?: string;
  publishTime: string;
  startTime: string;
  generation: number;
}

interface CacheBundle {
  fetchedAt: string;
  source: string;
  upstreamStatus?: "ONLINE" | "CACHED_FALLBACK";
  lastFetchLatencyMs?: number;
  rawCounts: {
    fuelhhRawTotal: number;
    windforRawTotal: number;
    windforJan2026TargetTotal: number;
  };
  fuelhh: RawFuelHH[];
  windfor: RawWindFor[];
}

let memoryCache: CacheBundle | null = null;

async function fetchLiveFromElexon(): Promise<CacheBundle> {
  const t0 = Date.now();
  const fuelUrl = `${ELEXON_BASE_URL}/datasets/FUELHH/stream?settlementDateFrom=2026-01-01&settlementDateTo=2026-01-31&fuelType=WIND`;
  const windUrl = `${ELEXON_BASE_URL}/datasets/WINDFOR/stream?publishDateTimeFrom=2025-12-28T00:00:00Z&publishDateTimeTo=2026-01-31T23:59:59Z`;

  const [rFuel, rWind] = await Promise.all([
    fetch(fuelUrl, { headers: { Accept: "application/json" } }),
    fetch(windUrl, { headers: { Accept: "application/json" } }),
  ]);

  if (!rFuel.ok || !rWind.ok) {
    throw new Error(
      `Elexon upstream HTTP error: FUELHH=${rFuel.status}, WINDFOR=${rWind.status}`
    );
  }

  const fuelData = (await rFuel.json()) as RawFuelHH[];
  const windRaw = (await rWind.json()) as RawWindFor[];

  const windJan = windRaw.filter(
    (r) =>
      r.startTime >= "2026-01-01T00:00:00Z" &&
      r.startTime <= "2026-01-31T23:59:59Z"
  );

  const bundle: CacheBundle = {
    fetchedAt: new Date().toISOString(),
    source: `Elexon BMRS API v1 (${ELEXON_BASE_URL})`,
    upstreamStatus: "ONLINE",
    lastFetchLatencyMs: Date.now() - t0,
    rawCounts: {
      fuelhhRawTotal: fuelData.length,
      windforRawTotal: windRaw.length,
      windforJan2026TargetTotal: windJan.length,
    },
    fuelhh: fuelData,
    windfor: windJan,
  };

  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(bundle));
  } catch (err) {
    console.warn("Could not write Elexon cache file:", err);
  }

  memoryCache = bundle;
  return bundle;
}

async function getDatasetBundle(forceRefresh = false): Promise<CacheBundle> {
  if (!forceRefresh && memoryCache) {
    return memoryCache;
  }

  if (!forceRefresh && fs.existsSync(CACHE_PATH)) {
    try {
      const raw = fs.readFileSync(CACHE_PATH, "utf-8");
      const parsed = JSON.parse(raw) as CacheBundle;
      parsed.upstreamStatus = parsed.upstreamStatus || "ONLINE";
      memoryCache = parsed;
      return parsed;
    } catch (err) {
      console.warn("Cache parse failed, fetching live from Elexon:", err);
    }
  }

  try {
    return await fetchLiveFromElexon();
  } catch (err) {
    if (memoryCache) {
      return { ...memoryCache, upstreamStatus: "CACHED_FALLBACK" };
    }
    if (fs.existsSync(CACHE_PATH)) {
      const raw = fs.readFileSync(CACHE_PATH, "utf-8");
      const parsed = JSON.parse(raw) as CacheBundle;
      parsed.upstreamStatus = "CACHED_FALLBACK";
      memoryCache = parsed;
      return parsed;
    }
    throw err;
  }
}

/**
 * Format UTC Date into Europe/London string.
 * Uses Intl.DateTimeFormat with timeZone: "Europe/London".
 */
const londonFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZoneName: "short",
});

function formatLondonDisplay(date: Date): string {
  const parts = londonFormatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute} ${map.timeZoneName || "GMT"}`;
}

function getLondonDateAndHour(date: Date): {
  dateStr: string;
  timeStr: string;
  hour: number;
  minute: number;
} {
  const parts = londonFormatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const hour = Number(map.hour === "24" ? "0" : map.hour);
  const minute = Number(map.minute);
  return {
    dateStr: `${map.year}-${map.month}-${map.day}`,
    timeStr: `${String(hour).padStart(2, "0")}:${map.minute}`,
    hour,
    minute,
  };
}

export function computeDecisionCutoffUtc(
  startTimeUtc: Date,
  cutoffMode: CutoffMode = "d_minus_1_1100"
): Date {
  if (cutoffMode === "lead_time_4h") {
    return new Date(startTimeUtc.getTime() - 4 * 3600_000);
  }
  if (cutoffMode === "lead_time_12h") {
    return new Date(startTimeUtc.getTime() - 12 * 3600_000);
  }

  // Determine London calendar date D, then D-1 in UTC/GMT
  const { dateStr } = getLondonDateAndHour(startTimeUtc);
  const [y, m, d] = dateStr.split("-").map(Number);
  const dMinus1Utc = new Date(Date.UTC(y, m - 1, d - 1, 0, 0, 0));

  if (cutoffMode === "d_minus_1_1200") {
    dMinus1Utc.setUTCHours(12, 0, 0, 0);
    return dMinus1Utc;
  }
  if (cutoffMode === "d_minus_1_1830") {
    dMinus1Utc.setUTCHours(18, 30, 0, 0);
    return dMinus1Utc;
  }
  // Default: d_minus_1_1100 (GB Day-Ahead Auction Gate Closure at 11:00 UK time on D-1)
  dMinus1Utc.setUTCHours(11, 0, 0, 0);
  return dMinus1Utc;
}

function computePercentile(sortedVals: number[], q: number): number {
  if (sortedVals.length === 0) return 0;
  if (sortedVals.length === 1) return Number(sortedVals[0].toFixed(1));
  const pos = (sortedVals.length - 1) * (q / 100);
  const base = Math.floor(pos);
  const rest = pos - base;
  const val =
    base + 1 < sortedVals.length
      ? sortedVals[base] + rest * (sortedVals[base + 1] - sortedVals[base])
      : sortedVals[base];
  return Number(val.toFixed(1));
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

function buildDatasetAnalysis(
  bundle: CacheBundle,
  startDate = "2026-01-01",
  endDate = "2026-01-31",
  cutoffMode: CutoffMode = "d_minus_1_1100",
  alignmentMode: AlignmentMode = "strict_exact",
  mapeThreshold = 100
) {
  // 1. Deduplicate and validate FUELHH actuals
  const actualByStart = new Map<
    string,
    { startTime: string; publishTime: string; generation: number; sp: number }
  >();
  let duplicateActuals = 0;
  let invalidActuals = 0;
  let earliestActualPub: string | null = null;
  let latestActualPub: string | null = null;

  for (const rec of bundle.fuelhh) {
    if (rec.fuelType && rec.fuelType !== "WIND") continue;
    if (
      typeof rec.generation !== "number" ||
      !Number.isFinite(rec.generation) ||
      rec.generation < 0
    ) {
      invalidActuals++;
      continue;
    }
    const startIso = new Date(rec.startTime).toISOString().replace(".000Z", "Z");
    const pubIso = new Date(rec.publishTime).toISOString().replace(".000Z", "Z");

    if (!earliestActualPub || pubIso < earliestActualPub) earliestActualPub = pubIso;
    if (!latestActualPub || pubIso > latestActualPub) latestActualPub = pubIso;

    const existing = actualByStart.get(startIso);
    if (existing) {
      duplicateActuals++;
      if (pubIso >= existing.publishTime) {
        actualByStart.set(startIso, {
          startTime: startIso,
          publishTime: pubIso,
          generation: rec.generation,
          sp: rec.settlementPeriod || 1,
        });
      }
    } else {
      actualByStart.set(startIso, {
        startTime: startIso,
        publishTime: pubIso,
        generation: rec.generation,
        sp: rec.settlementPeriod || 1,
      });
    }
  }

  // 2. Group and deduplicate WINDFOR forecast vintages by startTime
  const forecastMap = new Map<
    string,
    Array<{ startTime: string; publishTime: string; publishMs: number; generation: number }>
  >();
  const seenForecastKeys = new Set<string>();
  let duplicateForecasts = 0;
  let invalidForecasts = 0;
  let earliestForecastPub: string | null = null;
  let latestForecastPub: string | null = null;

  for (const rec of bundle.windfor) {
    if (
      typeof rec.generation !== "number" ||
      !Number.isFinite(rec.generation) ||
      rec.generation < 0
    ) {
      invalidForecasts++;
      continue;
    }
    const startIso = new Date(rec.startTime).toISOString().replace(".000Z", "Z");
    const pubDt = new Date(rec.publishTime);
    const pubIso = pubDt.toISOString().replace(".000Z", "Z");
    const compositeKey = `${startIso}|${pubIso}`;

    if (!earliestForecastPub || pubIso < earliestForecastPub) earliestForecastPub = pubIso;
    if (!latestForecastPub || pubIso > latestForecastPub) latestForecastPub = pubIso;

    if (seenForecastKeys.has(compositeKey)) {
      duplicateForecasts++;
      continue;
    }
    seenForecastKeys.add(compositeKey);

    const list = forecastMap.get(startIso) || [];
    list.push({
      startTime: startIso,
      publishTime: pubIso,
      publishMs: pubDt.getTime(),
      generation: rec.generation,
    });
    forecastMap.set(startIso, list);
  }

  for (const list of forecastMap.values()) {
    list.sort((a, b) => a.publishMs - b.publishMs);
  }

  // 3. Build canonical 30-minute delivery timeline across [startDate, endDate]
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  const endMs = Date.parse(`${endDate}T23:30:00Z`);
  const intervalDurationHours = alignmentMode === "strict_exact" ? 1.0 : 0.5;

  const intervals: IntervalAnalysisRow[] = [];

  for (let ms = startMs; ms <= endMs; ms += 30 * 60_000) {
    const curDate = new Date(ms);
    const tsIso = curDate.toISOString().replace(".000Z", "Z");
    const londonParts = getLondonDateAndHour(curDate);
    const sp = londonParts.hour * 2 + (londonParts.minute === 0 ? 1 : 2);

    const actualRec = actualByStart.get(tsIso);
    const actualMw = actualRec ? actualRec.generation : null;

    let lookupIso = tsIso;
    if (alignmentMode === "hh_step" && londonParts.minute === 30) {
      const hourStart = new Date(ms - 30 * 60_000);
      lookupIso = hourStart.toISOString().replace(".000Z", "Z");
    }

    const vintages = forecastMap.get(lookupIso) || [];
    const cutoffUtc = computeDecisionCutoffUtc(curDate, cutoffMode);
    const cutoffMs = cutoffUtc.getTime();
    const cutoffIso = cutoffUtc.toISOString().replace(".000Z", "Z");

    const eligible = vintages.filter((v) => v.publishMs <= cutoffMs);
    const selected = eligible.length > 0 ? eligible[eligible.length - 1] : null;

    const forecastMw = selected ? selected.generation : null;
    const publishTime = selected ? selected.publishTime : null;
    const publishTimeLondon = selected
      ? formatLondonDisplay(new Date(selected.publishMs))
      : null;
    const leadTimeHours = selected
      ? Number(((ms - selected.publishMs) / 3600_000).toFixed(2))
      : null;

    let status: IntervalAnalysisRow["status"];
    let signedErrorMw: number | null = null;
    let absErrorMw: number | null = null;
    let pctError: number | null = null;

    if (actualMw !== null && forecastMw !== null) {
      status = "MATCHED";
      signedErrorMw = Number((forecastMw - actualMw).toFixed(1));
      absErrorMw = Number(Math.abs(signedErrorMw).toFixed(1));
      if (actualMw > mapeThreshold) {
        pctError = Number(((absErrorMw / actualMw) * 100).toFixed(2));
      }
    } else if (actualMw !== null && forecastMw === null) {
      status =
        vintages.length === 0
          ? "ACTUAL_ONLY_UNMATCHED_HH"
          : "MISSING_FORECAST_BEFORE_CUTOFF";
    } else {
      status = "MISSING_ACTUAL";
    }

    intervals.push({
      startTime: tsIso,
      startTimeLondon: formatLondonDisplay(curDate),
      deliveryDate: londonParts.dateStr,
      deliveryTimeLondon: londonParts.timeStr,
      settlementPeriod: sp,
      actualMw,
      forecastMw,
      actualMwh:
        actualMw !== null ? Number((actualMw * intervalDurationHours).toFixed(1)) : null,
      forecastMwh:
        forecastMw !== null
          ? Number((forecastMw * intervalDurationHours).toFixed(1))
          : null,
      publishTime,
      publishTimeLondon,
      cutoffTimeUtc: cutoffIso,
      cutoffTimeLondon: formatLondonDisplay(cutoffUtc),
      leadTimeHours,
      signedErrorMw,
      absErrorMw,
      pctError,
      status,
      vintageCountTotal: vintages.length,
      vintageCountEligible: eligible.length,
    });
  }

  // 4. Calculate accuracy metrics strictly on valid MATCHED intervals
  const matched = intervals.filter(
    (r) => r.status === "MATCHED" && r.actualMw !== null && r.forecastMw !== null
  );
  const n = matched.length;

  let sumActualMw = 0;
  let sumForecastMw = 0;
  let sumSignedErr = 0;
  let sumAbsErr = 0;
  let sumSqErr = 0;
  let overforecastCount = 0;
  let underforecastCount = 0;
  let exactMatchCount = 0;
  let mapeExcludedCount = 0;
  const mapeTerms: number[] = [];
  const signedErrors: number[] = [];
  const absErrors: number[] = [];

  for (const r of matched) {
    const act = r.actualMw!;
    const fc = r.forecastMw!;
    const signed = fc - act;
    const abs = Math.abs(signed);

    sumActualMw += act;
    sumForecastMw += fc;
    sumSignedErr += signed;
    sumAbsErr += abs;
    sumSqErr += signed * signed;

    signedErrors.push(signed);
    absErrors.push(abs);

    if (signed > 0) overforecastCount++;
    else if (signed < 0) underforecastCount++;
    else exactMatchCount++;

    if (act > mapeThreshold) {
      mapeTerms.push((abs / act) * 100);
    } else {
      mapeExcludedCount++;
    }
  }

  signedErrors.sort((a, b) => a - b);
  absErrors.sort((a, b) => a - b);

  const maeMw = n > 0 ? Number((sumAbsErr / n).toFixed(1)) : 0;
  const rmseMw = n > 0 ? Number(Math.sqrt(sumSqErr / n).toFixed(1)) : 0;
  const biasMw = n > 0 ? Number((sumSignedErr / n).toFixed(1)) : 0;
  const mapePct =
    mapeTerms.length > 0
      ? Number(
          (mapeTerms.reduce((acc, v) => acc + v, 0) / mapeTerms.length).toFixed(2)
        )
      : null;

  const actualEnergyMwh = Number((sumActualMw * intervalDurationHours).toFixed(1));
  const forecastEnergyMwh = Number((sumForecastMw * intervalDurationHours).toFixed(1));
  const actualAvgPowerMw = n > 0 ? Number((sumActualMw / n).toFixed(1)) : 0;
  const forecastAvgPowerMw = n > 0 ? Number((sumForecastMw / n).toFixed(1)) : 0;

  const kpis = {
    matchedIntervalCount: n,
    totalHalfHourSlotsInPeriod: intervals.length,
    intervalDurationHours,
    actualEnergyMwh,
    forecastEnergyMwh,
    energyDeltaMwh: Number((forecastEnergyMwh - actualEnergyMwh).toFixed(1)),
    actualAvgPowerMw,
    forecastAvgPowerMw,
    maeMw,
    rmseMw,
    biasMw,
    mapePct,
    mapeValidCount: mapeTerms.length,
    mapeExcludedCount,
    mapeMinActualMwThreshold: mapeThreshold,
    overforecastCount,
    underforecastCount,
    exactMatchCount,
    percentilesSignedMw: {
      p05: computePercentile(signedErrors, 5),
      p10: computePercentile(signedErrors, 10),
      p25: computePercentile(signedErrors, 25),
      p50: computePercentile(signedErrors, 50),
      p75: computePercentile(signedErrors, 75),
      p90: computePercentile(signedErrors, 90),
      p95: computePercentile(signedErrors, 95),
    },
    percentilesAbsMw: {
      p50: computePercentile(absErrors, 50),
      p75: computePercentile(absErrors, 75),
      p90: computePercentile(absErrors, 90),
      p95: computePercentile(absErrors, 95),
    },
  };

  return {
    intervals,
    matched,
    kpis,
    actualByStart,
    forecastMap,
    qualityStats: {
      fuelhhRawTotal: bundle.rawCounts.fuelhhRawTotal,
      windforRawTotal: bundle.rawCounts.windforRawTotal,
      windforJan2026TargetTotal: bundle.rawCounts.windforJan2026TargetTotal,
      validActualRecords: actualByStart.size,
      validForecastVintages: seenForecastKeys.size,
      distinctForecastTargetHours: forecastMap.size,
      duplicateActuals,
      duplicateForecasts,
      invalidActuals,
      invalidForecasts,
      earliestActualPub,
      latestActualPub,
      earliestForecastPub,
      latestForecastPub,
      matchedCount: matched.length,
      unmatchedActualOnlyHhCount: intervals.filter(
        (r) => r.status === "ACTUAL_ONLY_UNMATCHED_HH"
      ).length,
      missingForecastBeforeCutoffCount: intervals.filter(
        (r) => r.status === "MISSING_FORECAST_BEFORE_CUTOFF"
      ).length,
      missingActualCount: intervals.filter((r) => r.status === "MISSING_ACTUAL")
        .length,
    },
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Request logger middleware for API calls
  app.use("/api/v1", (req, res, next) => {
    const t0 = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - t0;
      console.log(`[WindSight API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
    });
    next();
  });

  // GET /api/v1/health
  app.get("/api/v1/health", async (_req, res) => {
    try {
      const bundle = await getDatasetBundle(false);
      res.json({
        status: "healthy",
        service: "windsight-api",
        provider: "Elexon BMRS API v1",
        upstreamStatus: bundle.upstreamStatus || "ONLINE",
        timezone: "Europe/London",
        historicalScope: "January 2026 (2026-01-01 to 2026-01-31)",
        fetchedAt: bundle.fetchedAt,
        rawCounts: bundle.rawCounts,
      });
    } catch (err: any) {
      res.status(503).json({
        status: "degraded",
        error: err?.message || "Failed to connect to Elexon BMRS dataset store",
      });
    }
  });

  // POST /api/v1/refresh
  app.post("/api/v1/refresh", async (_req, res) => {
    try {
      const bundle = await getDatasetBundle(true);
      res.json({
        status: "refreshed",
        fetchedAt: bundle.fetchedAt,
        upstreamStatus: bundle.upstreamStatus,
        lastFetchLatencyMs: bundle.lastFetchLatencyMs,
        rawCounts: bundle.rawCounts,
      });
    } catch (err: any) {
      res.status(502).json({
        status: "error",
        message: err?.message || "Failed to refresh from Elexon BMRS API",
      });
    }
  });

  // GET /api/v1/overview
  app.get("/api/v1/overview", async (req, res) => {
    try {
      const startDate = String(req.query.start_date || "2026-01-01");
      const endDate = String(req.query.end_date || "2026-01-31");
      const cutoffMode = (req.query.cutoff_mode as CutoffMode) || "d_minus_1_1100";
      const alignmentMode =
        (req.query.alignment_mode as AlignmentMode) || "strict_exact";
      const mapeThreshold = Number(req.query.mape_threshold ?? 100);

      if (startDate > endDate) {
        return res
          .status(400)
          .json({ error: "start_date must be before or equal to end_date." });
      }

      const bundle = await getDatasetBundle(false);
      const analysis = buildDatasetAnalysis(
        bundle,
        startDate,
        endDate,
        cutoffMode,
        alignmentMode,
        mapeThreshold
      );

      const highestErrorIntervals = [...analysis.matched]
        .sort((a, b) => (b.absErrorMw || 0) - (a.absErrorMw || 0))
        .slice(0, 12);

      const largestOverforecast =
        [...analysis.matched].sort(
          (a, b) => (b.signedErrorMw || -Infinity) - (a.signedErrorMw || -Infinity)
        )[0] || null;

      const largestUnderforecast =
        [...analysis.matched].sort(
          (a, b) => (a.signedErrorMw || Infinity) - (b.signedErrorMw || Infinity)
        )[0] || null;

      const timeSeries =
        alignmentMode === "strict_exact" ? analysis.matched : analysis.intervals;

      res.json({
        period: {
          startDate,
          endDate,
          timezone: "Europe/London",
        },
        config: {
          cutoffMode,
          alignmentMode,
          mapeMinActualMwThreshold: mapeThreshold,
        },
        fetchedAt: bundle.fetchedAt,
        upstreamStatus: bundle.upstreamStatus || "ONLINE",
        kpis: analysis.kpis,
        timeSeries,
        highestErrorIntervals,
        operationalSummary: {
          largestOverforecast,
          largestUnderforecast,
          qualityStats: analysis.qualityStats,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal analytics error" });
    }
  });

  // GET /api/v1/forecasts
  app.get("/api/v1/forecasts", async (req, res) => {
    try {
      const deliveryDate = req.query.delivery_date
        ? String(req.query.delivery_date)
        : null;
      const startDate = deliveryDate || String(req.query.start_date || "2026-01-01");
      const endDate = deliveryDate || String(req.query.end_date || "2026-01-31");
      const cutoffMode = (req.query.cutoff_mode as CutoffMode) || "d_minus_1_1100";
      const alignmentMode =
        (req.query.alignment_mode as AlignmentMode) || "strict_exact";
      const mapeThreshold = Number(req.query.mape_threshold ?? 100);
      const statusFilter = String(req.query.status || "ALL");
      const timeWindow = String(req.query.time_window || "ALL");
      const search = String(req.query.search || "").trim().toLowerCase();
      const sortBy = String(req.query.sort_by || "startTime");
      const sortDir = String(req.query.sort_dir || "asc");
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(2000, Math.max(10, Number(req.query.page_size || 48)));

      const bundle = await getDatasetBundle(false);
      const analysis = buildDatasetAnalysis(
        bundle,
        startDate,
        endDate,
        cutoffMode,
        alignmentMode,
        mapeThreshold
      );

      let filtered = analysis.intervals;

      if (statusFilter === "MATCHED") {
        filtered = filtered.filter((r) => r.status === "MATCHED");
      } else if (statusFilter === "OVERFORECAST") {
        filtered = filtered.filter(
          (r) => r.status === "MATCHED" && (r.signedErrorMw || 0) > 0
        );
      } else if (statusFilter === "UNDERFORECAST") {
        filtered = filtered.filter(
          (r) => r.status === "MATCHED" && (r.signedErrorMw || 0) < 0
        );
      } else if (statusFilter === "UNMATCHED") {
        filtered = filtered.filter((r) => r.status !== "MATCHED");
      }

      if (timeWindow !== "ALL") {
        filtered = filtered.filter((r) => {
          const hr = Number(r.deliveryTimeLondon.split(":")[0]);
          if (timeWindow === "NIGHT_00_06") return hr >= 0 && hr < 6;
          if (timeWindow === "MORNING_06_12") return hr >= 6 && hr < 12;
          if (timeWindow === "AFTERNOON_12_18") return hr >= 12 && hr < 18;
          if (timeWindow === "EVENING_PEAK_16_20") return hr >= 16 && hr < 20;
          if (timeWindow === "EVENING_18_24") return hr >= 18 && hr < 24;
          return true;
        });
      }

      if (search) {
        filtered = filtered.filter(
          (r) =>
            r.startTimeLondon.toLowerCase().includes(search) ||
            r.deliveryDate.toLowerCase().includes(search) ||
            r.deliveryTimeLondon.toLowerCase().includes(search) ||
            `sp${r.settlementPeriod}`.includes(search) ||
            (r.publishTimeLondon && r.publishTimeLondon.toLowerCase().includes(search))
        );
      }

      filtered.sort((a, b) => {
        let va: any;
        let vb: any;
        if (sortBy === "absErrorMw") {
          va = a.absErrorMw ?? -1;
          vb = b.absErrorMw ?? -1;
        } else if (sortBy === "signedErrorMw") {
          va = a.signedErrorMw ?? -999999;
          vb = b.signedErrorMw ?? -999999;
        } else if (sortBy === "actualMw") {
          va = a.actualMw ?? -1;
          vb = b.actualMw ?? -1;
        } else if (sortBy === "forecastMw") {
          va = a.forecastMw ?? -1;
          vb = b.forecastMw ?? -1;
        } else if (sortBy === "leadTimeHours") {
          va = a.leadTimeHours ?? -1;
          vb = b.leadTimeHours ?? -1;
        } else {
          va = a.startTime;
          vb = b.startTime;
        }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });

      const totalCount = filtered.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      const startIndex = (page - 1) * pageSize;
      const items = filtered.slice(startIndex, startIndex + pageSize);

      res.json({
        page,
        pageSize,
        totalCount,
        totalPages,
        config: { cutoffMode, alignmentMode },
        items,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Error loading forecasts" });
    }
  });

  // GET /api/v1/forecasts/vintages?start_time=2026-01-15T12:00:00Z
  app.get("/api/v1/forecasts/vintages", async (req, res) => {
    try {
      const startTimeParam = String(req.query.start_time || "");
      const cutoffMode = (req.query.cutoff_mode as CutoffMode) || "d_minus_1_1100";
      const alignmentMode =
        (req.query.alignment_mode as AlignmentMode) || "strict_exact";

      if (!startTimeParam) {
        return res.status(400).json({ error: "start_time query param is required" });
      }

      const targetDate = new Date(startTimeParam);
      const targetIso = targetDate.toISOString().replace(".000Z", "Z");
      const londonParts = getLondonDateAndHour(targetDate);

      let lookupIso = targetIso;
      if (alignmentMode === "hh_step" && londonParts.minute === 30) {
        lookupIso = new Date(targetDate.getTime() - 30 * 60_000)
          .toISOString()
          .replace(".000Z", "Z");
      }

      const bundle = await getDatasetBundle(false);
      const analysis = buildDatasetAnalysis(
        bundle,
        londonParts.dateStr,
        londonParts.dateStr,
        cutoffMode,
        alignmentMode,
        100
      );

      const actualRec = analysis.actualByStart.get(targetIso);
      const actualMw = actualRec ? actualRec.generation : null;
      const rawVintages = analysis.forecastMap.get(lookupIso) || [];
      const cutoffUtc = computeDecisionCutoffUtc(targetDate, cutoffMode);
      const cutoffMs = cutoffUtc.getTime();

      const eligible = rawVintages.filter((v) => v.publishMs <= cutoffMs);
      const selectedPub =
        eligible.length > 0 ? eligible[eligible.length - 1].publishTime : null;

      const vintages = rawVintages.map((v) => {
        const isEligible = v.publishMs <= cutoffMs;
        const isSelected = v.publishTime === selectedPub;
        const leadTimeHours = Number(
          ((targetDate.getTime() - v.publishMs) / 3600_000).toFixed(2)
        );
        const signedErrorMw =
          actualMw !== null ? Number((v.generation - actualMw).toFixed(1)) : null;
        const absErrorMw =
          signedErrorMw !== null ? Number(Math.abs(signedErrorMw).toFixed(1)) : null;

        return {
          publishTime: v.publishTime,
          publishTimeLondon: formatLondonDisplay(new Date(v.publishMs)),
          generationMw: v.generation,
          leadTimeHours,
          eligibleBeforeCutoff: isEligible,
          isSelected,
          signedErrorMw,
          absErrorMw,
        };
      });

      res.json({
        startTime: targetIso,
        startTimeLondon: formatLondonDisplay(targetDate),
        lookupForecastHour: lookupIso,
        actualMw,
        cutoffMode,
        cutoffTimeUtc: cutoffUtc.toISOString().replace(".000Z", "Z"),
        cutoffTimeLondon: formatLondonDisplay(cutoffUtc),
        selectedPublishTime: selectedPub,
        vintages,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Error loading vintage audit" });
    }
  });

  // GET /api/v1/accuracy
  app.get("/api/v1/accuracy", async (req, res) => {
    try {
      const startDate = String(req.query.start_date || "2026-01-01");
      const endDate = String(req.query.end_date || "2026-01-31");
      const cutoffMode = (req.query.cutoff_mode as CutoffMode) || "d_minus_1_1100";
      const alignmentMode =
        (req.query.alignment_mode as AlignmentMode) || "strict_exact";
      const mapeThreshold = Number(req.query.mape_threshold ?? 100);

      const bundle = await getDatasetBundle(false);
      const analysis = buildDatasetAnalysis(
        bundle,
        startDate,
        endDate,
        cutoffMode,
        alignmentMode,
        mapeThreshold
      );

      // 1. Daily summary metrics
      const byDay = new Map<string, IntervalAnalysisRow[]>();
      for (const r of analysis.intervals) {
        const list = byDay.get(r.deliveryDate) || [];
        list.push(r);
        byDay.set(r.deliveryDate, list);
      }

      const dailySummaries = Array.from(byDay.entries()).map(([date, rows]) => {
        const m = rows.filter((x) => x.status === "MATCHED");
        const count = m.length;
        const dur = alignmentMode === "strict_exact" ? 1.0 : 0.5;
        const sumAct = m.reduce((s, x) => s + (x.actualMw || 0), 0);
        const sumFc = m.reduce((s, x) => s + (x.forecastMw || 0), 0);
        const sumAbs = m.reduce((s, x) => s + (x.absErrorMw || 0), 0);
        const sumSigned = m.reduce((s, x) => s + (x.signedErrorMw || 0), 0);
        const sumSq = m.reduce(
          (s, x) => s + Math.pow(x.signedErrorMw || 0, 2),
          0
        );
        const maxAbs = m.reduce((mx, x) => Math.max(mx, x.absErrorMw || 0), 0);
        const validPct = m.filter(
          (x) => (x.actualMw || 0) > mapeThreshold && x.pctError !== null
        );
        const mape =
          validPct.length > 0
            ? Number(
                (
                  validPct.reduce((s, x) => s + (x.pctError || 0), 0) /
                  validPct.length
                ).toFixed(2)
              )
            : null;

        return {
          date,
          matchedIntervals: count,
          totalHalfHours: rows.length,
          actualEnergyMwh: Number((sumAct * dur).toFixed(1)),
          forecastEnergyMwh: Number((sumFc * dur).toFixed(1)),
          actualAvgMw: count > 0 ? Number((sumAct / count).toFixed(1)) : 0,
          forecastAvgMw: count > 0 ? Number((sumFc / count).toFixed(1)) : 0,
          maeMw: count > 0 ? Number((sumAbs / count).toFixed(1)) : 0,
          rmseMw: count > 0 ? Number(Math.sqrt(sumSq / count).toFixed(1)) : 0,
          biasMw: count > 0 ? Number((sumSigned / count).toFixed(1)) : 0,
          maxAbsErrorMw: Number(maxAbs.toFixed(1)),
          mapePct: mape,
        };
      });

      // 2. Hour-of-day error profile (00:00 to 23:00)
      const byHour = new Map<string, IntervalAnalysisRow[]>();
      for (const r of analysis.matched) {
        const hourKey = `${r.deliveryTimeLondon.split(":")[0]}:00`;
        const list = byHour.get(hourKey) || [];
        list.push(r);
        byHour.set(hourKey, list);
      }

      const hourlyProfile = Array.from(byHour.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([hour, rows]) => {
          const c = rows.length;
          const mae =
            c > 0
              ? Number(
                  (
                    rows.reduce((s, x) => s + (x.absErrorMw || 0), 0) / c
                  ).toFixed(1)
                )
              : 0;
          const bias =
            c > 0
              ? Number(
                  (
                    rows.reduce((s, x) => s + (x.signedErrorMw || 0), 0) / c
                  ).toFixed(1)
                )
              : 0;
          const rmse =
            c > 0
              ? Number(
                  Math.sqrt(
                    rows.reduce(
                      (s, x) => s + Math.pow(x.signedErrorMw || 0, 2),
                      0
                    ) / c
                  ).toFixed(1)
                )
              : 0;
          const avgActualMw =
            c > 0
              ? Number(
                  (rows.reduce((s, x) => s + (x.actualMw || 0), 0) / c).toFixed(1)
                )
              : 0;
          const avgForecastMw =
            c > 0
              ? Number(
                  (
                    rows.reduce((s, x) => s + (x.forecastMw || 0), 0) / c
                  ).toFixed(1)
                )
              : 0;
          return { hour, count: c, maeMw: mae, rmseMw: rmse, biasMw: bias, avgActualMw, avgForecastMw };
        });

      // 3. Signed Error Histogram Distribution (-5000 MW to +5000 MW in 500 MW bins)
      const binWidth = 500;
      const bins: Array<{
        rangeLabel: string;
        binCenterMw: number;
        count: number;
        direction: "UNDERFORECAST" | "OVERFORECAST" | "NEUTRAL";
      }> = [];
      for (let b = -4000; b <= 3500; b += binWidth) {
        const low = b;
        const high = b + binWidth;
        const count = analysis.matched.filter((r) => {
          const e = r.signedErrorMw || 0;
          if (b === -4000) return e < high;
          if (b === 3500) return e >= low;
          return e >= low && e < high;
        }).length;
        bins.push({
          rangeLabel:
            b === -4000
              ? `< -3500`
              : b === 3500
              ? `>= +3500`
              : `${low >= 0 ? "+" : ""}${low} to ${high >= 0 ? "+" : ""}${high}`,
          binCenterMw: low + binWidth / 2,
          count,
          direction: low + binWidth / 2 < 0 ? "UNDERFORECAST" : "OVERFORECAST",
        });
      }

      // 4. Cutoff Sensitivity Comparison across all 5 cutoff modes
      const cutoffModes: Array<{ mode: CutoffMode; label: string; description: string }> = [
        {
          mode: "d_minus_1_1100",
          label: "D-1 11:00 GMT (Default Gate Closure)",
          description: "GB Day-Ahead Auction gate closure (selects D-1 09:30Z run)",
        },
        {
          mode: "d_minus_1_1200",
          label: "D-1 12:00 GMT (Midday Run)",
          description: "Post-11:30Z morning forecast run before afternoon trading",
        },
        {
          mode: "d_minus_1_1830",
          label: "D-1 18:30 GMT (Evening EFA Cutoff)",
          description: "Evening block procurement cutoff (selects D-1 18:30Z run)",
        },
        {
          mode: "lead_time_12h",
          label: "Rolling >= 12h Lead Time",
          description: "Latest forecast published at least 12 hours before startTime",
        },
        {
          mode: "lead_time_4h",
          label: "Rolling >= 4h Lead Time",
          description: "Intraday benchmark: latest forecast >= 4 hours before startTime",
        },
      ];

      const cutoffComparison = cutoffModes.map((cm) => {
        const sub = buildDatasetAnalysis(
          bundle,
          startDate,
          endDate,
          cm.mode,
          alignmentMode,
          mapeThreshold
        );
        const avgLead =
          sub.matched.length > 0
            ? Number(
                (
                  sub.matched.reduce((s, r) => s + (r.leadTimeHours || 0), 0) /
                  sub.matched.length
                ).toFixed(1)
              )
            : 0;
        return {
          mode: cm.mode,
          label: cm.label,
          description: cm.description,
          matchedCount: sub.kpis.matchedIntervalCount,
          avgLeadTimeHours: avgLead,
          maeMw: sub.kpis.maeMw,
          rmseMw: sub.kpis.rmseMw,
          biasMw: sub.kpis.biasMw,
          mapePct: sub.kpis.mapePct,
        };
      });

      res.json({
        period: { startDate, endDate, timezone: "Europe/London" },
        config: { cutoffMode, alignmentMode, mapeMinActualMwThreshold: mapeThreshold },
        kpis: analysis.kpis,
        dailySummaries,
        hourlyProfile,
        errorHistogram: bins,
        cutoffComparison,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Error computing accuracy analysis" });
    }
  });

  // GET /api/v1/data-quality
  app.get("/api/v1/data-quality", async (req, res) => {
    try {
      const startDate = String(req.query.start_date || "2026-01-01");
      const endDate = String(req.query.end_date || "2026-01-31");
      const cutoffMode = (req.query.cutoff_mode as CutoffMode) || "d_minus_1_1100";
      const alignmentMode =
        (req.query.alignment_mode as AlignmentMode) || "strict_exact";

      const bundle = await getDatasetBundle(false);
      const analysis = buildDatasetAnalysis(
        bundle,
        startDate,
        endDate,
        cutoffMode,
        alignmentMode,
        100
      );

      const byDay = new Map<string, IntervalAnalysisRow[]>();
      for (const r of analysis.intervals) {
        const list = byDay.get(r.deliveryDate) || [];
        list.push(r);
        byDay.set(r.deliveryDate, list);
      }

      const dailyCoverage = Array.from(byDay.entries()).map(([date, rows]) => {
        const expectedHalfHours = 48;
        const actualPresent = rows.filter((r) => r.actualMw !== null).length;
        const forecastMatched = rows.filter((r) => r.status === "MATCHED").length;
        const unmatchedHh = rows.filter(
          (r) => r.status === "ACTUAL_ONLY_UNMATCHED_HH"
        ).length;
        const missingForecastCutoff = rows.filter(
          (r) => r.status === "MISSING_FORECAST_BEFORE_CUTOFF"
        ).length;
        const missingActual = rows.filter(
          (r) => r.status === "MISSING_ACTUAL"
        ).length;

        return {
          date,
          expectedHalfHours,
          actualPresent,
          forecastMatched,
          unmatchedHh,
          missingForecastCutoff,
          missingActual,
          completenessPct: Number(
            (
              (forecastMatched /
                (alignmentMode === "strict_exact" ? 24 : 48)) *
              100
            ).toFixed(1)
          ),
        };
      });

      res.json({
        retrievalState: "SUCCESS",
        upstreamStatus: bundle.upstreamStatus || "ONLINE",
        fetchedAt: bundle.fetchedAt,
        source: bundle.source,
        config: { cutoffMode, alignmentMode },
        summary: analysis.qualityStats,
        dailyCoverage,
        schemaNotes: [
          {
            dataset: "FUELHH (Actual Wind Generation)",
            endpoint: "/datasets/FUELHH/stream?settlementDateFrom=2026-01-01&settlementDateTo=2026-01-31&fuelType=WIND",
            granularity: "30-minute Settlement Periods (SP1–SP48 per day, 1,488 intervals in Jan 2026)",
            unit: "MW (Average power over 30-min settlement period; Energy = MW × 0.5h MWh)",
          },
          {
            dataset: "WINDFOR (National Wind Generation Forecast)",
            endpoint: "/datasets/WINDFOR/stream?publishDateTimeFrom=2025-12-28T00:00:00Z&publishDateTimeTo=2026-01-31T23:59:59Z",
            granularity: "60-minute target startTime (:00:00Z, 744 target hours in Jan 2026 across 8 daily forecast publication runs at 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30 UTC)",
            unit: "MW (Forecast generation power at target hour startTime)",
          },
        ],
      });
    } catch (err: any) {
      res.status(500).json({
        retrievalState: "API_FAILURE",
        error: err?.message || "Failed to evaluate data quality",
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`WindSight Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
