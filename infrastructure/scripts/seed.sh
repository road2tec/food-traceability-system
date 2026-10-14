#!/usr/bin/env bash
# Seed demo data via the server's own seed script.
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
[ -f "$ROOT/server/package.json" ] || { err "server/package.json missing"; exit 1; }
grep -q '"seed"' "$ROOT/server/package.json" || { err 'server has no "seed" npm script yet'; exit 1; }
( cd "$ROOT/server" && $NPM run seed ) && ok "seed done"
