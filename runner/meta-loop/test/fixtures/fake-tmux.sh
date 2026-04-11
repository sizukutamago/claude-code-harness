#!/usr/bin/env bash
# runner/meta-loop/test/fixtures/fake-tmux.sh
# Fake tmux binary for bats tests.
#
# Environment variables (all optional):
#   FAKE_TMUX_SESSIONS   — comma-separated list of session names that "exist"
#                          (default: empty)
#   FAKE_TMUX_LOG_FILE   — if non-empty, append tab-separated args to this file

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

sessions="${FAKE_TMUX_SESSIONS:-}"
log_file="${FAKE_TMUX_LOG_FILE:-}"

# Log all arguments if log file is specified
if [ -n "${log_file}" ]; then
  printf '%s\n' "$(IFS=$'\t'; echo "$*")" >> "${log_file}"
fi

# Parse subcommand
subcommand="${1:-}"

case "${subcommand}" in
  has-session)
    # Parse: has-session -t <name>
    # Find -t flag and get the next argument
    local_name=""
    shift
    while [ $# -gt 0 ]; do
      if [ "$1" = "-t" ]; then
        shift
        local_name="${1:-}"
        break
      fi
      shift
    done

    # Check if local_name is in FAKE_TMUX_SESSIONS (comma-separated)
    if [ -z "${local_name}" ]; then
      exit 1
    fi

    # sessions is a comma-separated list; check membership without associative arrays
    # (Bash 3.2 compatible)
    if [ -z "${sessions}" ]; then
      exit 1
    fi

    # Wrap in commas for exact-match substring search
    if [[ ",${sessions}," == *",${local_name},"* ]]; then
      exit 0
    fi
    exit 1
    ;;

  *)
    # All other subcommands (new-session, pipe-pane, send-keys, etc.)
    # are accepted and return 0
    exit 0
    ;;
esac
