#!/usr/bin/env bash
# runner/meta-loop/bootstrap-blueprint.sh
# Clone sizukutamago/blueprint-plugin into runner/meta-loop/vendor/blueprint/.
#
# Exit codes:
#   0 — success (new clone or idempotent skip)
#   1 — argument error (reserved for future use)
#   2 — prerequisite missing (git not found) or clone failed
#
# Environment variables:
#   META_LOOP_BOOTSTRAP_BLUEPRINT_TARGET_DIR — override clone target directory (for testing)

set -euo pipefail

SCRIPT_DIR="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"

BLUEPRINT_REPO_URL="https://github.com/sizukutamago/blueprint-plugin.git"

# Determine target directory: environment override or default
if [ -n "${META_LOOP_BOOTSTRAP_BLUEPRINT_TARGET_DIR:-}" ]; then
  TARGET_DIR="${META_LOOP_BOOTSTRAP_BLUEPRINT_TARGET_DIR}"
else
  TARGET_DIR="${SCRIPT_DIR}/vendor/blueprint"
fi

# ---------------------------------------------------------------------------
# Idempotency check: skip if target already exists
# ---------------------------------------------------------------------------
if [ -d "${TARGET_DIR}" ]; then
  echo "WARNING: '${TARGET_DIR}' already exists — skipping clone." >&2
  exit 0
fi

# ---------------------------------------------------------------------------
# Prerequisite check: git must be in PATH
# ---------------------------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git command not found in PATH." >&2
  echo "       Please install git and try again." >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# Clone
# ---------------------------------------------------------------------------
if ! git clone --depth 1 "${BLUEPRINT_REPO_URL}" "${TARGET_DIR}"; then
  echo "ERROR: git clone failed for '${BLUEPRINT_REPO_URL}'." >&2
  exit 2
fi

exit 0
