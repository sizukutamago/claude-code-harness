# runner/ralph-autonomous/lib/observation.sh
# Observation layer: reviewer dispatch library for ralph autonomous mode.
#
# Usage:
#   source runner/ralph-autonomous/lib/observation.sh
#
# Provided functions:
#   observation_dispatch_exit <cwd> <log-dir>
#     — Tier 2: dispatch product-user-reviewer and meta-observer serially.
#       Saves each reviewer output to <log-dir>/observation-<reviewer>.log.
#       Always returns 0 unless the claude binary cannot be launched.
#
#   _observation_dispatch_reviewer <reviewer-name> <cwd> <log-file>
#     — Internal helper: dispatch a single reviewer.
#
# Environment variables:
#   RALPH_CLAUDE_BIN   — override claude binary (default: claude)
#
# Note: set -euo pipefail is set by the caller. Do not set it here.

# ---------------------------------------------------------------------------
# _observation_dispatch_reviewer <reviewer-name> <cwd> <log-file>
#
# dispatch a single observation reviewer via claude --print.
# Saves stdout to log-file.
# Returns 0 on success, non-0 if claude binary is missing or fails to launch.
# ---------------------------------------------------------------------------
_observation_dispatch_reviewer() {
  local reviewer_name="$1"
  local cwd="$2"
  local log_file="$3"
  local claude_bin="${RALPH_CLAUDE_BIN:-claude}"

  local prompt
  prompt="$(cat <<PROMPT
あなたは ${reviewer_name} として振る舞い、以下のプロジェクトを観察してください。

## 対象プロジェクト

${cwd}

## 指示

プロジェクトの状態（コード品質・ワークフローの抜け穴・スキル間矛盾・既存ハーネスの問題点）を観察し、
気づきがあれば observation-log.jsonl に以下のフォーマットで追記してください:

{
  "timestamp": "<ISO8601>",
  "reviewer": "${reviewer_name}",
  "severity": "critical|warning|info",
  "finding": "<何が問題か>",
  "recommendation": "<どうすべきか>"
}

観察が完了したら "OBSERVATION_DONE" と出力して終了してください。
PROMPT
)"

  # claude の存在確認
  if ! command -v "${claude_bin}" > /dev/null 2>&1; then
    echo "_observation_dispatch_reviewer: claude binary not found: ${claude_bin}" >&2
    return 1
  fi

  mkdir -p "$(dirname "${log_file}")"

  local output claude_exit=0
  output="$("${claude_bin}" --print --dangerously-skip-permissions <<< "${prompt}" 2>&1)" || claude_exit=$?

  printf '%s\n' "${output}" > "${log_file}"

  if [ "${claude_exit}" -ne 0 ]; then
    return "${claude_exit}"
  fi

  return 0
}

# ---------------------------------------------------------------------------
# observation_dispatch_exit <cwd> <log-dir>
#
# Tier 2: dispatch product-user-reviewer and meta-observer serially.
# Each reviewer output is saved to <log-dir>/observation-<reviewer>.log.
# Always returns 0 (observation is non-blocking); returns non-0 only when
# the claude binary cannot be launched at all.
# ---------------------------------------------------------------------------
observation_dispatch_exit() {
  local cwd="$1"
  local log_dir="$2"

  mkdir -p "${log_dir}"

  local reviewers=("product-user-reviewer" "meta-observer")
  local overall_exit=0

  for reviewer in "${reviewers[@]}"; do
    local log_file="${log_dir}/observation-${reviewer}.log"
    local dispatch_exit=0
    _observation_dispatch_reviewer "${reviewer}" "${cwd}" "${log_file}" || dispatch_exit=$?
    if [ "${dispatch_exit}" -ne 0 ]; then
      overall_exit="${dispatch_exit}"
    fi
  done

  return "${overall_exit}"
}
