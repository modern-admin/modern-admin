#!/usr/bin/env bash
# Launch the reference dev servers with stdout/stderr captured to log files
# so they can be inspected after the fact (and by tooling like Claude that
# cannot attach to a live terminal).
#
# Usage:
#   scripts/dev.sh start   [service ...]   # default: api-prisma web
#   scripts/dev.sh stop    [service ...]   # default: all running
#   scripts/dev.sh restart [service ...]
#   scripts/dev.sh status
#   scripts/dev.sh logs    <service>       # print path to current log
#   scripts/dev.sh tail    <service>       # follow log (Ctrl-C to stop)
#
# Known services: api, api-prisma, web.
# Logs:  .dev-logs/<service>.log   (truncated each start; previous run
#                                    rotated to <service>.prev.log)
# PIDs:  .dev-logs/<service>.pid

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_DIR/.dev-logs"

# bun lives in ~/.bun/bin which isn't always on PATH for non-interactive shells
export PATH="$HOME/.bun/bin:$PATH"

mkdir -p "$LOG_DIR"

# service → working directory (relative to repo root)
service_cwd() {
  case "$1" in
    api)             echo "apps/api" ;;
    api-prisma)      echo "apps/api-prisma" ;;
    web)             echo "apps/web" ;;
    *) return 1 ;;
  esac
}

# Ports the playwright e2e config expects — keeping the dev servers on the
# same ports lets `reuseExistingServer: true` skip the in-test launch.
API_PORT=3001
WEB_PORT=5173

# service → extra env vars (one per line, KEY=VALUE)
service_env() {
  case "$1" in
    api)
      printf 'API_PORT=%s\n' "$API_PORT"
      printf 'WEB_ORIGIN=http://localhost:%s\n' "$WEB_PORT"
      # Demo runs the in-process cache so HIT/MISS/BYPASS is observable
      # via `x-cache` headers (and matches what the e2e config expects).
      printf 'CACHE_BACKEND=memory\n'
      ;;
    api-prisma)
      printf 'API_PORT=%s\n' "$API_PORT"
      printf 'WEB_ORIGIN=http://localhost:%s\n' "$WEB_PORT"
      printf 'CACHE_BACKEND=memory\n'
      ;;
    web)
      printf 'WEB_PORT=%s\n' "$WEB_PORT"
      printf 'VITE_API_URL=http://localhost:%s\n' "$API_PORT"
      ;;
  esac
}

ALL_SERVICES=(api api-prisma web)
DEFAULT_SERVICES=(api-prisma web)

log_file() { echo "$LOG_DIR/$1.log"; }
prev_log_file() { echo "$LOG_DIR/$1.prev.log"; }
pid_file() { echo "$LOG_DIR/$1.pid"; }

is_running() {
  local pid_path="$(pid_file "$1")"
  [[ -f "$pid_path" ]] || return 1
  local pid
  pid="$(cat "$pid_path" 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

start_one() {
  local svc="$1"
  local cwd
  cwd="$(service_cwd "$svc")" || { echo "unknown service: $svc" >&2; return 2; }

  if is_running "$svc"; then
    echo "[$svc] already running (pid $(cat "$(pid_file "$svc")"))"
    return 0
  fi

  # Rotate previous log so each start has a fresh, small file
  if [[ -f "$(log_file "$svc")" ]]; then
    mv -f "$(log_file "$svc")" "$(prev_log_file "$svc")"
  fi

  (
    cd "$REPO_DIR/$cwd"
    # Export service-specific env vars (API_PORT, WEB_PORT, …) so the
    # processes bind to the ports the e2e config expects.
    while IFS= read -r kv; do
      [[ -n "$kv" ]] && export "$kv"
    done < <(service_env "$svc")
    # setsid → new session so the child outlives this script's terminal.
    # Re-exec with stdin from /dev/null so bun --watch doesn't think the
    # tty went away.
    setsid bash -c 'exec bun run dev' \
      </dev/null \
      >>"$(log_file "$svc")" 2>&1 &
    echo $! > "$(pid_file "$svc")"
  )
  # Give the child a moment to either fail fast or settle
  sleep 0.3
  if is_running "$svc"; then
    echo "[$svc] started (pid $(cat "$(pid_file "$svc")"))  log: $(log_file "$svc")"
  else
    echo "[$svc] FAILED to start; see $(log_file "$svc")" >&2
    return 1
  fi
}

stop_one() {
  local svc="$1"
  if ! is_running "$svc"; then
    echo "[$svc] not running"
    rm -f "$(pid_file "$svc")"
    return 0
  fi
  local pid
  pid="$(cat "$(pid_file "$svc")")"
  # Kill the entire process group (setsid above made one)
  kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  # Wait up to ~5s for graceful shutdown
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! kill -0 "$pid" 2>/dev/null; then break; fi
    sleep 0.5
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$(pid_file "$svc")"
  echo "[$svc] stopped"
}

status() {
  for svc in "${ALL_SERVICES[@]}"; do
    if is_running "$svc"; then
      echo "[$svc] running (pid $(cat "$(pid_file "$svc")"))  log: $(log_file "$svc")"
    else
      echo "[$svc] stopped"
    fi
  done
}

resolve_targets() {
  # Echo selected service names, one per line. "all" or no args picks defaults.
  if [[ $# -eq 0 ]]; then
    printf '%s\n' "${DEFAULT_SERVICES[@]}"
    return
  fi
  for arg in "$@"; do
    if [[ "$arg" == "all" ]]; then
      printf '%s\n' "${ALL_SERVICES[@]}"
    else
      service_cwd "$arg" >/dev/null || { echo "unknown service: $arg" >&2; exit 2; }
      echo "$arg"
    fi
  done
}

cmd="${1:-status}"
shift || true

case "$cmd" in
  start)
    while read -r svc; do start_one "$svc"; done < <(resolve_targets "$@")
    ;;
  stop)
    if [[ $# -eq 0 ]]; then
      # default = stop everything that's running
      for svc in "${ALL_SERVICES[@]}"; do stop_one "$svc"; done
    else
      while read -r svc; do stop_one "$svc"; done < <(resolve_targets "$@")
    fi
    ;;
  restart)
    while read -r svc; do stop_one "$svc"; done < <(resolve_targets "$@")
    while read -r svc; do start_one "$svc"; done < <(resolve_targets "$@")
    ;;
  status) status ;;
  logs)
    svc="${1:-}"; [[ -n "$svc" ]] || { echo "usage: dev.sh logs <service>" >&2; exit 2; }
    service_cwd "$svc" >/dev/null || { echo "unknown service: $svc" >&2; exit 2; }
    echo "$(log_file "$svc")"
    ;;
  tail)
    svc="${1:-}"; [[ -n "$svc" ]] || { echo "usage: dev.sh tail <service>" >&2; exit 2; }
    service_cwd "$svc" >/dev/null || { echo "unknown service: $svc" >&2; exit 2; }
    exec tail -F "$(log_file "$svc")"
    ;;
  -h|--help|help)
    sed -n '2,18p' "$0"
    ;;
  *)
    echo "unknown command: $cmd" >&2
    sed -n '2,18p' "$0" >&2
    exit 2
    ;;
esac
