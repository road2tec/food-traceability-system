"""Physical baseline: Arrhenius acceleration with piecewise-constant integration.

AF(T) = exp( Ea/R * (1/Tref - 1/T) ), temperatures in kelvin.
effectiveAge = sum(dt_i * AF(T_i))   (T_i held constant over interval i)
See docs/AI_MODEL.md for assumptions.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from ..schemas.predict import KineticParams
from ..utils.timeutils import to_utc

R_GAS = 8.314462618  # J/(mol K)
KELVIN = 273.15
# Sensor plausibility bounds (physical sanity check, not product parameters).
TEMP_PLAUSIBLE = (-50.0, 80.0)
HUM_PLAUSIBLE = (0.0, 100.0)
# Score -> risk mapping default (demonstration policy; documented in docs/AI_MODEL.md).
LOW_MIN_SCORE = 80.0


class PredictionInputError(ValueError):
    """Input is syntactically valid but cannot be evaluated (HTTP 400)."""


def acceleration_factor(temp_c: float, ref_temp_c: float, ea_j_mol: float) -> float:
    return math.exp(ea_j_mol / R_GAS * (1.0 / (ref_temp_c + KELVIN) - 1.0 / (temp_c + KELVIN)))


def score_to_risk(score: float, safe_above: float = 60.0, flag_above: float = 40.0) -> str:
    """score>=80 (and > safe_above) LOW; safe_above<score<80 MODERATE; flag_above<=score<=safe_above HIGH; else CRITICAL."""
    if score > safe_above and score >= LOW_MIN_SCORE:
        return "LOW"
    if score > safe_above:
        return "MODERATE"
    if score >= flag_above:
        return "HIGH"
    return "CRITICAL"


@dataclass
class Segment:
    start: datetime
    end: datetime
    temp_c: float
    hum: Optional[float]
    hours: float
    af: float


@dataclass
class BaselineResult:
    score: float
    remaining_h: float
    quality_loss: float
    risk: str
    effective_age_h: float
    hours_above_ref: float
    total_hours: float
    mean_temp_c: float
    max_temp_c: float
    min_temp_c: float
    latest_temp_c: float
    latest_af: float
    mean_hum: Optional[float]
    hours_out_of_hum_range: float
    n_valid: int
    n_total: int
    warnings: list = field(default_factory=list)
    factors: list = field(default_factory=list)
    evaluate_at: Optional[datetime] = None


def _finite(x) -> bool:
    return x is not None and isinstance(x, (int, float)) and math.isfinite(x)


def compute_baseline(
    params: KineticParams,
    produced_at: datetime,
    checkpoints: list,
    initial_quality_pct: float = 100.0,
    evaluate_at: Optional[datetime] = None,
    gap_warning_hours: float = 6.0,
) -> BaselineResult:
    warnings: list = []
    produced = to_utc(produced_at)
    if len(checkpoints) == 0:
        raise PredictionInputError("At least one checkpoint is required")

    if any(c.timestamp.tzinfo is None for c in checkpoints):
        warnings.append("Some timestamps had no timezone and were interpreted as UTC.")

    pts = [(to_utc(c.timestamp), c.temperatureC, c.humidityPct) for c in checkpoints]
    if any(pts[i][0] < pts[i - 1][0] for i in range(1, len(pts))):
        warnings.append("Checkpoints were not in chronological order and were sorted by timestamp.")
    pts.sort(key=lambda p: p[0])

    before = [p for p in pts if p[0] < produced]
    if before:
        warnings.append(f"{len(before)} checkpoint(s) before producedAt were ignored.")
        pts = [p for p in pts if p[0] >= produced]
    if not pts:
        raise PredictionInputError("No checkpoints at or after producedAt")

    end = to_utc(evaluate_at) if evaluate_at else pts[-1][0]
    if end < produced:
        raise PredictionInputError("evaluateAt is before producedAt")

    late = [p for p in pts if p[0] > end]
    if late:
        warnings.append(f"{len(late)} checkpoint(s) after evaluateAt were ignored.")
        pts = [p for p in pts if p[0] <= end]
    n_total = len(pts)

    missing_t = sum(1 for p in pts if not _finite(p[1]))
    invalid_t = sum(1 for p in pts if _finite(p[1]) and not (TEMP_PLAUSIBLE[0] <= p[1] <= TEMP_PLAUSIBLE[1]))
    if missing_t:
        warnings.append(f"{missing_t} checkpoint(s) have no temperature reading and were skipped.")
    if invalid_t:
        warnings.append(
            f"{invalid_t} temperature reading(s) outside plausible sensor range "
            f"{TEMP_PLAUSIBLE[0]}..{TEMP_PLAUSIBLE[1]} C were rejected."
        )
    valid = [p for p in pts if _finite(p[1]) and TEMP_PLAUSIBLE[0] <= p[1] <= TEMP_PLAUSIBLE[1]]
    if not valid:
        raise PredictionInputError("No valid temperature readings available to evaluate")

    hum_vals = []
    bad_h = 0
    miss_h = 0
    v2 = []
    for ts, t, h in valid:
        if not _finite(h):
            miss_h += 1
            h = None
        elif not (HUM_PLAUSIBLE[0] <= h <= HUM_PLAUSIBLE[1]):
            bad_h += 1
            h = None
        else:
            hum_vals.append(h)
        v2.append((ts, float(t), h))
    valid = v2
    if bad_h:
        warnings.append(f"{bad_h} humidity reading(s) outside 0..100 %RH were rejected.")
    if miss_h:
        warnings.append(f"{miss_h} valid-temperature checkpoint(s) have no humidity reading.")

    p = params
    segments: list = []
    first_ts = valid[0][0]
    if first_ts > produced:
        h = (first_ts - produced).total_seconds() / 3600
        segments.append(Segment(produced, first_ts, valid[0][1], valid[0][2], h, 0.0))
        warnings.append(
            f"No readings for the first {h:.2f} h after producedAt; first reading's temperature was assumed."
        )
        if h > gap_warning_hours:
            warnings.append(f"Data gap of {h:.2f} h between producedAt and first reading exceeds {gap_warning_hours} h.")
    for i, (ts, t, hm) in enumerate(valid):
        nxt = valid[i + 1][0] if i + 1 < len(valid) else end
        h = (nxt - ts).total_seconds() / 3600
        segments.append(Segment(ts, nxt, t, hm, h, 0.0))
        if i + 1 < len(valid) and h > gap_warning_hours:
            warnings.append(
                f"Data gap of {h:.2f} h between {ts.isoformat()} and {nxt.isoformat()} "
                f"(> {gap_warning_hours} h); last reading was held constant."
            )
    if end > valid[-1][0]:
        warnings.append(
            f"Evaluation time is {(end - valid[-1][0]).total_seconds() / 3600:.2f} h after the last valid reading; "
            f"its temperature ({valid[-1][1]:.1f} C) was extrapolated."
        )

    tr = p.tempRange
    if tr is None:
        warnings.append("No validity temperature range supplied with parameters; extrapolation beyond the fitted range cannot be checked.")
    hr = p.humidityRange
    humidity_active = p.humidityOutOfRangeAf is not None and hr is not None
    if hr is not None and not humidity_active:
        warnings.append("Humidity range supplied without a documented humidity acceleration parameter; humidity is reported as a factor only and does not change the estimate.")
    if hr is None and hum_vals:
        warnings.append("Humidity readings present but no humidity parameters supplied; humidity ignored in the estimate.")
    if not p.source and not p.isDemonstration:
        warnings.append("Kinetic parameters carry no source citation and are not flagged as demonstration.")

    age = above = out_hum = excess_pos = excess_neg = hum_extra = out_range_h = 0.0
    sum_t = sum_h = hum_w = total = 0.0
    for s in segments:
        base_af = acceleration_factor(s.temp_c, p.referenceTempC, p.activationEnergyJPerMol)
        af = base_af
        if hr is not None and s.hum is not None and (s.hum < hr.min or s.hum > hr.max):
            out_hum += s.hours
            if humidity_active:
                af = base_af * p.humidityOutOfRangeAf
                hum_extra += s.hours * (af - base_af)
        s.af = af
        age += s.hours * af
        d = s.hours * (base_af - 1.0)
        if d >= 0:
            excess_pos += d
        else:
            excess_neg += d
        if s.temp_c > p.referenceTempC:
            above += s.hours
        if tr is not None and (s.temp_c < tr.min or s.temp_c > tr.max) and s.hours > 0:
            out_range_h += s.hours
        sum_t += s.hours * s.temp_c
        if s.hum is not None:
            sum_h += s.hours * s.hum
            hum_w += s.hours
        total += s.hours
    if out_range_h > 0:
        warnings.append(
            f"{out_range_h:.2f} h were spent outside the stated parameter validity range "
            f"{tr.min}..{tr.max} C; result is an extrapolation."
        )
    if any(s.temp_c < 0 for s in segments):
        warnings.append("Temperatures below 0 C present; Arrhenius kinetics are not validated across freezing/chilling-injury transitions.")

    temps = [s.temp_c for s in segments]
    latest_t = valid[-1][1]
    latest_af = segments[-1].af
    shelf = p.referenceShelfLifeHours
    shelf_eff = shelf * initial_quality_pct / 100.0
    score = min(100.0, max(0.0, 100.0 * (shelf_eff - age) / shelf))
    remaining = max(0.0, shelf_eff - age) / latest_af
    qloss = max(0.0, initial_quality_pct - score)
    th = p.qualityThresholds
    risk = score_to_risk(score, th.safeAbove if th else 60.0, th.flagAbove if th else 40.0)

    factors = [{
        "name": "time_above_reference_temperature", "impact": round(excess_pos, 4),
        "detail": f"{above:.2f} h above {p.referenceTempC} C added {excess_pos:.2f} h of effective age beyond elapsed time (temperature only).",
    }]
    if excess_neg < 0:
        factors.append({
            "name": "time_below_reference_temperature", "impact": round(excess_neg, 4),
            "detail": f"Storage below the reference temperature slowed ageing by {-excess_neg:.2f} h of effective age.",
        })
    factors.append({
        "name": "peak_temperature", "impact": round(max(temps), 2),
        "detail": f"Highest temperature applied over the evaluated period: {max(temps):.1f} C (impact is in degrees C).",
    })
    if hr is not None:
        factors.append({
            "name": "humidity_out_of_range", "impact": round(hum_extra, 4),
            "detail": f"{out_hum:.2f} h outside {hr.min}..{hr.max} %RH; "
                      + ("effect applied via supplied parameter." if humidity_active else "no documented parameter, so no effect on the estimate."),
        })
    factors.append({"name": "elapsed_time", "impact": round(total, 4), "detail": f"{total:.2f} h elapsed since production."})

    return BaselineResult(
        score=score, remaining_h=remaining, quality_loss=qloss, risk=risk, effective_age_h=age,
        hours_above_ref=above, total_hours=total, mean_temp_c=(sum_t / total if total > 0 else latest_t),
        max_temp_c=max(temps), min_temp_c=min(temps), latest_temp_c=latest_t, latest_af=latest_af,
        mean_hum=(sum_h / hum_w if hum_w > 0 else None), hours_out_of_hum_range=out_hum,
        n_valid=len(valid), n_total=n_total, warnings=warnings, factors=factors, evaluate_at=end,
    )
