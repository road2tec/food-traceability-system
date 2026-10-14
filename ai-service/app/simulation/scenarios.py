"""Deterministic, seedable simulator of cold-chain sensor records.

All values are SYNTHETIC. The per-category set points below are simulation settings,
not scientific storage recommendations. Every record carries simulated=True.
"""
from __future__ import annotations

import math
import random
from datetime import datetime, timedelta, timezone
from typing import Optional

from ..utils.timeutils import iso_z, to_utc

# (set-point temperature C, set-point RH %) -- simulation settings only.
SETPOINTS = {
    "FRUIT": (12.0, 90.0),
    "VEGETABLE": (5.0, 92.0),
    "DAIRY": (4.0, 85.0),
}
AMBIENT_C = 28.0
NOTICE = "All records are synthetic simulator output (simulated=true); not real sensor data."

SCENARIOS = [
    "NORMAL", "TEMP_EXCURSION", "COOLING_FAILURE", "TRANSPORT_DELAY",
    "VARIABLE_HUMIDITY", "MULTI_HANDOVER", "MISSING_READINGS", "INVALID_READINGS",
]
_HANDOVER_LOCS = ["Farm / Packhouse", "Distribution Hub", "Regional Warehouse", "Retail Store"]
_HANDOVER_EVENTS = ["PRODUCTION", "DISPATCH", "ARRIVAL", "RECEIPT"]


def _clip(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def simulate(
    category: str,
    scenario: str,
    duration_hours: float = 72.0,
    count: int = 24,
    seed: int = 0,
    start_time: Optional[datetime] = None,
) -> list:
    if category not in SETPOINTS:
        raise ValueError(f"Unknown category {category}")
    if scenario not in SCENARIOS:
        raise ValueError(f"Unknown scenario {scenario}")
    if count < 1 or duration_hours <= 0:
        raise ValueError("count must be >= 1 and durationHours > 0")
    rng = random.Random(f"{seed}|{category}|{scenario}")
    t0 = to_utc(start_time) if start_time else datetime(2025, 1, 1, tzinfo=timezone.utc)
    sp_t, sp_h = SETPOINTS[category]
    step = duration_hours / count if count > 1 else 0.0
    offsets = [i * step if count > 1 else 0.0 for i in range(count)]
    if scenario == "TRANSPORT_DELAY" and count >= 4:
        # one long silent gap mid-journey: records after the midpoint shift later by 40% of duration
        mid = count // 2
        span = duration_hours * 0.6 / max(1, count - 1)
        gap = duration_hours * 0.4
        offsets = [i * span + (gap if i >= mid else 0.0) for i in range(count)]

    records = []
    for i, off in enumerate(offsets):
        frac = i / max(1, count - 1)
        temp = sp_t + rng.gauss(0, 0.4)
        hum = sp_h + rng.gauss(0, 1.5)
        loc, ev, remark = "Cold Store", "STORAGE", "Simulated reading"
        if i == 0:
            ev, loc = "PRODUCTION", "Origin"
        elif i == count - 1 and count > 1:
            ev = "ARRIVAL"
        elif i % 3 == 0:
            ev = "TRANSIT"

        if scenario == "TEMP_EXCURSION":
            if 0.4 <= frac <= 0.6:
                temp += 10.0 + rng.gauss(0, 0.8)
                remark = "Simulated temperature excursion"
        elif scenario == "COOLING_FAILURE":
            if frac >= 0.4:
                k = (frac - 0.4) / 0.6
                temp = sp_t + (AMBIENT_C - sp_t) * (1 - math.exp(-3 * k)) + rng.gauss(0, 0.4)
                remark = "Simulated cooling failure"
        elif scenario == "TRANSPORT_DELAY":
            if i >= count // 2 and count >= 4:
                temp += 5.0 + rng.gauss(0, 0.5)
                loc, ev, remark = "In transit", "TRANSIT", "Simulated transport delay"
        elif scenario == "VARIABLE_HUMIDITY":
            hum = _clip(sp_h + 25.0 * math.sin(2 * math.pi * frac * 3) + rng.gauss(0, 3), 0, 100)
            remark = "Simulated variable humidity"
        elif scenario == "MULTI_HANDOVER":
            idx = min(len(_HANDOVER_LOCS) - 1, int(frac * len(_HANDOVER_LOCS)))
            loc = _HANDOVER_LOCS[idx]
            ev = _HANDOVER_EVENTS[idx] if (i == 0 or int((i - 1) / max(1, count - 1) * 4) != idx or i == count - 1) else "STORAGE"
            temp += [0.0, 1.5, 0.8, 1.0][idx] + rng.gauss(0, 0.3)
            remark = f"Simulated handover stage {idx + 1}"
        elif scenario == "MISSING_READINGS":
            r = rng.random()
            if r < 0.15:
                temp = None
                remark = "Simulated missing temperature"
            elif r < 0.25:
                hum = None
                remark = "Simulated missing humidity"
        elif scenario == "INVALID_READINGS":
            r = rng.random()
            if r < 0.12:
                temp = rng.choice([150.0, -90.0, 999.0])
                remark = "Simulated INVALID temperature (out of range)"
            elif r < 0.22:
                hum = rng.choice([140.0, -5.0, 250.0])
                remark = "Simulated INVALID humidity (out of range)"

        if temp is not None and scenario != "INVALID_READINGS":
            temp = _clip(temp, -50.0, 80.0)
        if hum is not None and scenario != "INVALID_READINGS":
            hum = _clip(hum, 0.0, 100.0)
        records.append({
            "timestamp": iso_z(t0 + timedelta(hours=off)),
            "temperatureC": None if temp is None else round(temp, 2),
            "humidityPct": None if hum is None else round(hum, 1),
            "location": loc,
            "eventType": ev,
            "remarks": remark,
            "simulated": True,
        })
    return records
