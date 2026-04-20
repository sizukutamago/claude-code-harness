#!/usr/bin/env bash
# runner/ralph-autonomous/test/fixtures/fake-git.sh
# Fake git binary for bats tests.
#
# Environment variables (all optional):
#   FAKE_GIT_EXIT_CODE  — exit code to return (default: 0)
#   FAKE_GIT_STDOUT     — text to echo to stdout (default: "")
#   FAKE_GIT_LOG_FILE   — if non-empty, append tab-separated args to this file

set -euo pipefail

exit_code="${FAKE_GIT_EXIT_CODE:-0}"
stdout_text="${FAKE_GIT_STDOUT:-}"
log_file="${FAKE_GIT_LOG_FILE:-}"

if [ -n "${log_file}" ]; then
  printf '%s\n' "$(IFS=$'\t'; echo "$*")" >> "${log_file}"
fi

if [ -n "${stdout_text}" ]; then
  echo "${stdout_text}"
fi

exit "${exit_code}"
