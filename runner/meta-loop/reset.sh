#!/usr/bin/env bash
# runner/meta-loop/reset.sh
# Archive workspace/ec-sample/ and re-initialize it with init-workspace.sh.
#
# Usage:
#   reset.sh
#
# Exit codes:
#   0 - success
#   2 - tmux session is running, workspace does not exist, or precondition error

set -euo pipefail

# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# Environment variable overrides (for testability)
# ---------------------------------------------------------------------------

META_LOOP_WORKSPACE_DIR="${META_LOOP_WORKSPACE_DIR:-${SCRIPT_DIR}/../../workspace/ec-sample}"
META_LOOP_ARCHIVE_ROOT="${META_LOOP_ARCHIVE_ROOT:-${SCRIPT_DIR}/../../workspace/_archive}"
META_LOOP_TMUX_BIN="${META_LOOP_TMUX_BIN:-tmux}"
META_LOOP_INIT_WORKSPACE_BIN="${META_LOOP_INIT_WORKSPACE_BIN:-${SCRIPT_DIR}/init-workspace.sh}"

# ---------------------------------------------------------------------------
# _check_tmux_session
#
# If the meta-loop-ec tmux session is running, print an error to stderr
# and exit 2.
# ---------------------------------------------------------------------------

_check_tmux_session() {
  if "${META_LOOP_TMUX_BIN}" has-session -t meta-loop-ec 2>/dev/null; then
    echo "Error: tmux session 'meta-loop-ec' is active (running). Stop the session before resetting." >&2
    echo "  tmux kill-session -t meta-loop-ec" >&2
    exit 2
  fi
}

# ---------------------------------------------------------------------------
# _check_workspace_exists
#
# If META_LOOP_WORKSPACE_DIR does not exist, print an error to stderr
# and exit 2.
# ---------------------------------------------------------------------------

_check_workspace_exists() {
  if [[ ! -e "${META_LOOP_WORKSPACE_DIR}" ]]; then
    echo "Error: workspace not found: ${META_LOOP_WORKSPACE_DIR}" >&2
    exit 2
  fi
}

# ---------------------------------------------------------------------------
# _archive
#
# Source archive.sh and call archive_workspace.
# Captures and prints the archive destination path.
# ---------------------------------------------------------------------------

_archive() {
  # shellcheck source=lib/archive.sh
  source "${SCRIPT_DIR}/lib/archive.sh"

  local dest
  dest="$(archive_workspace "${META_LOOP_WORKSPACE_DIR}" "${META_LOOP_ARCHIVE_ROOT}")"
  echo "Archived workspace to: ${dest}"
}

# ---------------------------------------------------------------------------
# _reinit
#
# Call init-workspace.sh --force to re-create the workspace.
# ---------------------------------------------------------------------------

_reinit() {
  "${META_LOOP_INIT_WORKSPACE_BIN}" --force
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

main() {
  _check_tmux_session
  _check_workspace_exists
  _archive
  _reinit
}

main "$@"
