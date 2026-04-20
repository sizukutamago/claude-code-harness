#!/usr/bin/env bash
# runner/ralph-autonomous/test/fixtures/fake-claude.sh
# Fake claude binary for bats tests.
#
# Environment variables (all optional):
#   FAKE_CLAUDE_EXIT_CODE  — exit code to return (default: 0)
#   FAKE_CLAUDE_STDOUT     — text to echo to stdout (default: "fake claude ok")
#   FAKE_CLAUDE_STDERR     — if non-empty, echo to stderr
#   FAKE_CLAUDE_LOG_FILE   — if non-empty, append tab-separated args to this file

set -euo pipefail

exit_code="${FAKE_CLAUDE_EXIT_CODE:-0}"
stdout_text="${FAKE_CLAUDE_STDOUT:-fake claude ok}"
stderr_text="${FAKE_CLAUDE_STDERR:-}"
log_file="${FAKE_CLAUDE_LOG_FILE:-}"

if [ -t 0 ]; then
  :
else
  cat > /dev/null || true
fi

if [ -n "${log_file}" ]; then
  printf '%s\n' "$(IFS=$'\t'; echo "$*")" >> "${log_file}"
fi

if [ -n "${stderr_text}" ]; then
  echo "${stderr_text}" >&2
fi

echo "${stdout_text}"
exit "${exit_code}"
