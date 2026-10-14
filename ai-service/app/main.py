from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, HTTPException, Request

from . import config
from .models.registry import ModelStore
from .schemas.predict import PredictRequest, PredictResponse
from .schemas.simulate import SimulateRequest, SimulateResponse
from .services.arrhenius import PredictionInputError
from .services.prediction_service import predict as run_predict
from .simulation.scenarios import NOTICE, simulate as run_simulate

router = APIRouter()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.store = ModelStore()  # load persisted models at startup
    yield


app = FastAPI(title="Food Traceability AI Service", version="1.0.0", lifespan=lifespan)


def get_store(request: Request) -> ModelStore:
    store = getattr(request.app.state, "store", None)
    if store is None:  # TestClient without lifespan
        store = request.app.state.store = ModelStore()
    return store


@router.get("/health")
def health(request: Request):
    store = get_store(request)
    active = store.active()
    return {"status": "UP", "service": "ai-service", "baselineVersion": config.BASELINE_VERSION,
            "modelsLoaded": len(store.models), "activeModel": active.version if active else None,
            "loadErrors": store.load_errors}


@router.get("/models")
def models(request: Request):
    store = get_store(request)
    active = store.active()
    items = [{
        "version": config.BASELINE_VERSION, "type": "ARRHENIUS_BASELINE", "trainedAt": None,
        "datasetSource": None, "datasetLicence": None, "metrics": None, "demonstrationOnly": False,
        "validated": False, "active": active is None,
        "note": "Physical kinetic model; parameters supplied per request. No fitted/trained parameters.",
    }]
    for m in store.models.values():
        md = m.metadata
        items.append({
            "version": md["version"], "type": md["type"], "trainedAt": md.get("trainedAt"),
            "datasetSource": md.get("datasetSource"), "datasetLicence": md.get("datasetLicence"),
            "metrics": md.get("metrics"), "metricsDetail": md.get("metricsDetail"),
            "metricsNote": md.get("metricsNote"), "demonstrationOnly": m.demonstration_only,
            "validated": m.validated, "active": bool(active and active.version == m.version),
            "artifactPath": f"artifacts/{md['version']}",
        })
    return {"models": items, "demoModelsEnabled": config.allow_demo_model()}


@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest, request: Request):
    try:
        return run_predict(req, get_store(request))
    except PredictionInputError as e:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": str(e)})


@router.post("/simulate", response_model=SimulateResponse)
def simulate(req: SimulateRequest):
    recs = run_simulate(req.category.value, req.scenario.value, req.durationHours, req.count, req.seed, req.startTime)
    return {"records": recs, "seed": req.seed, "scenario": req.scenario.value, "notice": NOTICE}


app.include_router(router)
