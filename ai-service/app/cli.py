"""CLI: python -m app.cli train|evaluate|simulate"""
import argparse
import json
import sys
from pathlib import Path

import pandas as pd

from . import config
from .models import registry, training
from .simulation.scenarios import SCENARIOS, simulate


def _load_data(args):
    if args.data_dir:
        d = Path(args.data_dir)
        return pd.read_csv(d / "readings.csv"), pd.read_csv(d / "labels.csv")
    return None


def cmd_train(a):
    data = _load_data(a)
    if data is None:
        if not a.demonstration_only:
            sys.exit("No --data-dir given. Real training needs readings.csv + labels.csv (datasets/README.md). "
                     "Use --demonstration-only to train on synthetic data.")
        readings, labels = training.generate_synthetic(a.n_batches, a.seed)
        source = f"SYNTHETIC generator (seed={a.seed}, n_batches={a.n_batches})"
        licence = "N/A (generated, not real data)"
    else:
        readings, labels = data
        if not a.dataset_source or not a.dataset_licence:
            sys.exit("--dataset-source and --dataset-licence are required with --data-dir")
        source, licence = a.dataset_source, a.dataset_licence
    est, meta = training.train(readings, labels, demonstration_only=a.demonstration_only and data is None,
                               dataset_source=source, dataset_licence=licence, seed=a.seed,
                               mark_validated=a.mark_validated)
    path = registry.save_model(est, meta)
    print(json.dumps({"saved": str(path), "version": meta["version"], "demonstrationOnly": meta["demonstrationOnly"],
                      "metricsDetail": meta["metricsDetail"], "note": meta["metricsNote"]}, indent=2))


def cmd_evaluate(a):
    metas = registry.list_metadata()
    if not metas:
        sys.exit("No trained models in artifacts/. Run: python -m app.cli train --demonstration-only")
    version = a.model_version or metas[-1]["version"]
    model = registry.load_model(version)
    data = _load_data(a)
    if data is None:
        readings, labels = training.generate_synthetic(a.n_batches, a.seed)
        note = "Fresh-seed SYNTHETIC data: self-consistency only, not real-world validation."
    else:
        readings, labels = data
        note = "Evaluated on supplied dataset."
    out = training.evaluate_model(model.estimator, readings, labels)
    out.update(modelVersion=version, demonstrationOnly=model.demonstration_only, note=note)
    print(json.dumps(out, indent=2))


def cmd_simulate(a):
    recs = simulate(a.category, a.scenario, a.duration_hours, a.count, a.seed, a.start_time and
                    __import__("datetime").datetime.fromisoformat(a.start_time.replace("Z", "+00:00")))
    print(json.dumps({"records": recs}, indent=2))


def main(argv=None):
    p = argparse.ArgumentParser(prog="app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train")
    t.add_argument("--data-dir")
    t.add_argument("--demonstration-only", action="store_true")
    t.add_argument("--dataset-source")
    t.add_argument("--dataset-licence")
    t.add_argument("--mark-validated", action="store_true")
    t.add_argument("--n-batches", type=int, default=300)
    t.add_argument("--seed", type=int, default=42)
    t.set_defaults(fn=cmd_train)
    e = sub.add_parser("evaluate")
    e.add_argument("--data-dir")
    e.add_argument("--model-version")
    e.add_argument("--n-batches", type=int, default=200)
    e.add_argument("--seed", type=int, default=777)
    e.set_defaults(fn=cmd_evaluate)
    s = sub.add_parser("simulate")
    s.add_argument("--category", choices=["FRUIT", "VEGETABLE", "DAIRY"], required=True)
    s.add_argument("--scenario", choices=SCENARIOS, required=True)
    s.add_argument("--duration-hours", type=float, default=72)
    s.add_argument("--count", type=int, default=24)
    s.add_argument("--seed", type=int, default=0)
    s.add_argument("--start-time")
    s.set_defaults(fn=cmd_simulate)
    a = p.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()
