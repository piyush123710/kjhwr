"""
Automated unit tests for WindSight forecast selection, cutoff gating, duplicate handling,
missing value exclusion, and accuracy metric calculations.

Run with:
    python3 -m unittest discover -s backend/tests -v
"""

import unittest
from datetime import datetime, timezone
from backend.forecast_selector import (
    parse_iso_utc,
    compute_decision_cutoff_utc,
    deduplicate_actuals,
    group_and_deduplicate_forecasts,
    select_latest_eligible_forecast,
)
from backend.metrics import calculate_accuracy_metrics


class TestWindSightAnalytics(unittest.TestCase):
    def test_forecast_selection_before_cutoff_and_exclusion_after_cutoff(self):
        """
        Verify that for delivery interval 2026-01-15T14:00:00Z with D-1 11:00 UK cutoff
        (2026-01-14T11:00:00Z), the selector picks the latest forecast at or before 11:00Z
        (the 09:30Z run) and strictly excludes the 11:30Z, 15:30Z, and intraday runs.
        """
        raw_forecasts = [
            {"publishTime": "2026-01-14T07:30:00Z", "startTime": "2026-01-15T14:00:00Z", "generation": 12100},
            {"publishTime": "2026-01-14T09:30:00Z", "startTime": "2026-01-15T14:00:00Z", "generation": 12450},
            {"publishTime": "2026-01-14T11:30:00Z", "startTime": "2026-01-15T14:00:00Z", "generation": 12900},
            {"publishTime": "2026-01-15T09:30:00Z", "startTime": "2026-01-15T14:00:00Z", "generation": 13500},
        ]
        grouped, dup_count, inv_count = group_and_deduplicate_forecasts(raw_forecasts)
        self.assertEqual(dup_count, 0)
        self.assertEqual(inv_count, 0)

        target_dt = parse_iso_utc("2026-01-15T14:00:00Z")
        vintages = grouped["2026-01-15T14:00:00Z"]

        selected, cutoff_utc, annotated = select_latest_eligible_forecast(
            vintages, target_dt, cutoff_mode="d_minus_1_1100"
        )
        self.assertEqual(cutoff_utc, datetime(2026, 1, 14, 11, 0, 0, tzinfo=timezone.utc))
        self.assertIsNotNone(selected)
        self.assertEqual(selected["publishTime"], "2026-01-14T09:30:00Z")
        self.assertEqual(selected["generation"], 12450.0)

        # Verify intraday and post-cutoff vintages are flagged eligibleBeforeCutoff = False
        elig_flags = {v["publishTime"]: v["eligibleBeforeCutoff"] for v in annotated}
        self.assertTrue(elig_flags["2026-01-14T07:30:00Z"])
        self.assertTrue(elig_flags["2026-01-14T09:30:00Z"])
        self.assertFalse(elig_flags["2026-01-14T11:30:00Z"])
        self.assertFalse(elig_flags["2026-01-15T09:30:00Z"])

    def test_duplicate_record_handling(self):
        """Verify duplicate actuals keep the latest publishTime and count duplicates."""
        raw_actuals = [
            {
                "publishTime": "2026-01-10T12:30:00Z",
                "startTime": "2026-01-10T12:00:00Z",
                "settlementDate": "2026-01-10",
                "settlementPeriod": 25,
                "fuelType": "WIND",
                "generation": 14000,
            },
            {
                "publishTime": "2026-01-10T13:00:00Z",
                "startTime": "2026-01-10T12:00:00Z",
                "settlementDate": "2026-01-10",
                "settlementPeriod": 25,
                "fuelType": "WIND",
                "generation": 14250,
            },
        ]
        deduped, dup_count, inv_count = deduplicate_actuals(raw_actuals)
        self.assertEqual(dup_count, 1)
        self.assertEqual(inv_count, 0)
        self.assertEqual(deduped["2026-01-10T12:00:00Z"]["generation"], 14250.0)

    def test_mae_rmse_bias_and_missing_value_exclusion(self):
        """
        Verify MAE, RMSE, and Signed Bias with known synthetic values,
        and confirm missing intervals are never replaced with zero.
        Known example:
        Interval 1: Actual = 10,000 MW, Forecast = 9,000 MW -> Signed Error = -1,000 MW, Abs Error = 1,000 MW
        Interval 2: Actual = 12,000 MW, Forecast = 14,000 MW -> Signed Error = +2,000 MW, Abs Error = 2,000 MW
        Interval 3: Missing forecast -> Excluded from metric denominator
        Expected on 2 valid intervals:
        - MAE = (1000 + 2000) / 2 = 1500.0 MW
        - RMSE = sqrt((1000^2 + 2000^2) / 2) = sqrt(2,500,000) = 1581.1 MW
        - Bias = (-1000 + 2000) / 2 = +500.0 MW
        """
        records = [
            {"status": "MATCHED", "actualMw": 10000.0, "forecastMw": 9000.0},
            {"status": "MATCHED", "actualMw": 12000.0, "forecastMw": 14000.0},
            {"status": "MISSING_FORECAST_BEFORE_CUTOFF", "actualMw": 11500.0, "forecastMw": None},
            {"status": "MISSING_ACTUAL", "actualMw": None, "forecastMw": 10800.0},
        ]
        metrics = calculate_accuracy_metrics(records, interval_duration_hours=1.0, mape_min_actual_mw_threshold=100.0)
        self.assertEqual(metrics["matchedIntervalCount"], 2)
        self.assertAlmostEqual(metrics["maeMw"], 1500.0, places=1)
        self.assertAlmostEqual(metrics["rmseMw"], 1581.1, places=1)
        self.assertAlmostEqual(metrics["biasMw"], 500.0, places=1)

    def test_month_boundary_cutoff_jan_1_uses_dec_31(self):
        """
        Verify that delivery on 2026-01-01T00:00:00Z resolves its D-1 11:00 Europe/London
        cutoff across the year/month boundary to 2025-12-31T11:00:00Z.
        """
        jan1_start = parse_iso_utc("2026-01-01T00:00:00Z")
        cutoff = compute_decision_cutoff_utc(jan1_start, "d_minus_1_1100")
        self.assertEqual(cutoff, datetime(2025, 12, 31, 11, 0, 0, tzinfo=timezone.utc))


if __name__ == "__main__":
    unittest.main()
