#!/usr/bin/env bash
# runner/ralph-autonomous/test/fixtures/fake-tmux.sh
# Fake tmux binary for bats tests.

set -euo pipefail

sessions="${FAKE_TMUX_SESSIONS:-}"
log_file="${FAKE_TMUX_LOG_FILE:-}"

if [ -n "${log_file}" ]; then
  printf '%s\n' "$(IFS=$'\t'; echo "$*")" >> "${log_file}"
fi

subcommand="${1:-}"

case "${subcommand}" in
  has-session)
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
    if [ -z "${local_name}" ]; then
      exit 1
    fi
    if [ -z "${sessions}" ]; then
      exit 1
    fi
    if [[ ",${sessions}," == *",${local_name},"* ]]; then
      exit 0
    fi
    exit 1
    ;;
  *)
    exit 0
    ;;
esac
