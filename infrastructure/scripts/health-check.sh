#!/usr/bin/env bash
# Poll health endpoints. Usage: health-check.sh [waitSeconds]. Exit 0 only if required services are up.
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
W="${1:-0}"; FAIL=0
check() { # name url required
  if [ "$W" -gt 0 ]; then wait_http "$2" "$W"; else http_ok "$2"; fi
  if [ $? -eq 0 ]; then ok "$1"; elif [ "$3" = 1 ]; then err "$1"; FAIL=$((FAIL+1)); else warn "$1 not up (optional)"; fi
}
check "server /api/v1/health" http://127.0.0.1:4000/api/v1/health 1
check "ai-service /health" http://127.0.0.1:8001/health 1
check "client" http://127.0.0.1:5173/ 0
curl -fsS -m 4 http://127.0.0.1:4000/api/v1/health 2>/dev/null && echo
exit $FAIL
