from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Category(str, Enum):
    FRUIT = "FRUIT"
    VEGETABLE = "VEGETABLE"
    DAIRY = "DAIRY"


class Range(BaseModel):
    model_config = ConfigDict(extra="ignore")
    min: float
    max: float

    @model_validator(mode="after")
    def _order(self):
        if self.min > self.max:
            raise ValueError("min must be <= max")
        return self


class QualityThresholds(BaseModel):
    model_config = ConfigDict(extra="ignore")
    safeAbove: float = Field(60, ge=0, le=100)
    flagAbove: float = Field(40, ge=0, le=100)

    @model_validator(mode="after")
    def _order(self):
        if self.flagAbove > self.safeAbove:
            raise ValueError("flagAbove must be <= safeAbove")
        return self


class KineticParams(BaseModel):
    """All kinetic parameters come from the caller (ProductType). Nothing is defaulted here."""
    model_config = ConfigDict(extra="ignore")
    referenceTempC: float = Field(ge=-50, le=80)
    referenceShelfLifeHours: float = Field(gt=0, le=1e6)
    activationEnergyJPerMol: float = Field(gt=0, le=1e6)
    source: Optional[str] = None
    isDemonstration: bool = False
    qualityThresholds: Optional[QualityThresholds] = None
    humidityRange: Optional[Range] = None          # optimal RH band (documented by caller)
    tempRange: Optional[Range] = None              # range in which the caller states parameters are valid
    humidityOutOfRangeAf: Optional[float] = Field(None, ge=1.0, le=100)  # optional documented multiplier
    humiditySource: Optional[str] = None

    @model_validator(mode="after")
    def _hum(self):
        if self.humidityOutOfRangeAf is not None:
            if self.humidityRange is None or not self.humiditySource:
                raise ValueError("humidityOutOfRangeAf requires humidityRange and humiditySource (citation)")
        return self


class CheckpointIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    timestamp: datetime
    temperatureC: Optional[float] = None
    humidityPct: Optional[float] = None
    eventType: Optional[str] = None


class PredictRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    batchId: str = Field(min_length=1)
    productCategory: Category
    productName: Optional[str] = None
    params: KineticParams
    initialQualityPct: float = Field(100, ge=0, le=100)
    producedAt: datetime
    checkpoints: list[CheckpointIn] = Field(min_length=1, max_length=100000)
    evaluateAt: Optional[datetime] = None
    gapWarningHours: float = Field(6, gt=0)   # data-quality heuristic, not a product parameter


class Factor(BaseModel):
    name: str
    impact: float
    detail: str


class PredictResponse(BaseModel):
    batchId: str
    freshnessScore: float
    remainingShelfLifeHours: float
    qualityLossPct: float
    riskCategory: str
    modelVersion: str
    modelType: str
    demonstrationMode: bool
    predictedAt: datetime
    uncertainty: Optional[dict[str, Any]] = None
    warnings: list[str]
    factors: list[Factor]
    effectiveAgeHours: float
    hoursAboveReferenceTemp: float
    disclaimer: str
