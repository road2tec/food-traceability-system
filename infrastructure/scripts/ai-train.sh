#!/usr/bin/env bash
# Train and/or evaluate the AI model. Usage: ai-train.sh [train|evaluate|both]
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
MODE="${1:-both}"
PY="$(venv_python)"; [ -n "$PY" ] || { err "ai-service venv missing; run setup.sh"; exit 1; }
AI="$ROOT/ai-service"
find_script() { for n in "$@"; do for d in scripts app training .; do [ -f "$AI/$d/$n" ] && { echo "$AI/$d/$n"; return; }; done; done; }
cd "$AI"
if [ "$MODE" != evaluate ]; then
  T="$(find_script train.py train_model.py)"; [ -n "$T" ] || { err "no train script found"; exit 1; }
  step "train: $T"; "$PY" "$T"
fi
if [ "$MODE" != train ]; then
  E="$(find_script evaluate.py evaluate_model.py)"; [ -n "$E" ] || { err "no evaluate script found"; exit 1; }
  step "evaluate: $E"; "$PY" "$E"
fi
