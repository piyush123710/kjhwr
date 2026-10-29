"""
Elexon BMRS API Client with local historical caching for January 2026 datasets:
- FUELHH/stream (Actual half-hourly generation by fuel type = WIND)
- WINDFOR/stream (National wind generation forecast vintages)
"""

import json
import os
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Tuple, List
import httpx

logger = logging.getLogger("windsight.elexon")

ELEXON_BASE_URL = os.getenv("ELEXON_API_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1")
DEFAULT_CACHE_PATH = os.getenv(
    "CACHE_FILE_PATH",
    str(Path(__file__).resolve().parent.parent / "data" / "elexon_jan2026_cache.json"),
)


class ElexonDataClient:
    def __init__(self, cache_path: str = DEFAULT_CACHE_PATH):
        self.cache_path = Path(cache_path)
        self._memory_cache: Dict[str, Any] | None = None

    def load_or_fetch(self, force_refresh: bool = False) -> Dict[str, Any]:
        if not force_refresh and self._memory_cache is not None:
            return self._memory_cache

        if not force_refresh and self.cache_path.exists():
            try:
                with open(self.cache_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._memory_cache = data
                return data
            except Exception as exc:
                logger.warning("Failed reading local cache %s: %s", self.cache_path, exc)

        return self.fetch_live_from_elexon()

    def fetch_live_from_elexon(self) -> Dict[str, Any]:
        """Fetch January 2026 FUELHH and WINDFOR stream datasets directly from Elexon BMRS API."""
        fuelhh_url = f"{ELEXON_BASE_URL}/datasets/FUELHH/stream"
        windfor_url = f"{ELEXON_BASE_URL}/datasets/WINDFOR/stream"

        with httpx.Client(timeout=25.0) as client:
            r_fuel = client.get(
                fuelhh_url,
                params={
                    "settlementDateFrom": "2026-01-01",
                    "settlementDateTo": "2026-01-31",
                    "fuelType": "WIND",
                },
            )
            r_fuel.raise_for_status()
            fuel_data: List[Dict[str, Any]] = r_fuel.json()

            r_wind = client.get(
                windfor_url,
                params={
                    "publishDateTimeFrom": "2025-12-28T00:00:00Z",
                    "publishDateTimeTo": "2026-01-31T23:59:59Z",
                },
            )
            r_wind.raise_for_status()
            wind_raw: List[Dict[str, Any]] = r_wind.json()

        wind_jan = [
            rec
            for rec in wind_raw
            if "2026-01-01T00:00:00Z" <= str(rec.get("startTime", "")) <= "2026-01-31T23:59:59Z"
        ]

        payload = {
            "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": f"Elexon BMRS API v1 ({ELEXON_BASE_URL})",
            "rawCounts": {
                "fuelhhRawTotal": len(fuel_data),
                "windforRawTotal": len(wind_raw),
                "windforJan2026TargetTotal": len(wind_jan),
            },
            "fuelhh": fuel_data,
            "windfor": wind_jan,
        }

        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.cache_path, "w", encoding="utf-8") as f:
                json.dump(payload, f)
        except Exception as exc:
            logger.warning("Could not write cache file %s: %s", self.cache_path, exc)

        self._memory_cache = payload
        return payload
