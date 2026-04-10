#!/usr/bin/env bash
# ralph-runner.sh — RALPH Runner v1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/state-manager.sh"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/quality-gate.sh"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/prompt-builder.sh"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/conventions-builder.sh"

# ---------------------------------------------------------------------------
# デフォルト値
# ---------------------------------------------------------------------------
DEFAULT_PLAN_FILE=".claude/harness/plan.json"
DEFAULT_GATES_DIR="${SCRIPT_DIR}/gates"
DEFAULT_RUNS_DIR=".claude/harness/runs"

DRY_RUN=0

# ---------------------------------------------------------------------------
# 引数パース
# ---------------------------------------------------------------------------
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --plan)
        PLAN_FILE="$2"
        shift 2
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --gates-dir)
        GATES_DIR_OVERRIDE="$2"
        shift 2
        ;;
      --runs-dir)
        RUNS_DIR="$2"
        shift 2
        ;;
      *)
        echo "Unknown argument: $1" >&2
        exit 1
        ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# --dry-run: 実行計画を表示する
# ---------------------------------------------------------------------------
show_dry_run() {
  local plan_file="$1"
  echo "=== RALPH Runner — Dry Run ==="
  echo ""
  echo "Plan: ${plan_file}"
  echo ""
  echo "Stories:"
  jq -r '.stories[] | "  \(.id): \(.title) [status=\(.status)] depends_on=[\(.depends_on | join(","))]"' \
    "${plan_file}"
  echo ""
  echo "Steps:"
  jq -r '.steps[]' "${plan_file}" | while IFS= read -r step; do
    echo "  - ${step}"
  done
  echo ""
  echo "Total stories: $(jq '.stories | length' "${plan_file}")"
}

# ---------------------------------------------------------------------------
# run_story_step <story_id> <step> <plan_file> <learnings_file>
#   <conventions_file> <gates_dir> <run_log_dir>
#   最大3回試行。品質ゲート適用ステップはゲートも実行。
#   成功: return 0, 失敗: return 1
# ---------------------------------------------------------------------------
run_story_step() {
  local story_id="$1"
  local step="$2"
  local plan_file="$3"
  local learnings_file="$4"
  local conventions_file="$5"
  local gates_dir="$6"
  local run_log_dir="$7"

  local max_attempts=3
  local attempt=0

  while [ "${attempt}" -lt "${max_attempts}" ]; do
    attempt=$((attempt + 1))
    increment_step_attempts "${plan_file}" "${story_id}" "${step}"

    # プロンプト構築
    local prompt
    prompt="$(build_prompt \
      "${plan_file}" \
      "${learnings_file}" \
      "${conventions_file}" \
      "${story_id}" \
      "${step}")"

    # ログファイルパス（run_log_dir は呼び出し元で作成済み）
    local log_file="${run_log_dir}/${story_id}-${step}-attempt${attempt}.log"

    # claude -p 実行（exit code を確実に取得するため一時ファイルを使う）
    local claude_exit=0
    local exit_code_file
    exit_code_file="$(mktemp "${TMPDIR:-/tmp}/claude-exit.XXXXXX")"
    {
      claude -p "${prompt}" \
        --allowedTools "Edit,Write,Read,Grep,Glob,Bash,Agent" \
        2>&1
      echo "$?" > "${exit_code_file}"
    } | tee "${log_file}" || true
    claude_exit="$(cat "${exit_code_file}" 2>/dev/null || echo "0")"
    rm -f "${exit_code_file}"

    # LEARNING 抽出
    local step_output
    step_output="$(cat "${log_file}" 2>/dev/null || true)"
    extract_learnings "${step_output}" "${learnings_file}" "${story_id}" "${step}"

    # claude が失敗した場合もリトライ
    if [ "${claude_exit}" -ne 0 ]; then
      record_learning "${learnings_file}" "${story_id}" "${step}" "retry" \
        "Attempt ${attempt} failed: claude exited with ${claude_exit}"
      continue
    fi

    # 品質ゲート（適用対象ステップのみ）
    if should_run_gates "${step}"; then
      if check_quality "${plan_file}" "${story_id}" "${step}" "${gates_dir}" "${run_log_dir}"; then
        return 0
      fi
      # ゲート失敗 → learnings に記録してリトライ
      record_learning "${learnings_file}" "${story_id}" "${step}" "retry" \
        "Attempt ${attempt} failed: quality gate failed"
    else
      # 品質ゲート非適用 → 即成功
      return 0
    fi
  done

  return 1  # 3回失敗
}

# ---------------------------------------------------------------------------
# メイン処理
# ---------------------------------------------------------------------------
main() {
  parse_args "$@"

  # ファイルパスを確定（環境変数による上書きを優先）
  local plan_file="${PLAN_FILE:-${DEFAULT_PLAN_FILE}}"
  local learnings_file="${LEARNINGS_FILE:-$(dirname "${plan_file}")/learnings.jsonl}"
  local conventions_file="${CONVENTIONS_FILE:-$(dirname "${plan_file}")/conventions.md}"
  local gates_dir="${GATES_DIR_OVERRIDE:-${DEFAULT_GATES_DIR}}"
  local runs_dir="${RUNS_DIR:-${DEFAULT_RUNS_DIR}}"

  # --dry-run モード
  if [ "${DRY_RUN}" -eq 1 ]; then
    show_dry_run "${plan_file}"
    exit 0
  fi

  # ファイル存在確認
  if [ ! -f "${plan_file}" ]; then
    echo "Error: plan file not found: ${plan_file}" >&2
    exit 1
  fi

  # RUN_ID を生成
  local run_id
  run_id="run-$(date +%Y%m%d-%H%M%S)"

  # ログディレクトリを作成
  local run_log_dir="${runs_dir}/${run_id}"
  mkdir -p "${run_log_dir}"

  # メインループ
  while true; do
    # 次に実行可能なストーリーを選択
    local story_id
    story_id="$(next_ready_story "${plan_file}")"

    # 実行可能なストーリーがなければ終了
    if [ -z "${story_id}" ]; then
      break
    fi

    # ステータスを in_progress に更新
    update_status "${plan_file}" "${story_id}" "in_progress"

    # plan.json からステップ一覧を取得
    local steps_json
    steps_json="$(jq -r '.steps[]' "${plan_file}")"

    local story_failed=0

    # 各ステップを実行
    while IFS= read -r step; do
      update_current_step "${plan_file}" "${story_id}" "${step}"

      if run_story_step \
        "${story_id}" \
        "${step}" \
        "${plan_file}" \
        "${learnings_file}" \
        "${conventions_file}" \
        "${gates_dir}" \
        "${run_log_dir}"; then
        add_completed_step "${plan_file}" "${story_id}" "${step}"
      else
        # ステップ失敗
        update_status "${plan_file}" "${story_id}" "failed"
        record_skip_reason "${plan_file}" "${story_id}" "Step ${step} failed after max attempts"
        skip_dependents "${plan_file}" "${story_id}"
        story_failed=1
        break
      fi
    done <<< "${steps_json}"

    # 全ステップ成功 → completed
    if [ "${story_failed}" -eq 0 ]; then
      update_status "${plan_file}" "${story_id}" "completed"
      # conventions への昇格チェック（内部の grep が 0 件の場合も正常終了にする）
      check_and_promote \
        "${learnings_file}" \
        "$(dirname "${learnings_file}")/learnings-archive.jsonl" \
        "${conventions_file}" || true
    fi
  done

  # サマリを生成してファイルに保存し stdout にも出力
  local summary_file="${run_log_dir}/summary.json"
  generate_summary "${plan_file}" "${run_id}" | tee "${summary_file}"
}

main "$@"
