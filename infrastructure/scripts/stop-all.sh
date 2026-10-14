#!/usr/bin/env bash
# Stop processes started by start-all.sh. Does not stop MongoDB.
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
for n in client server ai-service; do stop_pidfile "$n"; done
