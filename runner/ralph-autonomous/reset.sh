#!/usr/bin/env bash
# runner/ralph-autonomous/reset.sh
# Reset .ralph/ state: delete state.json, clear checkpoint tags, archive log.
#
# Usage:
#   reset.sh --config <path-to-.ralph-dir>
#
# Exit codes:
#   0 — success
#   1 — argument error

set -euo pipefail

# ---------------------------------------------------------------------------
# parse_args
# ---------------------------------------------------------------------------

config_dir=""

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --config)
        if [ -z "${2:-}" ]; then
          echo "[ralph] error: --config requires a path argument" >&2
          exit 1
        fi
        config_dir="$2"
        shift 2
        ;;
      *)
        echo "[ralph] error: unknown argument: $1" >&2
        exit 1
        ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

main() {
  parse_args "$@"

  if [ -z "${config_dir}" ]; then
    echo "[ralph] error: --config is required" >&2
    exit 1
  fi

  # delete state.json if present
  local state_file="${config_dir}/state.json"
  if [ -f "${state_file}" ]; then
    rm -f "${state_file}"
  fi

  # delete all ralph checkpoint tags
  # FAKE_GIT_STDOUT can be set in tests to simulate tag list output
  git tag -l 'ralph-checkpoint-*' | xargs -r git tag -d

  # archive ralph-loop.log if present
  local log_file="${config_dir}/ralph-loop.log"
  if [ -f "${log_file}" ]; then
    local timestamp
    timestamp="$(date +%Y%m%d%H%M%S)"
    mv "${log_file}" "${config_dir}/ralph-loop-archive-${timestamp}.log"
  fi

  echo "[ralph] reset done"
  exit 0
}

main "$@"
