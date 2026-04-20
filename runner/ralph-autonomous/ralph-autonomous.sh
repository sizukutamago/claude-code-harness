#!/usr/bin/env bash
# runner/ralph-autonomous/ralph-autonomous.sh
#
# 1 iter（orient → implement → gates → commit → mark → log → dual exit check）を実行する。
#
# Usage:
#   ralph-autonomous.sh --config <path-to-.ralph> [--resume]
#
# Arguments:
#   --config <path>  (required) .ralph/ ディレクトリへのパス
#   --resume         (optional) 前回の state.json を引き継いで再開
#
# Exit codes:
#   0  正常完了（1 iter 完了、EXIT_SIGNAL 未検出）
#   1  引数エラー
#   2  前提欠落（config.json 不在、必須フィールド欠落）
#   3  サーキットブレーカー（連続失敗上限）
#   4  claude 起動失敗
#   5  gate 失敗（quality or reviewer MUST 指摘）
#   6  スコープ違反
#   10 EXIT_SIGNAL 検出（全タスク完了）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source library files
# shellcheck source=lib/config.sh
source "${SCRIPT_DIR}/lib/config.sh"
# shellcheck source=lib/state.sh
source "${SCRIPT_DIR}/lib/state.sh"
# shellcheck source=lib/invoker.sh
source "${SCRIPT_DIR}/lib/invoker.sh"
# shellcheck source=lib/scope-check.sh
source "${SCRIPT_DIR}/lib/scope-check.sh"
# shellcheck source=lib/gates.sh
source "${SCRIPT_DIR}/lib/gates.sh"

# ---------------------------------------------------------------------------
# parse_args
#
# --config / --resume をパースする。
# Sets: config_dir, resume
# ---------------------------------------------------------------------------
parse_args() {
  config_dir=""
  resume=0

  while [ $# -gt 0 ]; do
    case "$1" in
      --config)
        if [ -z "${2:-}" ]; then
          echo "[ralph-autonomous] error: --config requires a path argument" >&2
          exit 1
        fi
        config_dir="$2"
        shift 2
        ;;
      --resume)
        resume=1
        shift
        ;;
      *)
        echo "[ralph-autonomous] error: unknown argument: $1" >&2
        exit 1
        ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# check_preconditions
#
# - --config が指定されていない → exit 2
# - config.json が存在しない → exit 2
# - config_validate が失敗 → exit 2
# ---------------------------------------------------------------------------
check_preconditions() {
  if [ -z "${config_dir}" ]; then
    echo "[ralph-autonomous] error: --config is required" >&2
    exit 2
  fi

  local config_file="${config_dir}/config.json"

  if [ ! -f "${config_file}" ]; then
    echo "[ralph-autonomous] error: config.json not found: ${config_file}" >&2
    exit 2
  fi

  if ! config_validate "${config_file}"; then
    exit 2
  fi
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
main() {
  parse_args "$@"
  check_preconditions

  local config_file="${config_dir}/config.json"
  local state_file="${config_dir}/state.json"
  local log_dir="${config_dir}/logs"
  local gates_dir="${RALPH_GATES_DIR:-${SCRIPT_DIR}/../gates}"
  # cwd は config_dir の親ディレクトリ（.ralph/ の親 = プロジェクトルート）
  local cwd
  cwd="$(cd "${config_dir}/.." && pwd)"

  # fresh start: --resume なし時は state.json を削除してから初期化
  if [ "${resume}" -eq 0 ]; then
    rm -f "${state_file}"
  fi
  state_init "${state_file}"

  # ------ invoker_run ------
  local invoker_exit=0
  invoker_run "${config_file}" "${cwd}" || invoker_exit=$?

  if [ "${invoker_exit}" -eq 4 ]; then
    # claude 起動失敗
    state_increment "${state_file}" "consecutive_failures"
    local failures
    failures="$(state_read "${state_file}" "consecutive_failures")"
    if [ "${failures}" -ge 3 ]; then
      echo "[ralph-autonomous] 連続3回失敗で停止 (consecutive_failures=${failures})" >&2
      exit 3
    fi
    exit 4
  fi

  if [ "${invoker_exit}" -eq 10 ]; then
    # EXIT_SIGNAL 検出 → スコープ確認
    local scope_exit=0
    scope_check_run "${config_file}" "${cwd}" || scope_exit=$?
    if [ "${scope_exit}" -ne 0 ]; then
      echo "[ralph-autonomous] scope check failed after EXIT_SIGNAL" >&2
      exit 6
    fi
    exit 10
  fi

  # ------ scope_check_run ------
  local scope_exit=0
  scope_check_run "${config_file}" "${cwd}" || scope_exit=$?
  if [ "${scope_exit}" -ne 0 ]; then
    echo "[ralph-autonomous] scope check failed" >&2
    exit 6
  fi

  # ------ gates_run_quality ------
  local quality_exit=0
  gates_run_quality "${config_file}" "${gates_dir}" "${log_dir}" || quality_exit=$?
  if [ "${quality_exit}" -ne 0 ]; then
    echo "[ralph-autonomous] quality gate failed" >&2
    exit 5
  fi

  # ------ gates_run_reviewers ------
  local reviewer_exit=0
  gates_run_reviewers "${config_file}" "${cwd}" || reviewer_exit=$?
  if [ "${reviewer_exit}" -ne 0 ]; then
    echo "[ralph-autonomous] reviewer gate failed" >&2
    exit 5
  fi

  # ------ iter++ / reset failure ------
  state_increment "${state_file}" "iter"
  state_reset_failure "${state_file}"

  exit 0
}

main "$@"
