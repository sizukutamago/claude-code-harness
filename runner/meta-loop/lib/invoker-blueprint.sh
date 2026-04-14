#!/usr/bin/env bash
# runner/meta-loop/lib/invoker-blueprint.sh
# blueprint-plugin ワークフロー向け Claude Code 起動ラッパー関数ライブラリ。
#
# Usage:
#   source runner/meta-loop/lib/invoker-blueprint.sh
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
# target-dir を受け取り、blueprint-plugin ワークフロー向けの
# Claude Code セッション用プロンプト文字列を stdout に出力する。
# ---------------------------------------------------------------------------
invoker_build_prompt() {
  local target_dir="$1"
  local progress_content=""

  if [ -f "${target_dir}/progress.txt" ]; then
    progress_content="$(cat "${target_dir}/progress.txt")"
  fi

  # blueprint の CLAUDE.md を読む
  local blueprint_claude=""
  if [ -f "${target_dir}/.claude-plugin-source/CLAUDE.md" ]; then
    blueprint_claude="$(cat "${target_dir}/.claude-plugin-source/CLAUDE.md")"
  fi

  cat <<PROMPT
あなたは ${target_dir} プロジェクトの次のタスクを1イテレーション実行してください。

## ワークフロー

blueprint-plugin のワークフローに従ってください:
1. /requirements で要件を定義
2. /spec で Contract YAML を作成
3. /test-from-contract でテストを生成
4. /implement で実装
5. テストが GREEN になることを確認

## 重要な制約

- **全ての Edit/Write は implementer エージェントに dispatch する**。直接書き込もうとすると coordinator-write-guard にブロックされる
- 1 イテレーション = 1 story 完了が目安
- .claude/ 配下は symlink でハーネス本体を参照している

## blueprint-plugin 参照

${blueprint_claude}

## 作業対象ディレクトリ

${target_dir}

## 現在の進捗 (progress.txt)

${progress_content}

## 各 Story 完了後の必須アクション（観察レビュー）

Story を 1 つ完了し git commit した後、**必ず以下の観察レビューを実行してから終了すること。これをスキップしてはならない。**

1. product-user-reviewer エージェントを dispatch し、.claude/harness/observation-log.jsonl に追記
2. harness-user-reviewer エージェントを dispatch し、同じく追記
3. progress.txt の Learnings に観察レビューの要約を追記

## 終了時の必須アクション

${target_dir}/progress.txt を更新し git commit すること。
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
