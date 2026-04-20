#!/usr/bin/env bash
# runner/ralph-autonomous/bootstrap.sh
# Check that all required commands are available.
#
# Usage:
#   bootstrap.sh
#
# Exit codes:
#   0 — all required commands are present
#   2 — one or more required commands are missing
#
# Environment variables:
#   RALPH_REQUIRED_COMMANDS — space-separated list of commands to check
#                             (default: "jq git tmux claude")

set -euo pipefail

RALPH_REQUIRED_COMMANDS="${RALPH_REQUIRED_COMMANDS:-jq git tmux claude}"

missing=0

for cmd in ${RALPH_REQUIRED_COMMANDS}; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "[ralph] missing: ${cmd}" >&2
    missing=1
  fi
done

if [ "${missing}" -eq 1 ]; then
  exit 2
fi

echo "[ralph] bootstrap OK"
exit 0
