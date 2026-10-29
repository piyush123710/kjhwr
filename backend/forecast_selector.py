"""
Time-aware Day-Ahead Forecast Selection Engine for Elexon BMRS WINDFOR & FUELHH datasets.

Implements strict UK Day-Ahead electricity market decision cutoff conventions:
- startTime is the target delivery interval (UTC / Europe/London).
- publishTime is the forecast publication timestamp.
- Only forecasts with publishTime <= decision_cutoff(startTime) are eligible.
- Among eligible forecasts, selects the record with the maximum publishTime.
- Preserves all forecast vintages for historical decision-time auditing.
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Dict, List, Optional, Tuple, Any

LONDON_TZ = ZoneInfo("Europe/London")


def parse_iso_utc(ts: str) -> datetime:
    """Parse an ISO-8601 UTC timestamp string into a timezone-aware UTC datetime."""
    cleaned = ts.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    dt = datetime.fromisoformat(cleaned)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def format_iso_utc(dt: datetime) -> str:
    """Format a datetime as canonical YYYY-MM-DDTHH:MM:SSZ."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def format_london_display(dt: datetime) -> str:
    """Format a datetime in Europe/London timezone for analyst display."""
    local_dt = dt.astimezone(LONDON_TZ)
    return local_dt.strftime("%Y-%m-%d %H:%M %Z")


def compute_decision_cutoff_utc(start_time_utc: datetime, cutoff_mode: str = "d_minus_1_1100") -> datetime:
    """
    Compute the procurement decision cutoff timestamp in UTC for a given delivery interval startTime.

    Supported UK Market Cutoff Conventions:
    - 'd_minus_1_1100': Day D-1 at 11:00 Europe/London (GB Day-Ahead Auction Gate Closure convention)
    - 'd_minus_1_1200': Day D-1 at 12:00 Europe/London (Post-11:30Z Morning Forecast Run cutoff)
    - 'd_minus_1_1830': Day D-1 at 18:30 Europe/London (Evening EFA Block Procurement cutoff)
    - 'lead_time_4h': Rolling minimum lead time of 4 hours prior to startTime
    - 'lead_time_12h': Rolling minimum lead time of 12 hours prior to startTime
    """
    london_start = start_time_utc.astimezone(LONDON_TZ)
    delivery_date = london_start.date()
    d_minus_1 = delivery_date - timedelta(days=1)

    if cutoff_mode == "d_minus_1_1100":
        cutoff_local = datetime(d_minus_1.year, d_minus_1.month, d_minus_1.day, 11, 0, 0, tzinfo=LONDON_TZ)
        return cutoff_local.astimezone(timezone.utc)
    elif cutoff_mode == "d_minus_1_1200":
        cutoff_local = datetime(d_minus_1.year, d_minus_1.month, d_minus_1.day, 12, 0, 0, tzinfo=LONDON_TZ)
        return cutoff_local.astimezone(timezone.utc)
    elif cutoff_mode == "d_minus_1_1830":
        cutoff_local = datetime(d_minus_1.year, d_minus_1.month, d_minus_1.day, 18, 30, 0, tzinfo=LONDON_TZ)
        return cutoff_local.astimezone(timezone.utc)
    elif cutoff_mode == "lead_time_4h":
        return start_time_utc - timedelta(hours=4)
    elif cutoff_mode == "lead_time_12h":
        return start_time_utc - timedelta(hours=12)
    else:
        cutoff_local = datetime(d_minus_1.year, d_minus_1.month, d_minus_1.day, 11, 0, 0, tzinfo=LONDON_TZ)
        return cutoff_local.astimezone(timezone.utc)


def deduplicate_actuals(raw_actuals: List[Dict[str, Any]]) -> Tuple[Dict[str, Dict[str, Any]], int, int]:
    """
    Deduplicate and validate FUELHH actual records keyed by canonical startTime.
    If duplicate records exist for the same startTime, retain the record with the latest publishTime.
    Returns (deduped_map, duplicate_count, invalid_numeric_count).
    """
    by_start: Dict[str, Dict[str, Any]] = {}
    duplicates = 0
    invalid_numeric = 0

    for rec in raw_actuals:
        if rec.get("fuelType") and rec.get("fuelType") != "WIND":
            continue
        gen = rec.get("generation")
        if gen is None or not isinstance(gen, (int, float)) or gen < 0:
            invalid_numeric += 1
            continue
        try:
            start_dt = parse_iso_utc(rec["startTime"])
            pub_dt = parse_iso_utc(rec["publishTime"])
        except Exception:
            invalid_numeric += 1
            continue

        start_key = format_iso_utc(start_dt)
        normalized = {
            "startTime": start_key,
            "startDt": start_dt,
            "publishTime": format_iso_utc(pub_dt),
            "publishDt": pub_dt,
            "settlementDate": rec.get("settlementDate") or start_dt.astimezone(LONDON_TZ).strftime("%Y-%m-%d"),
            "settlementPeriod": int(rec.get("settlementPeriod", 1)),
            "generation": float(gen),
        }

        if start_key in by_start:
            duplicates += 1
            if pub_dt >= by_start[start_key]["publishDt"]:
                by_start[start_key] = normalized
        else:
            by_start[start_key] = normalized

    return by_start, duplicates, invalid_numeric


def group_and_deduplicate_forecasts(
    raw_forecasts: List[Dict[str, Any]],
) -> Tuple[Dict[str, List[Dict[str, Any]]], int, int]:
    """
    Group WINDFOR records by canonical startTime and deduplicate identical (startTime, publishTime) pairs.
    Sorts each interval's vintages ascending by publishTime.
    """
    grouped: Dict[str, Dict[str, Dict[str, Any]]] = {}
    duplicates = 0
    invalid_numeric = 0

    for rec in raw_forecasts:
        gen = rec.get("generation")
        if gen is None or not isinstance(gen, (int, float)) or gen < 0:
            invalid_numeric += 1
            continue
        try:
            start_dt = parse_iso_utc(rec["startTime"])
            pub_dt = parse_iso_utc(rec["publishTime"])
        except Exception:
            invalid_numeric += 1
            continue

        start_key = format_iso_utc(start_dt)
        pub_key = format_iso_utc(pub_dt)

        if start_key not in grouped:
            grouped[start_key] = {}

        if pub_key in grouped[start_key]:
            duplicates += 1

        grouped[start_key][pub_key] = {
            "startTime": start_key,
            "startDt": start_dt,
            "publishTime": pub_key,
            "publishDt": pub_dt,
            "generation": float(gen),
        }

    sorted_vintages: Dict[str, List[Dict[str, Any]]] = {}
    for start_key, pub_map in grouped.items():
        v_list = list(pub_map.values())
        v_list.sort(key=lambda x: x["publishDt"])
        sorted_vintages[start_key] = v_list

    return sorted_vintages, duplicates, invalid_numeric


def select_latest_eligible_forecast(
    vintages: List[Dict[str, Any]],
    start_time_utc: datetime,
    cutoff_mode: str = "d_minus_1_1100",
) -> Tuple[Optional[Dict[str, Any]], datetime, List[Dict[str, Any]]]:
    """
    Given a chronological list of forecast vintages for a single delivery interval startTime,
    select the single forecast with the latest publishTime <= cutoff_utc.
    Returns (selected_vintage_or_None, cutoff_utc, annotated_vintages).
    """
    cutoff_utc = compute_decision_cutoff_utc(start_time_utc, cutoff_mode)
    eligible = [v for v in vintages if v["publishDt"] <= cutoff_utc]
    selected = eligible[-1] if eligible else None

    annotated = []
    for v in vintages:
        is_elig = v["publishDt"] <= cutoff_utc
        is_sel = selected is not None and v["publishTime"] == selected["publishTime"]
        lead_hours = round((start_time_utc - v["publishDt"]).total_seconds() / 3600.0, 2)
        annotated.append(
            {
                "publishTime": v["publishTime"],
                "publishTimeLondon": format_london_display(v["publishDt"]),
                "generationMw": v["generation"],
                "leadTimeHours": lead_hours,
                "eligibleBeforeCutoff": is_elig,
                "isSelected": is_sel,
            }
        )

    return selected, cutoff_utc, annotated
