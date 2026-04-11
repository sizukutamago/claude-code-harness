# REQ-002 Phase 1 Go/No-Go ゲート記録

## PC-1: snarktank/ralph のライセンス確認

- **Status**: PASS
- **Date**: 2026-04-12
- **検証方法**: `https://raw.githubusercontent.com/snarktank/ralph/main/LICENSE` を WebFetch で取得
- **結果**: **MIT License**（Copyright 2026 snarktank）
- **判断**: vendor 取り込み可能。設計（ADR-0015）通りに `runner/meta-loop/vendor/ralph/` に clone する方式で進める
- **記録**: Task-5 の bootstrap.sh 実装時、`runner/meta-loop/vendor/ralph/LICENSE` がそのまま保持されるため、MIT の著作権表示要求（条項 1）を自動的に満たす

## PC-2: claude --print --dangerously-skip-permissions の smoke test

- **Status**: PASS
- **Date**: 2026-04-12
- **検証コマンド**:
  ```
  echo "Print exactly the text 'hello from meta-loop pc-2 test' and exit. Do not use any tools." | timeout 60 claude --print --dangerously-skip-permissions
  ```
- **結果**: `hello from meta-loop pc-2 test` が stdout に出力されて正常終了。permission prompt は発生せず
- **環境**: `/Applications/cmux.app/Contents/Resources/bin/claude` version 2.1.101
- **判断**: FR-2 の実現方式（meta-loop.sh から claude --print を起動）は実機で動作する

## PC-3: workspace symlink と coordinator-write-guard の相性検証

- **Status**: CONDITIONAL PASS（設計修正なしで進むが、注意点あり）
- **Date**: 2026-04-12
- **検証内容**:
  1. `/tmp/claude/pc3-test/workspace/ec-sample/.claude -> /Users/sizukutamago/.../claude-code-harness/.claude` の symlink を作成
  2. symlink 経由で `.claude/rules/workflow.md` を `cat` → 内容読み取り成功
  3. coordinator-write-guard に以下の 3 パターンの JSON 入力を投入:
     - (a) 符号化パス `/tmp/.../workspace/ec-sample/.claude/rules/workflow.md`, coordinator から → exit 2（ブロック）
     - (b) 符号化パス `/tmp/.../workspace/ec-sample/package.json`, coordinator から → exit 2（ブロック）
     - (c) 符号化パス `/tmp/.../workspace/ec-sample/package.json`, `agent_id=impl-abc, agent_type=implementer` あり → exit 0（許可）
- **結果の解釈**:
  - symlink 経由の読み取りは透過的に動作する（AC-3 の前提を満たす）
  - coordinator-write-guard は **パス文字列** で判定するため、`.claude/` 配下 symlink および `workspace/ec-sample/` 配下の両方で coordinator 直書きをブロックする
  - サブエージェント（`agent_id`/`agent_type` あり）からの書き込みは正常に許可される
- **判断**: **設計通りの動作**。メタループ内の Claude Code が fresh spawn されたメインセッションとして `.claude/` や `workspace/ec-sample/` 内のファイルを直接編集しようとするとブロックされるが、これは「メインセッションはコードを書かない」原則が symlink 経由でも一貫して適用される正しい挙動
- **注意点（Task-6/Task-7 で留意）**:
  - **workspace 内で fresh spawn された Claude Code は、あらゆる書き込みを必ず implementer 経由で行う必要がある**。メインセッションが package.json や .claude/rules/ を直接 Edit しようとすると全てブロックされる
  - `invoker.sh` が Claude Code に渡すプロンプトには「このセッションは coordinator なので、全ての Edit/Write は implementer サブエージェントに dispatch すること」を明示する必要がある
  - 逆に言えば、guard をいじる必要はない（fb-014 で拡張済みの docs/design/, docs/decisions/, docs/plans/ と既存の .claude/harness/, HANDOVER.md, CLAUDE.md, requirements/ で十分。workspace 内の初期ファイル作成も implementer 経由なので問題なし）

## 判定

PC-1 / PC-2 / PC-3 すべてクリア（PC-3 は条件付き）。

**Phase 1 の全タスク（Task-1 〜 Task-11）に実装着手可能。**

ただし Task-4（invoker.sh のプロンプトビルダー）の実装時、以下を必ず含めること:
- メタループ内のメインセッションは「coordinator として」振る舞う
- 全ての Edit/Write は implementer エージェントに dispatch する
- 直接書き込もうとすると coordinator-write-guard にブロックされる

これらは `invoker_build_prompt` の出力（プロンプトテンプレート）に明示的に記載する。
