from __future__ import annotations

from typing import Optional

from .. import config
from ..models.registry import ModelStore
from ..models.training import baseline_features, predict_correction
from ..schemas.predict import PredictRequest
from ..utils.timeutils import now_utc
from .arrhenius import compute_baseline, score_to_risk

DISCLAIMER = ("Estimate from a kinetic model using caller-supplied parameters; it is not proof of food safety or "
              "edibility. Do not use as the sole basis for consumption or regulatory decisions.")


def predict(req: PredictRequest, store: Optional[ModelStore]) -> dict:
    p = req.params
    res = compute_baseline(p, req.producedAt, req.checkpoints, req.initialQualityPct, req.evaluateAt, req.gapWarningHours)
    warnings = list(res.warnings)
    remaining = res.remaining_h
    model_type, version = "ARRHENIUS_BASELINE", config.BASELINE_VERSION
    demo = bool(p.isDemonstration)
    uncertainty = {"supported": False,
                   "reason": "No validated uncertainty method is available; no confidence interval is provided."}

    model = store.active() if store else None
    if model is not None:
        try:
            feats = baseline_features(res, p.referenceTempC, p.referenceShelfLifeHours, p.activationEnergyJPerMol,
                                      req.productCategory.value)
            corr = predict_correction(model.estimator, feats)
            remaining = max(0.0, res.remaining_h + corr)
            model_type, version = "ARRHENIUS_ML_CORRECTED", model.version
            demo = demo or model.demonstration_only
            res.factors.append({"name": "ml_residual_correction", "impact": round(remaining - res.remaining_h, 4),
                                "detail": f"Model {model.version} adjusted remaining shelf life by {remaining - res.remaining_h:+.2f} h "
                                          "(score and effective age remain the physical baseline)."})
            if model.demonstration_only:
                warnings.append("Correction model was trained on SYNTHETIC data only (demonstration); it is not real-world validated.")
            elif not model.validated:
                warnings.append("Correction model is not marked as externally validated.")
        except Exception as e:  # fall back to baseline
            warnings.append(f"ML correction failed ({type(e).__name__}); baseline used.")
            remaining, model_type, version = res.remaining_h, "ARRHENIUS_BASELINE", config.BASELINE_VERSION

    th = p.qualityThresholds
    risk = score_to_risk(res.score, th.safeAbove if th else 60.0, th.flagAbove if th else 40.0)
    return {
        "batchId": req.batchId,
        "freshnessScore": round(res.score, 2),
        "remainingShelfLifeHours": round(remaining, 2),
        "qualityLossPct": round(res.quality_loss, 2),
        "riskCategory": risk,
        "modelVersion": version,
        "modelType": model_type,
        "demonstrationMode": demo,
        "predictedAt": now_utc(),
        "uncertainty": uncertainty,
        "warnings": warnings,
        "factors": res.factors,
        "effectiveAgeHours": round(res.effective_age_h, 4),
        "hoursAboveReferenceTemp": round(res.hours_above_ref, 4),
        "disclaimer": DISCLAIMER,
    }
