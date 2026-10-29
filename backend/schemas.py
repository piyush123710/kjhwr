from typing import List, Optional, Literal
from pydantic import BaseModel, Field


CutoffMode = Literal[
    "d_minus_1_1100",
    "d_minus_1_1200",
    "d_minus_1_1830",
    "lead_time_4h",
    "lead_time_12h",
]

AlignmentMode = Literal["strict_exact", "hh_step"]


class FuelHHRecord(BaseModel):
    dataset: str = "FUELHH"
    publishTime: str
    startTime: str
    settlementDate: str
    settlementPeriod: int = Field(ge=1, le=50)
    fuelType: str = "WIND"
    generation: float


class WindForRecord(BaseModel):
    dataset: str = "WINDFOR"
    publishTime: str
    startTime: str
    generation: float


class ForecastVintageRecord(BaseModel):
    publishTime: str
    publishTimeLondon: str
    generationMw: float
    leadTimeHours: float
    eligibleBeforeCutoff: bool
    isSelected: bool
    signedErrorMw: Optional[float] = None


class MatchedIntervalRecord(BaseModel):
    startTime: str
    startTimeLondon: str
    deliveryDate: str
    deliveryTimeLondon: str
    settlementPeriod: int
    actualMw: Optional[float]
    forecastMw: Optional[float]
    actualMwh: Optional[float]
    forecastMwh: Optional[float]
    publishTime: Optional[str]
    publishTimeLondon: Optional[str]
    cutoffTimeUtc: str
    cutoffTimeLondon: str
    leadTimeHours: Optional[float]
    signedErrorMw: Optional[float]
    absErrorMw: Optional[float]
    pctError: Optional[float]
    status: Literal[
        "MATCHED",
        "ACTUAL_ONLY_UNMATCHED_HH",
        "MISSING_FORECAST_BEFORE_CUTOFF",
        "MISSING_ACTUAL",
    ]
    vintageCountTotal: int
    vintageCountEligible: int


class KPISummary(BaseModel):
    actualEnergyMwh: float
    forecastEnergyMwh: float
    actualAvgPowerMw: float
    forecastAvgPowerMw: float
    maeMw: float
    rmseMw: float
    biasMw: float
    mapePct: Optional[float]
    mapeValidCount: int
    mapeExcludedCount: int
    mapeMinActualMwThreshold: float
    matchedIntervalCount: int
    totalHalfHourSlotsInPeriod: int
    intervalDurationHours: float
