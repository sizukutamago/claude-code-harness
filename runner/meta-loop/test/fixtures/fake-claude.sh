#!/usr/bin/env bash
# runner/meta-loop/test/fixtures/fake-claude.sh
# Fake claude binary for bats tests.
#
# Environment variables (all optional):
#   FAKE_CLAUDE_EXIT_CODE  — exit code to return (default: 0)
#   FAKE_CLAUDE_STDOUT     — text to echo to stdout (default: "fake claude ok")
#   FAKE_CLAUDE_STDERR     — if non-empty, echo to stderr
#   FAKE_CLAUDE_LOG_FILE   — if non-empty, append tab-separated args to this file

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Read environment variables with defaults
exit_code="${FAKE_CLAUDE_EXIT_CODE:-0}"
stdout_text="${FAKE_CLAUDE_STDOUT:-fake claude ok}"
stderr_text="${FAKE_CLAUDE_STDERR:-}"
log_file="${FAKE_CLAUDE_LOG_FILE:-}"

# Drain stdin (accept but discard)
if [ -t 0 ]; then
  : # stdin is a terminal, nothing to drain
else
  cat > /dev/null || true
fi

# Log arguments if log file is specified
if [ -n "${log_file}" ]; then
  printf '%s\n' "$(IFS=$'\t'; echo "$*")" >> "${log_file}"
fi

# Output to stderr if specified
if [ -n "${stderr_text}" ]; then
  echo "${stderr_text}" >&2
fi

# Output to stdout
echo "${stdout_text}"

exit "${exit_code}"
