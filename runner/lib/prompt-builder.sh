#!/usr/bin/env bash
# prompt-builder.sh — claude -p に渡すプロンプトを組み立てる関数
# source で読み込む前提。直接実行しない。

# state-manager.sh をロードする（get_learnings_for_story を使う）
_PROMPT_BUILDER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${_PROMPT_BUILDER_DIR}/state-manager.sh"

# ---------------------------------------------------------------------------
# build_prompt <plan_file> <learnings_file> <conventions_file> <story_id> <step>
#   指定ストーリーと実行ステップに対応するプロンプト文字列を stdout に出力する。
#
#   プロンプトの構成:
#   - ストーリー ID・タイトル・説明・AC
#   - conventions.md の全文（存在しない場合は "(no conventions yet)"）
#   - 関連 learnings の content 箇条書き（0件の場合は "(no learnings yet)"）
#   - completed_steps の一覧
#   - スキルコマンド実行指示 + LEARNING 出力フォーマット
# ---------------------------------------------------------------------------
build_prompt() {
  local plan_file="$1"
  local learnings_file="$2"
  local conventions_file="$3"
  local story_id="$4"
  local step="$5"

  # plan.json からストーリー情報を取得する
  local title
  title="$(jq -r --arg sid "${story_id}" \
    '.stories[] | select(.id == $sid) | .title' "${plan_file}" 2>/dev/null || true)"

  local description
  description="$(jq -r --arg sid "${story_id}" \
    '.stories[] | select(.id == $sid) | .description // ""' "${plan_file}" 2>/dev/null || true)"

  # AC を箇条書きに変換する
  local ac_lines
  ac_lines="$(jq -r --arg sid "${story_id}" \
    '.stories[] | select(.id == $sid) | .ac[] | "- " + .' "${plan_file}" 2>/dev/null || true)"

  # completed_steps を取得する
  local completed_steps_lines
  completed_steps_lines="$(jq -r --arg sid "${story_id}" \
    '.stories[] | select(.id == $sid) | .completed_steps[] // empty' "${plan_file}" 2>/dev/null || true)"

  # conventions.md の内容を読み込む
  local conventions_content
  if [ -f "${conventions_file}" ]; then
    conventions_content="$(cat "${conventions_file}")"
  else
    conventions_content="(no conventions yet)"
  fi

  # 関連 learnings を取得する
  local learnings_raw
  learnings_raw="$(get_learnings_for_story "${learnings_file}" "${plan_file}" "${story_id}" 2>/dev/null || true)"

  local learnings_content
  if [ -n "${learnings_raw}" ]; then
    # 各 content を "- " 箇条書きにする
    learnings_content="$(while IFS= read -r line; do
      [ -n "${line}" ] && printf '%s\n' "- ${line}"
    done <<< "${learnings_raw}")"
  else
    learnings_content="(no learnings yet)"
  fi

  # プロンプトを組み立てて出力する
  printf 'You are executing story %s step [%s].\n' "${story_id}" "${step}"
  printf '\n'
  printf '## Story\n'
  printf 'Title: %s\n' "${title}"
  if [ -n "${description}" ]; then
    printf 'Description: %s\n' "${description}"
  fi
  printf 'Acceptance Criteria:\n'
  printf '%s\n' "${ac_lines}"
  printf '\n'
  printf '## Project Conventions\n'
  printf '%s\n' "${conventions_content}"
  printf '\n'
  printf '## Learnings from previous iterations\n'
  printf '%s\n' "${learnings_content}"
  printf '\n'
  printf '## Previous steps completed\n'
  if [ -n "${completed_steps_lines}" ]; then
    printf '%s\n' "${completed_steps_lines}"
  fi
  printf '\n'
  printf '## Instruction\n'
  printf 'Run /%s to implement this story.\n' "${step}"
  printf 'When done, output your learnings in the following format:\n'
  printf 'LEARNING: type=pattern|gotcha|fix content="..."\n'
}
