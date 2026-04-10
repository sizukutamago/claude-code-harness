#!/usr/bin/env bash
# quality-gate.sh — 品質ゲート実行エンジン
# source で読み込む前提。直接実行しない。

# state-manager.sh を source する（plan.json 読み取りのため）
_QUALITY_GATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${_QUALITY_GATE_DIR}/state-manager.sh"

# ---------------------------------------------------------------------------
# should_run_gates <step>
#   ステップが品質ゲート適用対象かどうかを判定する。
#   適用対象: tdd, simplify, test-quality, cleanup → return 0 (true)
#   非適用: code-review, verification, commit → return 1 (false)
# ---------------------------------------------------------------------------
should_run_gates() {
  local step="$1"
  case "${step}" in
    tdd|simplify|test-quality|cleanup)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# ---------------------------------------------------------------------------
# check_quality <plan_file> <story_id> <step> <gates_dir> <log_dir>
#   should_run_gates で適用対象か判定。非適用なら即 return 0。
#   plan.json の該当ストーリーの quality_gates フィールドを読む。
#   gates_dir 内のスクリプトを番号順（ls *.sh | sort）に実行する。
#   各スクリプトのファイル名から番号プレフィックスを除去した名前と quality_gates をマッチング。
#     例: 00-test.sh → test → quality_gates に "test" があれば実行
#   実行結果を log_dir に記録（$story-$step-$gate_name.log）。
#   1つでも失敗したら return 1、全成功なら return 0。
# ---------------------------------------------------------------------------
check_quality() {
  local plan_file="$1"
  local story_id="$2"
  local step="$3"
  local gates_dir="$4"
  local log_dir="$5"

  # 非適用ステップは即 return 0
  if ! should_run_gates "${step}"; then
    return 0
  fi

  # quality_gates フィールドを JSON 配列として取得
  local quality_gates
  quality_gates=$(jq -r \
    --arg id "${story_id}" \
    '.stories[] | select(.id == $id) | .quality_gates | @json' \
    "${plan_file}" 2>/dev/null || echo "[]")

  local overall_result=0

  # gates_dir 内のスクリプトを番号順にイテレート
  while IFS= read -r gate_script; do
    [ -z "${gate_script}" ] && continue

    # ファイル名からベース名を取得（例: 00-test.sh → 00-test.sh）
    local gate_basename
    gate_basename="$(basename "${gate_script}")"

    # 番号プレフィックス（NN-）を除去し、.sh を除去してゲート名を得る
    # 例: 00-test.sh → test
    local gate_name
    gate_name="${gate_basename#[0-9][0-9]-}"
    gate_name="${gate_name%.sh}"

    # quality_gates にこのゲート名が含まれているか確認
    local should_run
    should_run=$(echo "${quality_gates}" | jq -r \
      --arg name "${gate_name}" \
      'if . | index($name) then "yes" else "no" end' 2>/dev/null || echo "no")

    if [ "${should_run}" != "yes" ]; then
      continue
    fi

    # ログファイルパス
    local log_file="${log_dir}/${story_id}-${step}-${gate_name}.log"

    # ゲートを実行し、出力を tee でログに記録する
    # PIPESTATUS で exit code を正確にキャプチャする
    "${gate_script}" 2>&1 | tee "${log_file}"
    local gate_exit="${PIPESTATUS[0]}"

    if [ "${gate_exit}" -ne 0 ]; then
      overall_result=1
    fi
  done < <(ls "${gates_dir}"/*.sh 2>/dev/null | sort)

  return "${overall_result}"
}
