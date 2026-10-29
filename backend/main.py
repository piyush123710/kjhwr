"""
WindSight FastAPI Backend Application.
Provides versioned REST endpoints (/api/v1/*) for UK National Wind Generation Day-Ahead Analytics.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .elexon_client import ElexonDataClient
from .forecast_selector import (
    LONDON_TZ,
    parse_iso_utc,
    format_iso_utc,
    format_london_display,
    compute_decision_cutoff_utc,
    deduplicate_actuals,
    group_and_deduplicate_forecasts,
    select_latest_eligible_forecast,
)
from .metrics import calculate_accuracy_metrics

app = FastAPI(
    title="WindSight API — UK Wind Forecast & Day-Ahead Trading Intelligence",
    version="1.0.0",
    description="Time-aware day-ahead wind generation forecast evaluation engine powered by Elexon BMRS FUELHH and WINDFOR datasets for January 2026.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = ElexonDataClient()


def build_january_2026_dataset(
    start_date: str = "2026-01-01",
    end_date: str = "2026-01-31",
    cutoff_mode: str = "d_minus_1_1100",
    alignment_mode: str = "strict_exact",
    mape_threshold: float = 100.0,
) -> Dict[str, Any]:
    raw_bundle = client.load_or_fetch()
    actual_map, dup_actuals, invalid_actuals = deduplicate_actuals(raw_bundle.get("fuelhh", []))
    forecast_vintages_map, dup_forecasts, invalid_forecasts = group_and_deduplicate_forecasts(
        raw_bundle.get("windfor", [])
    )

    # Generate canonical 30-minute timeline for January 2026 within [start_date, end_date]
    start_dt = datetime.fromisoformat(f"{start_date}T00:00:00+00:00")
    end_dt = datetime.fromisoformat(f"{end_date}T23:30:00+00:00")

    intervals: List[Dict[str, Any]] = []
    cur = start_dt
    while cur <= end_dt:
        ts_key = format_iso_utc(cur)
        london_dt = cur.astimezone(LONDON_TZ)
        delivery_date_str = london_dt.strftime("%Y-%m-%d")
        sp = (london_dt.hour * 2) + (1 if london_dt.minute == 0 else 2)

        actual_rec = actual_map.get(ts_key)
        actual_mw = actual_rec["generation"] if actual_rec else None

        # Lookup forecast vintages:
        # In strict_exact mode, only match exact startTime (hourly :00:00Z in WINDFOR).
        # In hh_step mode, :30:00Z settlement periods inherit the parent hour's (:00:00Z) WINDFOR forecast.
        if alignment_mode == "hh_step" and cur.minute == 30:
            hour_start = cur.replace(minute=0, second=0, microsecond=0)
            lookup_key = format_iso_utc(hour_start)
        else:
            lookup_key = ts_key

        vintages = forecast_vintages_map.get(lookup_key, [])
        selected_fc, cutoff_utc, annotated_vintages = select_latest_eligible_forecast(
            vintages, cur, cutoff_mode
        )

        forecast_mw = selected_fc["generation"] if selected_fc else None
        pub_time = selected_fc["publishTime"] if selected_fc else None
        pub_london = format_london_display(selected_fc["publishDt"]) if selected_fc else None
        lead_hours = (
            round((cur - selected_fc["publishDt"]).total_seconds() / 3600.0, 2)
            if selected_fc
            else None
        )

        if actual_mw is not None and forecast_mw is not None:
            status = "MATCHED"
            signed_err = round(forecast_mw - actual_mw, 1)
            abs_err = round(abs(signed_err), 1)
            pct_err = round((abs_err / actual_mw) * 100.0, 2) if actual_mw > mape_threshold else None
        elif actual_mw is not None and forecast_mw is None:
            status = "ACTUAL_ONLY_UNMATCHED_HH" if len(vintages) == 0 else "MISSING_FORECAST_BEFORE_CUTOFF"
            signed_err = None
            abs_err = None
            pct_err = None
        else:
            status = "MISSING_ACTUAL"
            signed_err = None
            abs_err = None
            pct_err = None

        interval_hours = 1.0 if alignment_mode == "strict_exact" else 0.5

        intervals.append(
            {
                "startTime": ts_key,
                "startTimeLondon": format_london_display(cur),
                "deliveryDate": delivery_date_str,
                "deliveryTimeLondon": london_dt.strftime("%H:%M"),
                "settlementPeriod": sp,
                "actualMw": actual_mw,
                "forecastMw": forecast_mw,
                "actualMwh": round(actual_mw * interval_hours, 1) if actual_mw is not None else None,
                "forecastMwh": round(forecast_mw * interval_hours, 1) if forecast_mw is not None else None,
                "publishTime": pub_time,
                "publishTimeLondon": pub_london,
                "cutoffTimeUtc": format_iso_utc(cutoff_utc),
                "cutoffTimeLondon": format_london_display(cutoff_utc),
                "leadTimeHours": lead_hours,
                "signedErrorMw": signed_err,
                "absErrorMw": abs_err,
                "pctError": pct_err,
                "status": status,
                "vintageCountTotal": len(vintages),
                "vintageCountEligible": sum(1 for v in annotated_vintages if v["eligibleBeforeCutoff"]),
            }
        )
        cur += timedelta(minutes=30)

    interval_duration_hours = 1.0 if alignment_mode == "strict_exact" else 0.5
    metrics = calculate_accuracy_metrics(intervals, interval_duration_hours, mape_threshold)

    return {
        "rawBundle": raw_bundle,
        "intervals": intervals,
        "metrics": metrics,
        "qualityCounters": {
            "duplicateActuals": dup_actuals,
            "invalidActuals": invalid_actuals,
            "duplicateForecasts": dup_forecasts,
            "invalidForecasts": invalid_forecasts,
        },
    }


@app.get("/api/v1/health")
def get_health():
    bundle = client.load_or_fetch()
    return {
        "status": "healthy",
        "service": "windsight-api",
        "provider": "Elexon BMRS API v1",
        "timezone": "Europe/London",
        "historicalScope": "2026-01-01 to 2026-01-31",
        "fetchedAt": bundle.get("fetchedAt"),
        "rawCounts": bundle.get("rawCounts"),
    }


@app.get("/api/v1/overview")
def get_overview(
    start_date: str = Query("2026-01-01", pattern=r"^2026-01-(0[1-9]|[12]\d|3[01])$"),
    end_date: str = Query("2026-01-31", pattern=r"^2026-01-(0[1-9]|[12]\d|3[01])$"),
    cutoff_mode: str = Query("d_minus_1_1100"),
    alignment_mode: str = Query("strict_exact"),
    mape_threshold: float = Query(100.0, ge=0.0),
):
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    res = build_january_2026_dataset(start_date, end_date, cutoff_mode, alignment_mode, mape_threshold)
    intervals = res["intervals"]
    matched = [r for r in intervals if r["status"] == "MATCHED"]
    top_errors = sorted(matched, key=lambda x: x["absErrorMw"] or 0, reverse=True)[:10]

    series = matched if alignment_mode == "strict_exact" else intervals
    return {
        "period": {"startDate": start_date, "endDate": end_date, "timezone": "Europe/London"},
        "config": {
            "cutoffMode": cutoff_mode,
            "alignmentMode": alignment_mode,
            "mapeMinActualMwThreshold": mape_threshold,
        },
        "fetchedAt": res["rawBundle"].get("fetchedAt"),
        "kpis": res["metrics"],
        "timeSeries": series,
        "highestErrorIntervals": top_errors,
    }
