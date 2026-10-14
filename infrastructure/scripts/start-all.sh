#!/usr/bin/env bash
# Start ai-service, server, client in background. PID files + logs in infrastructure/.run/
# Flags: --no-client  --seed
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
NOCLIENT=0; SEED=0
for a in "$@"; do case "$a" in --no-client) NOCLIENT=1;; --seed) SEED=1;; esac; done

step "MongoDB"
port_open 27017 || { err "MongoDB not listening on 27017 (see docs/TROUBLESHOOTING.md)"; exit 1; }
ok "mongod reachable on 27017"

PY="$(venv_python)"
if [ -n "$PY" ]; then
  MOD="app.main:app"
  [ ! -f "$ROOT/ai-service/app/main.py" ] && [ -f "$ROOT/ai-service/main.py" ] && MOD="main:app"
  start_bg ai-service "$ROOT/ai-service" "$PY" -m uvicorn "$MOD" --host 127.0.0.1 --port 8001
else warn "ai-service venv missing - run setup.sh"; fi

[ "$SEED" = 1 ] && "$(dirname "${BASH_SOURCE[0]}")/seed.sh"

start_bg server "$ROOT/server" $NPM run start
[ "$NOCLIENT" = 0 ] && start_bg client "$ROOT/client" $NPM run dev -- --host 127.0.0.1 --port 5180

step "Waiting for health"
FAIL=0
if [ -n "$PY" ]; then wait_http http://127.0.0.1:8001/health 90 && ok "ai-service healthy" || { err "ai-service not healthy (.run/ai-service.err.log)"; FAIL=1; }; fi
wait_http http://127.0.0.1:4000/api/v1/health 90 && ok "server healthy" || { err "server not healthy (.run/server.err.log)"; FAIL=1; }
if [ "$NOCLIENT" = 0 ]; then wait_http http://127.0.0.1:5180/ 90 && ok "client up" || { err "client not up (.run/client.err.log)"; FAIL=1; }; fi
exit $FAIL
