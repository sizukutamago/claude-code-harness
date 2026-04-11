#!/usr/bin/env bash
# runner/meta-loop/test/fixtures/fake-git.sh
# Fake git binary for bats tests.
#
# Environment variables (all optional):
#   FAKE_GIT_EXIT_CODE  — exit code to return (default: 0)
#   FAKE_GIT_LOG_FILE   — if non-empty, append tab-separated args to this file

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exit_code="${FAKE_GIT_EXIT_CODE:-0}"
log_file="${FAKE_GIT_LOG_FILE:-}"

# Log all arguments if log file is specified
if [ -n "${log_file}" ]; then
  printf '%s\n' "$(IFS=$'\t'; echo "$*")" >> "${log_file}"
fi

exit "${exit_code}"
