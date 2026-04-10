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
# validate_plan <plan_file>
#   plan.json の全ストーリー ID が ^[A-Za-z0-9_-]+$ にマッチすることを検証する。
#   空文字・不正な ID が存在する場合はエラーメッセージを stderr に出力して exit 1 する。
# ---------------------------------------------------------------------------
validate_plan() {
  local plan_file="$1"
  # jq で正規表現に合わない ID（空文字を含む）を抽出する
  local invalid_count
  invalid_count=$(jq -r '[.stories[].id | select(test("^[A-Za-z0-9_-]+$") | not)] | length' "${plan_file}")
  if [ "${invalid_count}" -gt 0 ]; then
    local invalid_ids
    invalid_ids=$(jq -r '.stories[].id | select(test("^[A-Za-z0-9_-]+$") | not)' "${plan_file}")
    echo "Error: invalid story IDs in plan.json:" >&2
    echo "${invalid_ids}" >&2
    echo "Story IDs must match ^[A-Za-z0-9_-]+\$" >&2
    exit 1
  fi
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

    # claude -p 実行。PIPESTATUS[0] で claude の exit code を正確に取得する。
    # set -e が pipeline 失敗で即終了しないよう一時的に無効化する。
    set +e
    claude -p "${prompt}" \
      --allowedTools "Edit,Write,Read,Grep,Glob,Bash,Agent" \
      2>&1 | tee "${log_file}"
    local claude_exit="${PIPESTATUS[0]}"
    set -e

    # LEARNING 抽出
    extract_learnings "${log_file}" "${learnings_file}" "${story_id}" "${step}"

    # claude が失敗した場合もリトライ
    if [ "${claude_exit}" -ne 0 ]; then
      record_learning "${learnings_file}" "${story_id}" "${step}" "retry" \
        "Attempt ${attempt} failed: claude exited with ${claude_exit}"
      continue
    fi

    # 品質ゲート。check_quality 内部で should_run_gates を判定するため、
    # 呼び出し側ではガードしない（判定ロジックを一箇所に集約）。
    if check_quality "${plan_file}" "${story_id}" "${step}" "${gates_dir}" "${run_log_dir}"; then
      return 0
    fi

    # ゲート失敗 → learnings に記録してリトライ
    record_learning "${learnings_file}" "${story_id}" "${step}" "retry" \
      "Attempt ${attempt} failed: quality gate failed"
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

  # story_id のバリデーション（パストラバーサル防止）
  validate_plan "${plan_file}"

  # gates_dir を絶対パスに正規化する（シンボリックリンク・相対パスを解決）
  if [ -d "${gates_dir}" ]; then
    gates_dir="$(cd "${gates_dir}" && pwd -P)"
  else
    echo "Error: gates directory not found: ${gates_dir}" >&2
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
        record_failed_reason "${plan_file}" "${story_id}" "Step ${step} failed after max attempts"
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
