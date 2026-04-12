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

## 各 Story 完了後の必須アクション（観察レビュー）

Story を 1 つ完了し git commit した後、**必ず以下の観察レビューを実行してから終了すること。これをスキップしてはならない。**

1. product-user-reviewer エージェントを dispatch する:
   - プロンプト: 「${target_dir} の直近のコミットで追加/変更された機能を、エンドユーザー視点でレビューしてください。発見を .claude/harness/observation-log.jsonl に JSON 形式で追記してください。形式: {"timestamp":"ISO8601","observer":"product-user-reviewer","category":"uiux|spec|error|data|a11y","severity":"critical|warning|info","finding":"発見内容","file":"対象ファイル","recommendation":"推奨アクション"}」

2. harness-user-reviewer エージェントを dispatch する:
   - プロンプト: 「.claude/ 配下のスキル・ルール・エージェント・hooks の整合性を、ハーネスを導入するチームメンバーの視点でレビューしてください。発見を .claude/harness/observation-log.jsonl に JSON 形式で追記してください。形式は product-user-reviewer と同じで observer を "harness-user-reviewer" にしてください。」

3. progress.txt の Learnings セクションに、観察レビューで見つかった critical/warning の要約を追記する

**Story の実装だけ完了して観察レビューをスキップした場合、そのイテレーションは未完了とみなす。**
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
