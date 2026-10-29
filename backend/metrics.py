"""
Statistical Forecast Accuracy Metrics Engine for UK Wind Generation Analysis.

Strict Definitions:
- Signed Error (MW) = Forecast Generation (MW) - Actual Generation (MW)
  (Positive = Overforecast; Negative = Underforecast)
- Absolute Error (MW) = |Forecast - Actual|
- MAE (MW) = Mean(|Forecast - Actual|) across valid matched intervals
- RMSE (MW) = Sqrt(Mean((Forecast - Actual)^2)) across valid matched intervals
- Bias (MW) = Mean(Forecast - Actual) across valid matched intervals
- MAPE (%) = Mean(|Forecast - Actual| / Actual) * 100 across valid matched intervals
  where Actual > min_actual_mw_threshold (documented zero/low-denominator guard).
- Missing values are NEVER replaced with zero.
"""

import math
from typing import Dict, List, Any, Optional


def compute_percentile(sorted_vals: List[float], q: float) -> float:
    """Compute linear interpolated percentile for a pre-sorted list of floats (0 <= q <= 100)."""
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return round(sorted_vals[0], 2)
    pos = (len(sorted_vals) - 1) * (q / 100.0)
    base = int(math.floor(pos))
    rest = pos - base
    if base + 1 < len(sorted_vals):
        val = sorted_vals[base] + rest * (sorted_vals[base + 1] - sorted_vals[base])
    else:
        val = sorted_vals[base]
    return round(val, 2)


def calculate_accuracy_metrics(
    matched_records: List[Dict[str, Any]],
    interval_duration_hours: float = 0.5,
    mape_min_actual_mw_threshold: float = 100.0,
) -> Dict[str, Any]:
    """
    Calculate statistical accuracy metrics strictly on valid matched interval pairs
    where both actualMw and forecastMw are non-null.
    """
    valid = [
        r
        for r in matched_records
        if r.get("status") == "MATCHED"
        and r.get("actualMw") is not None
        and r.get("forecastMw") is not None
    ]

    n = len(valid)
    if n == 0:
        return {
            "matchedIntervalCount": 0,
            "actualEnergyMwh": 0.0,
            "forecastEnergyMwh": 0.0,
            "actualAvgPowerMw": 0.0,
            "forecastAvgPowerMw": 0.0,
            "maeMw": 0.0,
            "rmseMw": 0.0,
            "biasMw": 0.0,
            "mapePct": None,
            "mapeValidCount": 0,
            "mapeExcludedCount": 0,
            "mapeMinActualMwThreshold": mape_min_actual_mw_threshold,
            "intervalDurationHours": interval_duration_hours,
            "percentilesSignedMw": {"p05": 0.0, "p25": 0.0, "p50": 0.0, "p75": 0.0, "p95": 0.0},
            "percentilesAbsMw": {"p50": 0.0, "p75": 0.0, "p90": 0.0, "p95": 0.0},
            "overforecastCount": 0,
            "underforecastCount": 0,
            "exactMatchCount": 0,
        }

    sum_actual_mw = 0.0
    sum_forecast_mw = 0.0
    sum_signed_err = 0.0
    sum_abs_err = 0.0
    sum_sq_err = 0.0

    mape_terms: List[float] = []
    mape_excluded = 0

    signed_errors: List[float] = []
    abs_errors: List[float] = []

    over_count = 0
    under_count = 0
    exact_count = 0

    for r in valid:
        act = float(r["actualMw"])
        fc = float(r["forecastMw"])
        signed_err = fc - act
        abs_err = abs(signed_err)

        sum_actual_mw += act
        sum_forecast_mw += fc
        sum_signed_err += signed_err
        sum_abs_err += abs_err
        sum_sq_err += signed_err * signed_err

        signed_errors.append(signed_err)
        abs_errors.append(abs_err)

        if signed_err > 0:
            over_count += 1
        elif signed_err < 0:
            under_count += 1
        else:
            exact_count += 1

        if act > mape_min_actual_mw_threshold:
            mape_terms.append((abs_err / act) * 100.0)
        else:
            mape_excluded += 1

    signed_errors.sort()
    abs_errors.sort()

    mae = sum_abs_err / n
    rmse = math.sqrt(sum_sq_err / n)
    bias = sum_signed_err / n
    mape: Optional[float] = round(sum(mape_terms) / len(mape_terms), 2) if mape_terms else None

    return {
        "matchedIntervalCount": n,
        "actualEnergyMwh": round(sum_actual_mw * interval_duration_hours, 1),
        "forecastEnergyMwh": round(sum_forecast_mw * interval_duration_hours, 1),
        "actualAvgPowerMw": round(sum_actual_mw / n, 1),
        "forecastAvgPowerMw": round(sum_forecast_mw / n, 1),
        "maeMw": round(mae, 1),
        "rmseMw": round(rmse, 1),
        "biasMw": round(bias, 1),
        "mapePct": mape,
        "mapeValidCount": len(mape_terms),
        "mapeExcludedCount": mape_excluded,
        "mapeMinActualMwThreshold": mape_min_actual_mw_threshold,
        "intervalDurationHours": interval_duration_hours,
        "percentilesSignedMw": {
            "p05": compute_percentile(signed_errors, 5),
            "p25": compute_percentile(signed_errors, 25),
            "p50": compute_percentile(signed_errors, 50),
            "p75": compute_percentile(signed_errors, 75),
            "p95": compute_percentile(signed_errors, 95),
        },
        "percentilesAbsMw": {
            "p50": compute_percentile(abs_errors, 50),
            "p75": compute_percentile(abs_errors, 75),
            "p90": compute_percentile(abs_errors, 90),
            "p95": compute_percentile(abs_errors, 95),
        },
        "overforecastCount": over_count,
        "underforecastCount": under_count,
        "exactMatchCount": exact_count,
    }
