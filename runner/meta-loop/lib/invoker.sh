#!/usr/bin/env bash
# runner/meta-loop/lib/invoker.sh
# Claude Code 起動ラッパー関数ライブラリ。
#
# Usage:
#   source runner/meta-loop/lib/invoker.sh
#
# Provided functions:
#   invoker_build_prompt <target-dir>   — stdout にプロンプト文字列を出力
#   invoker_run <target-dir>            — claude --print を stdin 経由で起動
#
# Environment variables:
#   META_LOOP_CLAUDE_BIN   — claude バイナリ名またはパス (default: claude)
#
# Note: set -euo pipefail は呼び出し側で設定される前提。本ファイルでは set しない。
# Bash 3.2+ 互換。外部コマンドは cat, echo のみ使用。

# ---------------------------------------------------------------------------
# invoker_build_prompt <target-dir>
#
# target-dir を受け取り、Claude Code セッション向けのプロンプト文字列を
# stdout に出力する。
# ---------------------------------------------------------------------------
invoker_build_prompt() {
  local target_dir="$1"
  local progress_content=""

  if [ -f "${target_dir}/progress.txt" ]; then
    progress_content="$(cat "${target_dir}/progress.txt")"
  fi

  cat <<PROMPT
あなたは coordinator として振る舞い、${target_dir} プロジェクトの次のタスクを1イテレーション実行してください。

## 重要な制約

- **全ての Edit/Write は implementer エージェントに dispatch する**。直接書き込もうとすると coordinator-write-guard にブロックされる
- ハーネス \`.claude/\` 配下は symlink でハーネス本体を参照している。ハーネス改善も implementer 経由で行う
- 1 イテレーション = 1 story 完了が目安

## 作業対象ディレクトリ

${target_dir}

## 現在の進捗 (progress.txt)

${progress_content}

## 終了時の必須アクション

終了時に \`${target_dir}/progress.txt\` を更新し git commit すること。
PROMPT
}

# ---------------------------------------------------------------------------
# invoker_run <target-dir>
#
# invoker_build_prompt の出力を stdin として claude --print に渡して実行する。
# stdout/stderr はそのまま親プロセスに流す。
# claude の終了コードをそのまま返す。
# ---------------------------------------------------------------------------
invoker_run() {
  local target_dir="$1"
  local claude_bin="${META_LOOP_CLAUDE_BIN:-claude}"

  invoker_build_prompt "${target_dir}" | "${claude_bin}" --print --dangerously-skip-permissions
}
