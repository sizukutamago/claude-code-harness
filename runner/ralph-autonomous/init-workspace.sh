#!/usr/bin/env bash
# runner/ralph-autonomous/init-workspace.sh
# Initialize .ralph/ workspace with config.json template.
#
# Usage:
#   init-workspace.sh --config <path-to-.ralph-dir> [--plan-id <id>] [--branch <branch-name>]
#
# Exit codes:
#   0 — success (generated or already exists)
#   1 — argument error

set -euo pipefail

# ---------------------------------------------------------------------------
# parse_args
# ---------------------------------------------------------------------------

config_dir=""
plan_id=""
branch_name=""

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
      --plan-id)
        if [ -z "${2:-}" ]; then
          echo "[ralph] error: --plan-id requires a value" >&2
          exit 1
        fi
        plan_id="$2"
        shift 2
        ;;
      --branch)
        if [ -z "${2:-}" ]; then
          echo "[ralph] error: --branch requires a value" >&2
          exit 1
        fi
        branch_name="$2"
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

  local config_file="${config_dir}/config.json"

  # idempotency: skip if config.json already exists
  if [ -f "${config_file}" ]; then
    echo "config.json already exists"
    exit 0
  fi

  # resolve plan_id and branch_name
  local resolved_plan_id="${plan_id:-default}"
  local resolved_branch="${branch_name:-ralph/${resolved_plan_id}}"

  # ensure config_dir exists
  mkdir -p "${config_dir}"

  # generate config.json template
  cat > "${config_file}" <<JSON
{
  "schema_version": "1.0",
  "plan_id": "${resolved_plan_id}",
  "branch_name": "${resolved_branch}",
  "mode": "autonomous",
  "references": {
    "requirements": "docs/requirements/${resolved_plan_id}.md",
    "design": "docs/design/${resolved_plan_id}.md",
    "plan": "docs/plans/${resolved_plan_id}.md"
  },
  "scope": {
    "allowed_paths": ["src/**", "tests/**"],
    "forbidden_paths": [".claude/**", "docs/decisions/**", ".ralph/**", ".github/**"],
    "max_files_changed": 30
  },
  "stop_conditions": {
    "max_iter": 10,
    "no_progress_iter": 3,
    "same_error_iter": 5,
    "test_only_ratio_threshold": 0.3,
    "time_budget_seconds": 7200
  },
  "gates": {
    "quality": ["00-test.sh", "01-typecheck.sh"],
    "reviewers": ["spec-compliance", "quality", "security"],
    "enforce_review_memory_hot": true
  },
  "exit_signal": {
    "required": true,
    "marker": "EXIT_SIGNAL"
  }
}
JSON

  # create or switch to feature branch
  if git show-ref --verify --quiet "refs/heads/${resolved_branch}" 2>/dev/null; then
    git checkout "${resolved_branch}"
  else
    git checkout -b "${resolved_branch}"
  fi

  echo "[ralph] init-workspace done: ${config_file}"
  exit 0
}

main "$@"
