#!/usr/bin/env bash
# runner/meta-loop/meta-loop.sh
#
# 1 イテレーション（1 回の Claude Code 起動 + state 更新）を実行するスクリプト。
#
# Usage:
#   meta-loop.sh --target <path> [--max-iter N]
#
# Arguments:
#   --target <path>   (required) Target workspace directory
#   --max-iter N      (optional) Run N iterations then exit 0. Default: run once.
#
# Exit codes:
#   0  Normal completion (1 iteration or --max-iter N completed)
#   1  Argument error
#   2  Precondition missing (--target not specified, or progress.txt absent)
#   3  Consecutive failure limit reached (3 times)
#   4  Invoker execution failure (claude binary not found, etc.)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source library files
# shellcheck source=lib/state.sh
source "${SCRIPT_DIR}/lib/state.sh"
# shellcheck source=lib/invoker.sh
source "${SCRIPT_DIR}/lib/invoker.sh"

# ---------------------------------------------------------------------------
# parse_args
#
# Parse command-line arguments.
# Sets: target, max_iter
# ---------------------------------------------------------------------------
parse_args() {
  target=""
  max_iter=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --target)
        if [ -z "${2:-}" ]; then
          echo "[meta-loop] error: --target requires a path argument" >&2
          exit 1
        fi
        target="$2"
        shift 2
        ;;
      --max-iter)
        if [ -z "${2:-}" ]; then
          echo "[meta-loop] error: --max-iter requires a number argument" >&2
          exit 1
        fi
        max_iter="$2"
        shift 2
        ;;
      *)
        echo "[meta-loop] error: unknown argument: $1" >&2
        exit 1
        ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# check_preconditions <target>
#
# Verify that:
#   - target is set
#   - target/progress.txt exists
# Exits with code 2 on failure.
# ---------------------------------------------------------------------------
check_preconditions() {
  local t="$1"

  if [ -z "${t}" ]; then
    echo "[meta-loop] error: --target is required" >&2
    exit 2
  fi

  if [ ! -f "${t}/progress.txt" ]; then
    echo "[meta-loop] error: progress.txt not found in '${t}' (run init-workspace first)" >&2
    exit 2
  fi
}

# ---------------------------------------------------------------------------
# run_iteration <target> <iter_num>
#
# Run one iteration:
#   1. Invoke claude via invoker_run
#   2. Update state based on exit code
#   3. If consecutive_failures >= 3, print summary and exit 3
#
# Returns:
#   0  success
#   non-0  failure (exit code from invoker)
# ---------------------------------------------------------------------------
run_iteration() {
  local target="$1"
  local iter_num="$2"
  local state_file="${target}/.meta-loop-state"

  local iter_result=0
  local iter_exit=0

  if invoker_run "${target}"; then
    state_reset_failure "${state_file}"
    iter_result=0
  else
    iter_exit=$?
    state_increment_failure "${state_file}"
    iter_result=${iter_exit}

    local failures
    failures="$(state_read "${state_file}" consecutive_failures)"
    if [ "${failures}" -ge 3 ]; then
      echo "[meta-loop] 連続3回失敗で停止 (iteration=${iter_num}, last_exit=${iter_exit}, target=${target})" >&2
      exit 3
    fi
  fi

  return ${iter_result}
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
main() {
  parse_args "$@"
  check_preconditions "${target}"

  if [ -n "${max_iter}" ]; then
    # --max-iter N: run N iterations.
    # Per spec: if one iteration fails, exit with that code immediately.
    local i=1
    while [ "${i}" -le "${max_iter}" ]; do
      local iter_code=0
      run_iteration "${target}" "${i}" || iter_code=$?
      if [ "${iter_code}" -ne 0 ]; then
        exit "${iter_code}"
      fi
      i=$(( i + 1 ))
    done
    exit 0
  else
    # Default: run once
    local exit_code=0
    run_iteration "${target}" 1 || exit_code=$?
    exit ${exit_code}
  fi
}

main "$@"
