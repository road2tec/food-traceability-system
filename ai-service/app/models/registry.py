"""Model versioning, persistence (joblib + metadata.json) and loading."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import joblib

from .. import config


class LoadedModel:
    def __init__(self, metadata: dict, estimator):
        self.metadata = metadata
        self.estimator = estimator

    @property
    def version(self) -> str:
        return self.metadata["version"]

    @property
    def demonstration_only(self) -> bool:
        return bool(self.metadata.get("demonstrationOnly", True))

    @property
    def validated(self) -> bool:
        return bool(self.metadata.get("validated", False))


def save_model(estimator, metadata: dict, artifacts_dir: Optional[Path] = None) -> Path:
    root = Path(artifacts_dir or config.ARTIFACTS_DIR) / metadata["version"]
    root.mkdir(parents=True, exist_ok=True)
    joblib.dump(estimator, root / "model.joblib")
    (root / "metadata.json").write_text(json.dumps(metadata, indent=2, sort_keys=True), encoding="utf-8")
    return root


def list_metadata(artifacts_dir: Optional[Path] = None) -> list:
    root = Path(artifacts_dir or config.ARTIFACTS_DIR)
    out = []
    if root.is_dir():
        for d in sorted(root.iterdir()):
            m = d / "metadata.json"
            if m.is_file():
                try:
                    out.append(json.loads(m.read_text(encoding="utf-8")))
                except Exception:
                    continue
    return sorted(out, key=lambda x: x.get("trainedAt", ""))


def load_model(version: str, artifacts_dir: Optional[Path] = None) -> LoadedModel:
    root = Path(artifacts_dir or config.ARTIFACTS_DIR) / version
    meta = json.loads((root / "metadata.json").read_text(encoding="utf-8"))
    return LoadedModel(meta, joblib.load(root / "model.joblib"))


class ModelStore:
    """Holds loaded models; selects the active one. active() is None -> baseline fallback."""

    def __init__(self, artifacts_dir: Optional[Path] = None):
        self.artifacts_dir = Path(artifacts_dir or config.ARTIFACTS_DIR)
        self.models: dict = {}
        self.load_errors: list = []
        self.reload()

    def reload(self):
        self.models, self.load_errors = {}, []
        for meta in list_metadata(self.artifacts_dir):
            try:
                self.models[meta["version"]] = load_model(meta["version"], self.artifacts_dir)
            except Exception as e:  # corrupt artifact -> skip and report
                self.load_errors.append(f"{meta.get('version')}: {e}")

    def active(self) -> Optional[LoadedModel]:
        """Newest validated, non-demonstration model; demo models only if AI_ALLOW_DEMO_MODEL is set."""
        cands = [m for m in self.models.values() if m.validated and not m.demonstration_only]
        if not cands and config.allow_demo_model():
            cands = list(self.models.values())
        if not cands:
            return None
        return sorted(cands, key=lambda m: m.metadata.get("trainedAt", ""))[-1]
