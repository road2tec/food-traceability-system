"""Runtime configuration (environment variables)."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = Path(os.environ.get("AI_ARTIFACTS_DIR", BASE_DIR / "artifacts"))
DATASETS_DIR = Path(os.environ.get("AI_DATASETS_DIR", BASE_DIR / "datasets"))

BASELINE_VERSION = "arrhenius-baseline-1.0"


def allow_demo_model() -> bool:
    """Demonstration (synthetic-trained) models are only used by /predict when explicitly enabled."""
    return os.environ.get("AI_ALLOW_DEMO_MODEL", "0").lower() in ("1", "true", "yes")
