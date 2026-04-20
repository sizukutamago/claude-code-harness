# runner/ralph-autonomous/lib/gates.sh
# quality gates および reviewer gates の実行ライブラリ
# source で読み込む前提。#!/usr/bin/env bash / set -euo pipefail は呼び出し側が設定する。

_GATES_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${_GATES_LIB_DIR}/config.sh"

# gates_run_quality <config-file> <gates-dir> <log-dir>
#   config.gates.quality に列挙されたスクリプトを gates-dir から番号順に実行する。
#   各スクリプトの出力を log-dir/<gate-name>.log に保存する。
#   1つでも失敗 → exit 5
#   全成功 → exit 0
gates_run_quality() {
  local config_file="$1"
  local gates_dir="$2"
  local log_dir="$3"

  mkdir -p "${log_dir}"

  # config.gates.quality を1行1要素で取得
  local gate_names
  gate_names="$(config_read_array "${config_file}" ".gates.quality")"

  # 空配列のときはそのまま成功
  if [[ -z "${gate_names}" ]]; then
    return 0
  fi

  local overall_exit=0

  while IFS= read -r gate_name; do
    [[ -z "${gate_name}" ]] && continue

    local gate_script="${gates_dir}/${gate_name}"
    local log_file="${log_dir}/${gate_name}.log"

    if [[ ! -x "${gate_script}" ]]; then
      echo "gates_run_quality: gate script not found or not executable: ${gate_script}" >&2
      overall_exit=5
      continue
    fi

    # 実行して出力をログに保存
    if ! "${gate_script}" > "${log_file}" 2>&1; then
      overall_exit=5
    fi
  done <<< "${gate_names}"

  return "${overall_exit}"
}

# gates_run_reviewers <config-file> <cwd>
#   config.gates.reviewers に列挙された各 reviewer を claude で dispatch する。
#   いずれかの出力に "REVIEW_MUST:" が含まれる場合 → exit 5
#   全 reviewer が "REVIEW_OK" のみ → exit 0
#   環境変数 RALPH_CLAUDE_BIN でバイナリを上書き可（デフォルト: claude）
gates_run_reviewers() {
  local config_file="$1"
  local cwd="$2"

  local claude_bin="${RALPH_CLAUDE_BIN:-claude}"

  # config.gates.reviewers を1行1要素で取得
  local reviewer_names
  reviewer_names="$(config_read_array "${config_file}" ".gates.reviewers")"

  if [[ -z "${reviewer_names}" ]]; then
    return 0
  fi

  local overall_exit=0

  while IFS= read -r reviewer; do
    [[ -z "${reviewer}" ]] && continue

    local prompt
    prompt="$(cat <<PROMPT
あなたは ${reviewer} レビュアーとして振る舞い、${cwd} の直近のコミット（git diff HEAD~1 HEAD）をレビューしてください。
MUST 指摘がある場合は "REVIEW_MUST: <内容>" の形式で報告してください。
MUST 指摘がなければ "REVIEW_OK" のみ出力して終了してください。
PROMPT
)"

    local output
    output="$("${claude_bin}" --print --dangerously-skip-permissions <<< "${prompt}" 2>/dev/null || true)"

    if echo "${output}" | grep -qF "REVIEW_MUST:"; then
      overall_exit=5
    fi
  done <<< "${reviewer_names}"

  return "${overall_exit}"
}
