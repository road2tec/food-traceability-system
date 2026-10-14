#!/usr/bin/env bash
# Run every suite and print a summary table. Flags: --skip-e2e  --skip-python
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
SKIP_E2E=0; SKIP_PY=0
for a in "$@"; do case "$a" in --skip-e2e) SKIP_E2E=1;; --skip-python) SKIP_PY=1;; esac; done
ROWS=(); ANYFAIL=0
add() { ROWS+=("$1|$2|$3"); [ "$2" = FAIL ] && ANYFAIL=1; }
has_script() { [ -f "$1/package.json" ] && grep -Eq "\"$2\"[[:space:]]*:" "$1/package.json"; }
run() { # name cwd cmd...
  local name="$1" cwd="$2"; shift 2; step "$name"
  ( cd "$cwd" && "$@" ); local c=$?
  if [ $c -eq 0 ]; then add "$name" PASS "exit 0"; else add "$name" FAIL "exit $c"; fi
}
for c in server client; do
  if has_script "$ROOT/$c" test; then run "$c tests" "$ROOT/$c" $NPM test; else add "$c tests" SKIPPED "no npm test script"; fi
done
if [ "$SKIP_PY" = 0 ]; then
  PY="$(venv_python)"
  if [ -n "$PY" ]; then run "ai-service pytest" "$ROOT/ai-service" "$PY" -m pytest -q; else add "ai-service pytest" SKIPPED "venv missing"; fi
fi
if [ "$SKIP_E2E" = 0 ]; then
  if http_ok http://127.0.0.1:4000/api/v1/health; then run "e2e (live stack)" "$ROOT/tests-e2e" $NPM test; else add "e2e (live stack)" SKIPPED "stack not running"; fi
fi
echo; printf '%-24s %-8s %s\n' Suite Result Note
for r in "${ROWS[@]}"; do IFS='|' read -r a b c <<<"$r"; printf '%-24s %-8s %s\n' "$a" "$b" "$c"; done
exit $ANYFAIL
