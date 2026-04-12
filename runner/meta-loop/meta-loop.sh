#!/usr/bin/env bash
# runner/meta-loop/meta-loop.sh
#
# 1 イテレーション（1 回の Claude Code 起動 + state 更新）を実行するスクリプト。
#
# Usage:
#   meta-loop.sh --target <path> [--max-iter N] [--observe-every N]
#
# Arguments:
#   --target <path>      (required) Target workspace directory
#   --max-iter N         (optional) Run N iterations then exit 0. Default: run once.
#   --observe-every N    (optional) Run meta-observer every N iterations. Default: 5.
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
# Sets: target, max_iter, observe_every
# ---------------------------------------------------------------------------
parse_args() {
  target=""
  max_iter=""
  observe_every=5

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
      --observe-every)
        if [ -z "${2:-}" ]; then
          echo "[meta-loop] error: --observe-every requires a number argument" >&2
          exit 1
        fi
        observe_every="$2"
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
# _resolve_harness_path <target> <subpath>
#
# Resolve target/.claude/harness/<subpath> using cd+pwd to transparently follow
# symlinks. This handles the case where target/.claude is a symlink (e.g.,
# workspace/ec-sample/.claude -> ../../.claude).
#
# Usage:
#   obs_log="$(_resolve_harness_path "${target}" "observation-log.jsonl")"
#
# Returns the absolute resolved path via stdout.
# If target/.claude/harness does not exist, falls back to the unresolved path.
# ---------------------------------------------------------------------------
_resolve_harness_path() {
  local target="$1"
  local subpath="$2"
  local harness_dir
  harness_dir="$(cd "${target}/.claude/harness" 2>/dev/null && pwd -P)"
  echo "${harness_dir}/${subpath}"
}

# ---------------------------------------------------------------------------
# run_post_observation <target>
#
# Fallback: if observation-log.jsonl is empty (0 entries), forcibly invoke
# claude to run product-user-reviewer and harness-user-reviewer observations.
# Best-effort: failures do not affect the main loop (caller uses || true).
# ---------------------------------------------------------------------------
run_post_observation() {
  local target="$1"
  local obs_log
  obs_log="$(_resolve_harness_path "${target}" "observation-log.jsonl")"
  local claude_bin="${META_LOOP_CLAUDE_BIN:-claude}"

  # If observation-log has at least 1 entry, skip (invoker already did it)
  if [ -f "${obs_log}" ]; then
    local before_count
    before_count="$(wc -l < "${obs_log}" | tr -d ' ')"
    if [ "${before_count}" -gt 0 ]; then
      return 0
    fi
  fi

  echo "[meta-loop] observation-log が空のため、強制的に観察レビューを実行します" >&2

  cat <<OBS_PROMPT | "${claude_bin}" --print --dangerously-skip-permissions || true
あなたは ${target} プロジェクトの観察レビューを実行してください。

1. product-user-reviewer として: ${target} の直近のコミットで追加された機能を、エンドユーザー視点で 3 点以上指摘してください。
2. harness-user-reviewer として: .claude/ 配下のスキル・ルール・エージェントの整合性を 3 点以上指摘してください。

各指摘を .claude/harness/observation-log.jsonl に以下の JSON 形式で追記してください（1行1エントリ）:
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","observer":"product-user-reviewer または harness-user-reviewer","category":"uiux|spec|error|data|a11y|workflow|consistency|enforcement|docs|agent-design","severity":"critical|warning|info","finding":"発見内容","file":"対象ファイルパス","recommendation":"推奨アクション"}

最低 6 エントリ（product 3 + harness 3）を追記してから終了してください。
OBS_PROMPT
}

# ---------------------------------------------------------------------------
# run_auto_fix <target>
#
# Periodic (every observe_every iterations) auto-fix run.
# Reads critical/warning entries from observation-log.jsonl and invokes claude
# to apply fixes via the implementer agent.
# Best-effort: failures do not affect the main loop (caller uses || true).
# ---------------------------------------------------------------------------
run_auto_fix() {
  local target="$1"
  local obs_log
  obs_log="$(_resolve_harness_path "${target}" "observation-log.jsonl")"
  local claude_bin="${META_LOOP_CLAUDE_BIN:-claude}"

  # critical/warning エントリを抽出
  local findings=""
  if [ -f "${obs_log}" ]; then
    findings="$(grep -E '"severity":"(critical|warning)"' "${obs_log}" 2>/dev/null || true)"
  fi

  if [ -z "${findings}" ]; then
    echo "[meta-loop] observation-log に修正対象の指摘なし、スキップ" >&2
    return 0
  fi

  local finding_count
  finding_count="$(echo "${findings}" | wc -l | tr -d ' ')"
  echo "[meta-loop] observation-log の指摘 ${finding_count} 件を自動修正します" >&2

  cat <<FIX_PROMPT | "${claude_bin}" --print --dangerously-skip-permissions || true
あなたは ${target} プロジェクトとハーネス（.claude/ 配下）の自動修正を実行してください。

## 重要な制約
- **全ての Edit/Write は implementer エージェントに dispatch する**
- 修正後に対応するテストが GREEN のままであることを確認する
- 修正できない指摘（設計判断が必要、スコープ外等）はスキップし、理由を progress.txt の Learnings に記録する

## 修正対象の指摘（observation-log.jsonl の critical/warning）

${findings}

## やること
1. 各指摘の recommendation を読み、implementer に修正を dispatch する
2. 修正後にテストを実行して GREEN を確認する
3. 修正した指摘について、observation-log.jsonl の該当エントリを削除するか、別途 resolved マーカーを付ける必要はない（次の archive で一括クリアされる）
4. 全修正完了後に git commit する（メッセージ: "fix: observation-log 指摘の自動修正 (N件)"）
5. progress.txt の Learnings に「自動修正で何を直したか」を追記する
FIX_PROMPT
}

# ---------------------------------------------------------------------------
# run_auto_archive <target>
#
# Periodic (every observe_every iterations) archive run.
# Appends current observation-log.jsonl to archive and truncates it.
# Best-effort: failures do not affect the main loop (caller uses || true).
# ---------------------------------------------------------------------------
run_auto_archive() {
  local target="$1"
  local obs_log
  obs_log="$(_resolve_harness_path "${target}" "observation-log.jsonl")"
  local archive_log
  archive_log="$(_resolve_harness_path "${target}" "observation-log-archive.jsonl")"

  if [ -f "${obs_log}" ] && [ -s "${obs_log}" ]; then
    cat "${obs_log}" >> "${archive_log}"
    : > "${obs_log}"
    echo "[meta-loop] observation-log をアーカイブしました" >&2
  fi
}

# ---------------------------------------------------------------------------
# run_meta_observation <target>
#
# Periodic (every observe_every iterations) meta-observer run.
# Reviews L2 observation results and adds meta-level findings.
# Best-effort: failures do not affect the main loop (caller uses || true).
# ---------------------------------------------------------------------------
run_meta_observation() {
  local target="$1"
  local obs_log
  obs_log="$(_resolve_harness_path "${target}" "observation-log.jsonl")"
  local obs_points
  obs_points="$(_resolve_harness_path "${target}" "observation-points.yaml")"
  local claude_bin="${META_LOOP_CLAUDE_BIN:-claude}"

  echo "[meta-loop] meta-observer を実行します（${observe_every} イテレーションごとの定期実行）" >&2

  local obs_content=""
  if [ -f "${obs_log}" ]; then
    obs_content="$(tail -50 "${obs_log}")"
  fi

  local points_content=""
  if [ -f "${obs_points}" ]; then
    points_content="$(cat "${obs_points}")"
  fi

  cat <<META_PROMPT | "${claude_bin}" --print --dangerously-skip-permissions || true
あなたは meta-observer（神エージェント）として、L2 監視層のレビュー結果をメタ的にレビューしてください。

## observation-log.jsonl（直近50件）
${obs_content}

## observation-points.yaml
${points_content}

## やること
1. L2 エージェント（product-user-reviewer, harness-user-reviewer）が見落としている観点を特定
2. 長期間 finding が出ていない観点の陳腐化を指摘
3. 新しい観点の提案（最大 3 件）

結果を .claude/harness/observation-log.jsonl に追記してください:
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","observer":"meta-observer","category":"coverage|staleness|overlap|discovery|prompt-quality","severity":"critical|warning|info","finding":"発見内容","recommendation":"推奨アクション"}
META_PROMPT
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
    run_post_observation "${target}" || true
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
      # Run auto-fix, archive, and meta-observer every observe_every iterations
      if [ $(( i % observe_every )) -eq 0 ]; then
        run_auto_fix "${target}" || true
        run_auto_archive "${target}" || true
        run_meta_observation "${target}" || true
      fi
      i=$(( i + 1 ))
    done
    exit 0
  else
    # Default: run once
    local exit_code=0
    local state_file="${target}/.meta-loop-state"
    run_iteration "${target}" 1 || exit_code=$?
    if [ "${exit_code}" -eq 0 ]; then
      state_increment "${state_file}" "total_iterations"
      local total
      total="$(state_read "${state_file}" "total_iterations")"
      if [ "${observe_every}" -gt 0 ] && [ "$(( total % observe_every ))" -eq 0 ]; then
        run_auto_fix "${target}" || true
        run_auto_archive "${target}" || true
        run_meta_observation "${target}" || true
      fi
    fi
    exit ${exit_code}
  fi
}

main "$@"
