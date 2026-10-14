#!/usr/bin/env bash
# Drop ONLY the local food_traceability dev DB. Requires --force.  Optional: --reseed
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
FORCE=0; RESEED=0
for a in "$@"; do case "$a" in --force) FORCE=1;; --reseed) RESEED=1;; esac; done
[ "$FORCE" = 1 ] || { err "Refusing: this DROPS food_traceability. Re-run with --force."; exit 2; }
URI="$(dotenv_get MONGODB_URI)"; URI="${URI:-mongodb://127.0.0.1:27017/food_traceability}"
echo "$URI" | grep -Eq '/food_traceability(\?|$)' || { err "MONGODB_URI is not food_traceability ($URI). Aborting."; exit 2; }
echo "$URI" | grep -Eq '127\.0\.0\.1|localhost' || { err "MONGODB_URI not local. Aborting."; exit 2; }
[ -d "$ROOT/tests-e2e/node_modules/mongodb" ] || { err "Run setup.sh first (tests-e2e needs the mongodb driver)."; exit 1; }
MONGODB_URI="$URI" node "$ROOT/tests-e2e/lib/drop-db.mjs"
ok "food_traceability dropped"
[ "$RESEED" = 1 ] && "$(dirname "${BASH_SOURCE[0]}")/seed.sh"
exit 0
