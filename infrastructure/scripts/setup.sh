#!/usr/bin/env bash
# Install deps for all components. Never overwrites existing .env files.
# Flags: --skip-python
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
set -e
SKIP_PY=0
for a in "$@"; do case "$a" in --skip-python) SKIP_PY=1;; esac; done

install_node() { # dir label
  if [ ! -f "$1/package.json" ]; then warn "$2: no package.json (skipped)"; return 0; fi
  step "npm install: $2"
  ( cd "$1" && if [ -f package-lock.json ]; then $NPM ci; else $NPM install; fi )
  ok "$2"
}

[ -f "$ROOT/.env" ] || { cp "$ROOT/.env.example" "$ROOT/.env"; ok "created .env"; }
for c in client server ai-service; do
  [ -f "$ROOT/$c/.env.example" ] && [ ! -f "$ROOT/$c/.env" ] && cp "$ROOT/$c/.env.example" "$ROOT/$c/.env" && ok "created $c/.env"
done

install_node "$ROOT/server" server
install_node "$ROOT/client" client
install_node "$ROOT/tests-e2e" tests-e2e

if [ "$SKIP_PY" = 0 ]; then
  AI="$ROOT/ai-service"
  if [ -f "$AI/requirements.txt" ]; then
    step "ai-service venv"
    if [ -z "$(venv_python)" ]; then
      if command -v py >/dev/null 2>&1; then py -3.10 -m venv "$AI/.venv" || python -m venv "$AI/.venv"
      elif command -v python3 >/dev/null 2>&1; then python3 -m venv "$AI/.venv"
      else python -m venv "$AI/.venv"; fi
    fi
    PY="$(venv_python)"; [ -n "$PY" ] || { err "venv creation failed (docs/TROUBLESHOOTING.md)"; exit 1; }
    "$PY" -m pip install --upgrade pip
    "$PY" -m pip install -r "$AI/requirements.txt"
    ok "ai-service deps"
  else warn "ai-service/requirements.txt not found (skipped)"; fi
fi
ok "setup complete"
