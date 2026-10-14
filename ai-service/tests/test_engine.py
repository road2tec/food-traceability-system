import math
from datetime import datetime, timedelta, timezone

import pytest

from app.schemas.predict import CheckpointIn, KineticParams
from app.services.arrhenius import PredictionInputError, acceleration_factor, compute_baseline, score_to_risk

T0 = datetime(2025, 1, 1, tzinfo=timezone.utc)
P = KineticParams(referenceTempC=13.0, referenceShelfLifeHours=240, activationEnergyJPerMol=60000, source="test", isDemonstration=True)


def cp(h, t, hum=None):
    return CheckpointIn(timestamp=T0 + timedelta(hours=h), temperatureC=t, humidityPct=hum)


def test_af_hand_computed():
    assert acceleration_factor(13.0, 13.0, 60000) == pytest.approx(1.0)
    assert acceleration_factor(23.0, 13.0, 60000) == pytest.approx(2.3432826630, rel=1e-8)  # hand value
    assert acceleration_factor(4.0, 13.0, 60000) == pytest.approx(0.4408997094, rel=1e-8)


def test_piecewise_integration_and_score():
    # 0-10h at 23C (first reading assumed from producedAt), 10-30h at 4C, evaluated at 30h
    r = compute_baseline(P, T0, [cp(0, 23), cp(10, 4), cp(30, 4)])
    age = 10 * 2.3432826630486954 + 20 * 0.4408997094940481
    assert r.effective_age_h == pytest.approx(age, rel=1e-9)
    assert r.score == pytest.approx(100 * (1 - age / 240), rel=1e-9)
    assert r.hours_above_ref == pytest.approx(10)
    assert r.remaining_h == pytest.approx((240 - age) / 0.4408997094940481, rel=1e-9)
    assert r.quality_loss == pytest.approx(100 - r.score)


def test_first_interval_from_production_and_extrapolation_warning():
    r = compute_baseline(P, T0, [cp(5, 13)], evaluate_at=T0 + timedelta(hours=15))
    assert r.effective_age_h == pytest.approx(15.0)
    assert any("first reading" in w for w in r.warnings)
    assert any("extrapolated" in w for w in r.warnings)


def test_score_boundaries():
    fresh = compute_baseline(P, T0, [cp(0, 13)])
    assert fresh.score == 100.0 and fresh.risk == "LOW" and fresh.remaining_h == pytest.approx(240)
    dead = compute_baseline(P, T0, [cp(0, 13), cp(1000, 13)])
    assert dead.score == 0.0 and dead.remaining_h == 0.0 and dead.risk == "CRITICAL"


def test_initial_quality_scaling():
    r = compute_baseline(P, T0, [cp(0, 13)], initial_quality_pct=80)
    assert r.score == pytest.approx(80.0)
    assert r.remaining_h == pytest.approx(192.0)


def test_risk_mapping_boundaries():
    assert score_to_risk(100) == "LOW" and score_to_risk(80) == "LOW"
    assert score_to_risk(79.99) == "MODERATE" and score_to_risk(60.01) == "MODERATE"
    assert score_to_risk(60) == "HIGH" and score_to_risk(40) == "HIGH"
    assert score_to_risk(39.99) == "CRITICAL" and score_to_risk(0) == "CRITICAL"


def test_non_chronological_sorted_with_warning():
    a = compute_baseline(P, T0, [cp(10, 4), cp(0, 23), cp(30, 4)])
    b = compute_baseline(P, T0, [cp(0, 23), cp(10, 4), cp(30, 4)])
    assert a.effective_age_h == pytest.approx(b.effective_age_h)
    assert any("chronological" in w for w in a.warnings)


def test_missing_and_invalid_readings():
    r = compute_baseline(P, T0, [cp(0, 13), cp(5, None), cp(10, 150), cp(20, 13, 140)])
    assert r.n_valid == 2
    assert any("no temperature" in w for w in r.warnings)
    assert any("plausible sensor range" in w for w in r.warnings)
    assert any("humidity reading" in w for w in r.warnings)
    assert r.effective_age_h == pytest.approx(20.0)  # held at 13C across rejected readings


def test_all_invalid_raises():
    with pytest.raises(PredictionInputError):
        compute_baseline(P, T0, [cp(0, None), cp(1, 500)])


def test_gap_warning():
    r = compute_baseline(P, T0, [cp(0, 13), cp(30, 13)], gap_warning_hours=6)
    assert any("Data gap" in w for w in r.warnings)


def test_humidity_no_effect_without_parameter():
    p = KineticParams(referenceTempC=13, referenceShelfLifeHours=240, activationEnergyJPerMol=60000, isDemonstration=True,
                      humidityRange={"min": 80, "max": 95})
    r = compute_baseline(p, T0, [cp(0, 13, 50), cp(10, 13, 50)])
    assert r.effective_age_h == pytest.approx(10.0)
    assert r.hours_out_of_hum_range == pytest.approx(10.0)
    assert any("does not change the estimate" in w for w in r.warnings)


def test_humidity_effect_with_documented_parameter():
    p = KineticParams(referenceTempC=13, referenceShelfLifeHours=240, activationEnergyJPerMol=60000, isDemonstration=True,
                      humidityRange={"min": 80, "max": 95}, humidityOutOfRangeAf=1.5, humiditySource="test citation")
    r = compute_baseline(p, T0, [cp(0, 13, 50), cp(10, 13, 50)])
    assert r.effective_age_h == pytest.approx(15.0)


def test_humidity_param_requires_citation():
    with pytest.raises(Exception):
        KineticParams(referenceTempC=13, referenceShelfLifeHours=240, activationEnergyJPerMol=60000,
                      humidityRange={"min": 80, "max": 95}, humidityOutOfRangeAf=1.5)


def test_extrapolation_beyond_valid_range_warning():
    p = KineticParams(referenceTempC=13, referenceShelfLifeHours=240, activationEnergyJPerMol=60000, isDemonstration=True,
                      tempRange={"min": 2, "max": 20})
    r = compute_baseline(p, T0, [cp(0, 30), cp(5, 30)])
    assert any("validity range" in w for w in r.warnings)


def test_evaluate_at_before_last_checkpoint_truncates():
    r = compute_baseline(P, T0, [cp(0, 13), cp(10, 13), cp(50, 13)], evaluate_at=T0 + timedelta(hours=20))
    assert r.effective_age_h == pytest.approx(20.0)
    assert any("after evaluateAt" in w for w in r.warnings)


def test_evaluate_before_production_raises():
    with pytest.raises(PredictionInputError):
        compute_baseline(P, T0, [cp(0, 13)], evaluate_at=T0 - timedelta(hours=1))
