# runner/ralph-autonomous/lib/invoker.sh
# Claude Code 起動ラッパー関数ライブラリ（ralph autonomous モード用）
#
# Usage:
#   source runner/ralph-autonomous/lib/invoker.sh
#
# Provided functions:
#   invoker_build_prompt <config-file> <cwd>   — stdout にプロンプト文字列を出力
#   invoker_run <config-file> <cwd>            — claude --print を stdin 経由で起動
#
# Environment variables:
#   RALPH_CLAUDE_BIN   — claude バイナリ名またはパス (default: claude)
#
# Note: set -euo pipefail は呼び出し側で設定される前提。本ファイルでは set しない。

_INVOKER_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# _invoker_read_file <file-path>
#
# ファイルの内容を stdout に出力する。
# ファイルが存在しない場合は "(file not found)" を出力する。
# ---------------------------------------------------------------------------
_invoker_read_file() {
  local file_path="$1"
  if [ -f "${file_path}" ]; then
    cat "${file_path}"
  else
    printf '(file not found)'
  fi
}

# ---------------------------------------------------------------------------
# _invoker_resolve_and_read <ref-path> <cwd>
#
# ref-path が絶対パスならそのまま、相対パスなら cwd を基点として解決し
# ファイルの内容を stdout に出力する。ref-path が空の場合も "(file not found)"。
# ---------------------------------------------------------------------------
_invoker_resolve_and_read() {
  local ref_path="$1"
  local cwd="$2"
  if [ -z "${ref_path}" ]; then
    printf '(file not found)'
    return 0
  fi
  if [[ "${ref_path}" = /* ]]; then
    _invoker_read_file "${ref_path}"
  else
    _invoker_read_file "${cwd}/${ref_path}"
  fi
}

# ---------------------------------------------------------------------------
# invoker_build_prompt <config-file> <cwd>
#
# config.json から references を読み取り、progress.txt と合わせて
# Claude Code セッション向けのプロンプト文字列を stdout に出力する。
# ---------------------------------------------------------------------------
invoker_build_prompt() {
  local config_file="$1"
  local cwd="$2"

  # config.sh を source して config_read を使えるようにする
  # 既に source 済みの場合は再 source しても問題ない
  source "${_INVOKER_LIB_DIR}/config.sh"

  local req_path design_path plan_path
  req_path="$(config_read "${config_file}" ".references.requirements")"
  design_path="$(config_read "${config_file}" ".references.design")"
  plan_path="$(config_read "${config_file}" ".references.plan")"

  local req_content design_content plan_content progress_content
  req_content="$(_invoker_resolve_and_read "${req_path}" "${cwd}")"
  design_content="$(_invoker_resolve_and_read "${design_path}" "${cwd}")"
  plan_content="$(_invoker_resolve_and_read "${plan_path}" "${cwd}")"

  if [ -f "${cwd}/progress.txt" ]; then
    progress_content="$(cat "${cwd}/progress.txt")"
  else
    progress_content=""
  fi

  cat <<PROMPT
あなたは ralph autonomous coordinator として振る舞い、plan.md の最初の未完了タスクを1イテレーション実行してください。

## 重要な制約

- **全ての Edit/Write は implementer エージェントに dispatch する**（coordinator-write-guard が直接書き込みをブロックする）
- plan.md のチェックボックスのみ更新可（[ ] → [x]）、他の行は変更しない
- 1 タスク完了したら "EXIT_SIGNAL" を stdout の最終行に出力して終了する
- 完了条件を満たす前に EXIT_SIGNAL を出力しない

## 参照ドキュメント

### requirements
${req_content}

### design
${design_content}

### plan（チェックボックスのみ更新可）
${plan_content}

## 現在の進捗 (progress.txt)

${progress_content}

## 実行手順

1. plan.md から最初の \`- [ ]\` タスクを選ぶ
2. そのタスクを実装する（implementer を dispatch）
3. 実装完了後 plan.md の該当チェックボックスを \`- [x]\` に更新
4. progress.txt に学びを追記してコミット
5. 全タスクが完了している場合のみ "EXIT_SIGNAL" を最終行に出力して終了

## 気づきの記録（重要）

実装中に気づいたワークフローの抜け穴・スキル間矛盾・既存ハーネスの問題点は、
progress.txt に以下のフォーマットで追記してください:

\`\`\`
## 気づき (iter N)
- [trigger]: <何が起きたか>
- [instruction]: <今後どうすべきか>
- [reason]: <なぜ>
\`\`\`

これは harness-user-reviewer が Sign 化パイプラインで参照します。
PROMPT
}

# ---------------------------------------------------------------------------
# invoker_run <config-file> <cwd>
#
# invoker_build_prompt の出力を stdin として claude --print に渡して実行する。
# stdout を .ralph/claude-last-output.txt に保存する。
# exit codes:
#   0  — 正常完了（EXIT_SIGNAL なし）
#   4  — claude 起動失敗 or 非 0 終了
#   10 — EXIT_SIGNAL 検出（stdout 最終行）
# ---------------------------------------------------------------------------
invoker_run() {
  local config_file="$1"
  local cwd="$2"
  local claude_bin="${RALPH_CLAUDE_BIN:-claude}"
  local output_file="${cwd}/.ralph/claude-last-output.txt"

  mkdir -p "${cwd}/.ralph"

  # exit_signal.marker を config から読み取る（デフォルト: EXIT_SIGNAL）
  source "${_INVOKER_LIB_DIR}/config.sh"
  local exit_marker
  exit_marker="$(config_read "${config_file}" ".exit_signal.marker")"
  if [ -z "${exit_marker}" ]; then
    exit_marker="EXIT_SIGNAL"
  fi

  local claude_output claude_exit
  claude_output="$(invoker_build_prompt "${config_file}" "${cwd}" | "${claude_bin}" --print --dangerously-skip-permissions)" || claude_exit=$?
  : "${claude_exit:=0}"

  # stdout をファイルに保存
  printf '%s\n' "${claude_output}" > "${output_file}"

  # claude が非 0 終了なら exit 4
  if [ "${claude_exit}" -ne 0 ]; then
    return 4
  fi

  # stdout 最終行が exit_marker かチェック
  local last_line
  last_line="$(printf '%s\n' "${claude_output}" | tail -n 1)"
  if [ "${last_line}" = "${exit_marker}" ]; then
    return 10
  fi

  return 0
}
