#!/usr/bin/env bash
# Shared helpers (source). Works in Git Bash on Windows and on Linux/macOS.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_DIR="$ROOT/infrastructure/.run"
mkdir -p "$RUN_DIR"

step() { printf '==> %s\n' "$*"; }
ok()   { printf '[OK]   %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*"; }
err()  { printf '[FAIL] %s\n' "$*" >&2; }

venv_python() {
  if [ -x "$ROOT/ai-service/.venv/Scripts/python.exe" ]; then echo "$ROOT/ai-service/.venv/Scripts/python.exe"
  elif [ -x "$ROOT/ai-service/.venv/bin/python" ]; then echo "$ROOT/ai-service/.venv/bin/python"
  fi
}

is_windows() { case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) return 0;; *) return 1;; esac; }
NPM=npm; is_windows && NPM=npm.cmd

http_ok() { curl -fsS -m 4 -o /dev/null "$1" 2>/dev/null; }
wait_http() { # url timeoutSec
  local end=$(( $(date +%s) + ${2:-60} ))
  while [ "$(date +%s)" -lt "$end" ]; do http_ok "$1" && return 0; sleep 2; done
  return 1
}
port_open() { # port
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && return 0 || return 1
}
dotenv_get() { # key
  [ -f "$ROOT/.env" ] && grep -E "^$1=" "$ROOT/.env" | head -1 | cut -d= -f2-
}
stop_pidfile() { # name
  local f="$RUN_DIR/$1.pid"
  [ -f "$f" ] || { echo "  $1 : no pid file"; return 0; }
  local pid; pid="$(head -1 "$f" | tr -d '[:space:]')"
  if [ -n "$pid" ]; then
    if is_windows; then
      if taskkill //PID "$pid" //T //F >/dev/null 2>&1; then ok "$1 stopped (pid $pid)"; else echo "  $1 : pid $pid not running (stale)"; fi
    else
      if kill -0 "$pid" 2>/dev/null; then pkill -P "$pid" 2>/dev/null; kill "$pid" 2>/dev/null; ok "$1 stopped (pid $pid)"; else echo "  $1 : pid $pid not running (stale)"; fi
    fi
  fi
  rm -f "$f"
}
start_bg() { # name cwd cmd...
  local name="$1" cwd="$2"; shift 2
  local f="$RUN_DIR/$name.pid"
  if [ -f "$f" ]; then
    local old; old="$(head -1 "$f")"
    if kill -0 "$old" 2>/dev/null; then echo "  $name already running (pid $old)"; return 0; fi
  fi
  ( cd "$cwd" && nohup "$@" >"$RUN_DIR/$name.out.log" 2>"$RUN_DIR/$name.err.log" & echo $! >"$f" )
  ok "$name started (pid $(cat "$f")); logs: $RUN_DIR/$name.out.log"
}
# NOTE: under Git Bash the stored PID is the MSYS pid; stop_pidfile uses taskkill which needs the Windows pid.
# For reliable Windows stop prefer stop-all.ps1. On Linux/macOS this script works as-is.
