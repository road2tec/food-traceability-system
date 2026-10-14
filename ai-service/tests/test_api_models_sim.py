import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.models import registry, training
from app.models.registry import ModelStore
from app.simulation.scenarios import SCENARIOS, simulate

PARAMS = {"referenceTempC": 13.0, "referenceShelfLifeHours": 240, "activationEnergyJPerMol": 60000,
          "source": "test", "isDemonstration": True}


def body(**kw):
    b = {"batchId": "FT-1", "productCategory": "FRUIT", "productName": "Banana", "params": PARAMS,
         "initialQualityPct": 100, "producedAt": "2025-01-01T00:00:00Z",
         "checkpoints": [{"timestamp": "2025-01-01T00:00:00Z", "temperatureC": 13, "humidityPct": 88, "eventType": "STORAGE"},
                         {"timestamp": "2025-01-02T00:00:00Z", "temperatureC": 13, "humidityPct": 88, "eventType": "STORAGE"}]}
    b.update(kw)
    return b


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "ARTIFACTS_DIR", tmp_path)
    monkeypatch.delenv("AI_ALLOW_DEMO_MODEL", raising=False)
    with TestClient(app) as c:
        yield c


# ---------- API ----------
def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "UP"


def test_models_lists_baseline_when_nothing_trained(client):
    m = client.get("/models").json()["models"]
    assert len(m) == 1 and m[0]["type"] == "ARRHENIUS_BASELINE" and m[0]["active"] is True


def test_predict_ok(client):
    r = client.post("/predict", json=body())
    assert r.status_code == 200
    d = r.json()
    assert d["modelType"] == "ARRHENIUS_BASELINE"
    assert d["effectiveAgeHours"] == pytest.approx(24.0)
    assert d["freshnessScore"] == pytest.approx(90.0)
    assert d["uncertainty"]["supported"] is False
    assert d["demonstrationMode"] is True and d["riskCategory"] == "LOW"
    assert d["remainingShelfLifeHours"] == pytest.approx(216.0)


@pytest.mark.parametrize("mod", [
    {"checkpoints": []},
    {"params": {**PARAMS, "activationEnergyJPerMol": -5}},
    {"params": {"referenceTempC": 13}},
    {"productCategory": "MEAT"},
    {"producedAt": "garbage"},
    {"initialQualityPct": 150},
])
def test_predict_422(client, mod):
    assert client.post("/predict", json=body(**mod)).status_code == 422


def test_predict_400_no_valid_readings(client):
    cps = [{"timestamp": "2025-01-01T00:00:00Z", "temperatureC": 999}, {"timestamp": "2025-01-01T05:00:00Z", "temperatureC": None}]
    r = client.post("/predict", json=body(checkpoints=cps))
    assert r.status_code == 400 and r.json()["detail"]["code"] == "INVALID_INPUT"


def test_predict_simulated_invalid_readings_end_to_end(client):
    recs = simulate("DAIRY", "INVALID_READINGS", 48, 40, seed=3)
    r = client.post("/predict", json=body(productCategory="DAIRY", checkpoints=recs, producedAt=recs[0]["timestamp"]))
    assert r.status_code == 200 and any("plausible" in w for w in r.json()["warnings"])


def test_simulate_endpoint(client):
    req = {"category": "FRUIT", "scenario": "NORMAL", "durationHours": 24, "count": 5, "seed": 1, "startTime": "2025-03-01T00:00:00Z"}
    a, b = client.post("/simulate", json=req), client.post("/simulate", json=req)
    assert a.status_code == 200 and a.json() == b.json()
    recs = a.json()["records"]
    assert len(recs) == 5 and all(x["simulated"] is True for x in recs)
    assert client.post("/simulate", json={**req, "scenario": "NOPE"}).status_code == 422
    assert client.post("/simulate", json={**req, "count": 0}).status_code == 422


# ---------- models: load / fallback ----------
@pytest.fixture(scope="module")
def trained():
    r, l = training.generate_synthetic(60, seed=5)
    return training.train(r, l, demonstration_only=True, dataset_source="synthetic test", dataset_licence="N/A", seed=5)


def test_train_metadata_is_labelled_synthetic(trained):
    est, meta = trained
    assert meta["demonstrationOnly"] is True and meta["validated"] is False
    assert "SYNTHETIC" in meta["metricsNote"] and meta["metricsDetail"]["cv"].startswith("GroupKFold")


def test_group_kfold_has_no_batch_leakage():
    from sklearn.model_selection import GroupKFold
    r, l = training.generate_synthetic(30, seed=1)
    ex = training.build_examples(r, l)
    for tr, te in GroupKFold(5).split(ex, groups=ex["batch_id"]):
        assert not set(ex.iloc[tr]["batch_id"]) & set(ex.iloc[te]["batch_id"])


def test_model_persist_load_and_fallback(trained, tmp_path, monkeypatch):
    est, meta = trained
    registry.save_model(est, meta, tmp_path)
    store = ModelStore(tmp_path)
    assert meta["version"] in store.models and store.load_errors == []
    # demo model not used by default -> baseline fallback
    monkeypatch.delenv("AI_ALLOW_DEMO_MODEL", raising=False)
    assert store.active() is None
    monkeypatch.setenv("AI_ALLOW_DEMO_MODEL", "1")
    assert store.active().version == meta["version"]


def test_predict_uses_ml_when_enabled_and_labels_demo(trained, tmp_path, monkeypatch):
    est, meta = trained
    registry.save_model(est, meta, tmp_path)
    monkeypatch.setattr(config, "ARTIFACTS_DIR", tmp_path)
    monkeypatch.setenv("AI_ALLOW_DEMO_MODEL", "1")
    with TestClient(app) as c:
        d = c.post("/predict", json=body()).json()
        assert d["modelType"] == "ARRHENIUS_ML_CORRECTED" and d["modelVersion"] == meta["version"]
        assert d["demonstrationMode"] is True and any("SYNTHETIC" in w for w in d["warnings"])
        assert d["uncertainty"]["supported"] is False


def test_corrupt_artifact_falls_back(tmp_path, monkeypatch):
    d = tmp_path / "bad"
    d.mkdir()
    (d / "metadata.json").write_text('{"version":"bad","trainedAt":"x","demonstrationOnly":true}')
    (d / "model.joblib").write_bytes(b"not a model")
    store = ModelStore(tmp_path)
    assert store.models == {} and store.load_errors


def test_evaluate_on_synthetic(trained):
    est, _ = trained
    r, l = training.generate_synthetic(40, seed=99)
    out = training.evaluate_model(est, r, l)
    assert set(out["baseline"]) == {"mae", "rmse", "r2"} and out["n"] == 40


def test_dataset_schema_validation():
    import pandas as pd
    with pytest.raises(ValueError):
        training.build_examples(pd.DataFrame({"batch_id": []}), pd.DataFrame({"batch_id": []}))


# ---------- simulator ----------
@pytest.mark.parametrize("scn", SCENARIOS)
@pytest.mark.parametrize("cat", ["FRUIT", "VEGETABLE", "DAIRY"])
def test_simulator_reproducible_and_marked(scn, cat):
    a = simulate(cat, scn, 72, 30, seed=11)
    assert a == simulate(cat, scn, 72, 30, seed=11)
    assert a != simulate(cat, scn, 72, 30, seed=12)
    assert len(a) == 30 and all(r["simulated"] is True for r in a)
    ts = [r["timestamp"] for r in a]
    assert ts == sorted(ts)


def test_scenario_semantics():
    inv = simulate("FRUIT", "INVALID_READINGS", 72, 200, seed=1)
    assert any((r["temperatureC"] or 0) > 80 or (r["temperatureC"] or 0) < -50 for r in inv)
    miss = simulate("FRUIT", "MISSING_READINGS", 72, 200, seed=1)
    assert any(r["temperatureC"] is None for r in miss)
    exc = simulate("DAIRY", "TEMP_EXCURSION", 72, 50, seed=1)
    assert max(r["temperatureC"] for r in exc) > 10
    cf = simulate("DAIRY", "COOLING_FAILURE", 72, 50, seed=1)
    assert cf[-1]["temperatureC"] > 20
    norm = simulate("DAIRY", "NORMAL", 72, 50, seed=1)
    assert all(-1 < r["temperatureC"] < 8 for r in norm)


def test_simulator_start_time_and_count():
    from datetime import datetime, timezone
    r = simulate("FRUIT", "NORMAL", 10, 3, seed=0, start_time=datetime(2030, 5, 5, tzinfo=timezone.utc))
    assert r[0]["timestamp"].startswith("2030-05-05T00:00:00") and len(r) == 3
    with pytest.raises(ValueError):
        simulate("FRUIT", "NORMAL", 10, 0)
