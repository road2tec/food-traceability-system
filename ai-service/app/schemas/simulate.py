from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from .predict import Category


class Scenario(str, Enum):
    NORMAL = "NORMAL"
    TEMP_EXCURSION = "TEMP_EXCURSION"
    COOLING_FAILURE = "COOLING_FAILURE"
    TRANSPORT_DELAY = "TRANSPORT_DELAY"
    VARIABLE_HUMIDITY = "VARIABLE_HUMIDITY"
    MULTI_HANDOVER = "MULTI_HANDOVER"
    MISSING_READINGS = "MISSING_READINGS"
    INVALID_READINGS = "INVALID_READINGS"


class SimulateRequest(BaseModel):
    category: Category
    scenario: Scenario
    durationHours: float = Field(72, gt=0, le=24 * 365)
    count: int = Field(24, ge=1, le=10000)
    seed: int = 0
    startTime: Optional[datetime] = None


class SimRecord(BaseModel):
    timestamp: str
    temperatureC: Optional[float]
    humidityPct: Optional[float]
    location: str
    eventType: str
    remarks: str
    simulated: bool = True


class SimulateResponse(BaseModel):
    records: list[SimRecord]
    seed: int
    scenario: str
    notice: str
