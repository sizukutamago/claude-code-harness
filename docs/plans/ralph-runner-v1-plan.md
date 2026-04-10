---
status: Completed
owner: sizukutamago
last_updated: 2026-04-09
---

# RALPH Runner v1 — 実装計画

## 計画概要

10タスクで実装。state-manager を基盤とし、lib/ の各コンポーネントを開発、最後にメインループで統合する。テストは bats（Bash Automated Testing System）を使用。

## スコープ

本計画は runner/ ディレクトリの新規実装のみを対象とする。

**スコープ内**: FR-1〜FR-8, FR-10（runner の実装に直接関わる要件）
**スコープ外**: FR-9（planning スキルの plan.json 出力への変更）— planning スキルの改修は別計画で対応

## タスク一覧

### Task-1: テスト基盤のセットアップ

- **やること**: bats テストフレームワーク導入、テスト用ヘルパー関数、フィクスチャ（サンプル plan.json, learnings.jsonl）を作成。jq の存在確認を組み込む
- **対応FR**: 全 FR の基盤
- **依存**: なし
- **成果物**: `runner/test/test_helper.bash`, `runner/test/fixtures/`
- **完了条件**: bats でヘルパーをロードしたダミーテストが GREEN、jq 存在確認が通る

### Task-2: state-manager.sh — plan.json 基本操作

- **やること**: plan.json の基本的な読み書き関数を実装
  - `next_ready_story` — pending + 依存解決済みのストーリーを返す
  - `update_status` — ステータス更新
  - `update_current_step` — current_step 更新
  - `add_completed_step` — completed_steps に追加
  - `increment_step_attempts` — step_attempts をインクリメント
- **対応FR**: FR-3
- **依存**: Task-1
- **成果物**: `runner/lib/state-manager.sh`, `runner/test/state-manager.bats`
- **完了条件**: 依存解決済みストーリー選択（依存先未完了のストーリーはスキップ）、ステータス遷移（pending→in_progress→completed/failed）、step_attempts インクリメントのテストが GREEN

### Task-3: state-manager.sh — 依存解決・スキップ・サマリ

- **やること**: plan.json の依存解決とサマリ生成関数を実装
  - `record_skip_reason` — skipped_reason を記録
  - `skip_dependents` — 失敗ストーリーに依存するストーリーを再帰的に skipped にする
  - `generate_summary` — ラン全体のサマリ JSON 生成（completed/failed/skipped 数、所要時間等）
- **対応FR**: FR-5
- **依存**: Task-2（基本操作の上に構築）
- **成果物**: `runner/lib/state-manager.sh`（Task-2 に追記）, `runner/test/state-manager-skip.bats`
- **完了条件**: 再帰スキップ（A失敗→B,C がスキップ、C に依存する D もスキップ）、skipped_reason 記録、サマリ JSON の completed/failed/skipped カウントが正しいテストが GREEN

### Task-4: state-manager.sh — learnings.jsonl 操作

- **やること**: learnings.jsonl に対する操作関数群を実装
  - `record_learning` — learnings.jsonl に1行追記
  - `extract_learnings` — claude -p の stdout から LEARNING: 行を grep 抽出し learnings.jsonl に追記
  - `get_learnings_for_story` — 特定ストーリー + 依存ストーリーの learnings 取得
  - `archive_learnings` — 指定エントリを learnings-archive.jsonl に移動
- **対応FR**: FR-3, FR-6
- **依存**: Task-2（state-manager.sh に追記、next_ready_story 等を参照して依存ストーリーを解決）
- **成果物**: `runner/lib/state-manager.sh`（Task-3 に追記）, `runner/test/state-manager-learnings.bats`
- **完了条件**: JSONL 追記、LEARNING: 行抽出（正常フォーマット + フォーマット崩れ時のスキップ）、ストーリー別フィルタ（依存ストーリー含む）、アーカイブ移動のテストが GREEN

### Task-5: prompt-builder.sh — プロンプト構築

- **やること**: `build_prompt` 関数を実装。plan.json からストーリー情報を取得し、conventions.md（Hot 層）+ learnings（Warm 層）+ completed_steps を組み合わせてプロンプト文字列を生成
- **対応FR**: FR-2, FR-6
- **依存**: Task-2, Task-4
- **成果物**: `runner/lib/prompt-builder.sh`, `runner/test/prompt-builder.bats`
- **完了条件**: プロンプトにストーリー詳細・conventions 全文・関連 learnings・completed_steps・正しいスキルコマンド（/tdd, /simplify 等）・LEARNING 出力指示が含まれることをテストで検証

### Task-6: conventions-builder.sh — learnings → conventions.md 昇格

- **やること**: learnings.jsonl を分析し、完全一致で3回以上出現するエントリを conventions.md に昇格させる
  - `check_and_promote` — 昇格候補を特定
  - `promote_to_conventions` — conventions.md に追記 + archive に移動
  - `build_conventions_md` — conventions.md をカテゴリ別に再構築
- **対応FR**: FR-6
- **依存**: Task-4
- **成果物**: `runner/lib/conventions-builder.sh`, `.claude/harness/conventions.md`（初期生成）, `runner/test/conventions-builder.bats`
- **完了条件**: 3回以上出現エントリの昇格、未満エントリの非昇格、archive 移動、conventions.md のカテゴリ別整形、conventions.md ファイル生成のテストが GREEN

### Task-7: gates/ — 個別ゲートスクリプト

- **やること**: 3つのデフォルトゲートスクリプト
  - `00-test.sh` — `npm test` を実行、exit 0/1
  - `01-typecheck.sh` — `npx tsc --noEmit` を実行、exit 0/1
  - `02-e2e.sh` — `npx playwright test` を実行、exit 0/1
- **対応FR**: FR-4
- **依存**: Task-1
- **成果物**: `runner/gates/00-test.sh`, `runner/gates/01-typecheck.sh`, `runner/gates/02-e2e.sh`, `runner/test/gates.bats`
- **完了条件**: コマンド成否に応じた exit code、stdout/stderr 出力、コマンド不在時のエラーハンドリングのテストが GREEN

### Task-8: quality-gate.sh — 品質ゲート実行エンジン

- **やること**: gates/ ディレクトリ内のスクリプトを番号順に実行するエンジン
  - `check_quality` — quality_gates にマッチするゲートのみ実行
  - `should_run_gates` — ステップが品質ゲート適用対象か判定（tdd/simplify/test-quality/cleanup のみ適用）
- **対応FR**: FR-4, FR-10
- **依存**: Task-2, Task-7（quality-gate.sh は plan.json の quality_gates を読み、gates/ のスクリプトを呼ぶ）
- **成果物**: `runner/lib/quality-gate.sh`, `runner/test/quality-gate.bats`
- **完了条件**: quality_gates にマッチするゲートのみ実行される、番号順に実行される、非適用ステップ（code-review/verification/commit）ではゲートが実行されない、ログファイルが正しいパスに記録されるテストが GREEN

### Task-9: ralph-runner.sh — メインループ統合

- **やること**: 全コンポーネントを統合するメインループ
  - ストーリー選択 → ステップ実行 → 品質ゲート → 状態更新 → 学習記録のループ
  - `claude -p` の呼び出し（`--allowedTools` 付き）
  - ステップ単位リトライ（最大3回）
  - 失敗時の依存ストーリースキップ
  - ストーリー完了時に conventions-builder 呼び出し
  - `--dry-run` オプション（実行計画のプレビュー表示、claude -p は呼ばない）
  - 引数パース（plan.json パス指定等）、サマリ生成
- **対応FR**: FR-1, FR-2, FR-5, FR-7, FR-8
- **依存**: Task-3, Task-4, Task-5, Task-6, Task-8
- **成果物**: `runner/ralph-runner.sh`, `runner/test/ralph-runner.bats`
- **完了条件**（claude -p モック使用）:
  - ストーリーが depends_on 順に実行される
  - 品質ゲート適用対象ステップ（tdd/simplify/test-quality/cleanup）でのみゲートが実行される
  - ステップ失敗時に最大3回リトライし、3回失敗でストーリーを failed にする
  - failed ストーリーの依存先が skipped になる
  - commit ステップが人間承認なしで自動実行される
  - `--dry-run` で claude -p を呼ばずに実行計画が出力される
  - 全ストーリー完了後にサマリ JSON が生成される

### Task-10: 統合テスト — エンドツーエンドシナリオ

- **やること**: ralph-runner.sh を claude -p モックで E2E 実行
  - 正常系: 3ストーリーが依存順に完了
  - 異常系: 中間ストーリー失敗 → 後続 skipped
  - リトライ系: 1回失敗 → リトライ成功
  - learnings 蓄積 → conventions 昇格
- **対応FR**: FR-1〜FR-8, FR-10 の統合検証
- **依存**: Task-9
- **成果物**: `runner/test/integration.bats`
- **完了条件**: 全シナリオのテストが GREEN、plan.json/learnings.jsonl/conventions.md/runs/ の最終状態が期待通り

## 依存関係図

```
Task-1 (テスト基盤)
  ├→ Task-2 (state-manager: plan.json 基本操作)
  │    ├→ Task-3 (state-manager: 依存解決・スキップ・サマリ)
  │    │    └→ Task-4 (state-manager: learnings)
  │    │         ├→ Task-5 (prompt-builder)
  │    │         └→ Task-6 (conventions-builder)
  │    └→ Task-8 (quality-gate) ← Task-7 も必要
  └→ Task-7 (gates: 個別スクリプト)
       └→ Task-8 (quality-gate) ← Task-2 も必要

Task-3, Task-5, Task-6, Task-8 全完了
  └→ Task-9 (メインループ統合)
       └→ Task-10 (統合テスト)
```

## 実行順序

state-manager.sh は同一ファイルのため直列で開発する。

- **Step 1**: Task-1（テスト基盤）
- **Step 2**: Task-2（state-manager: 基本操作）
- **Step 3**: Task-3（state-manager: 依存解決）+ Task-7（gates: 並列可能）
- **Step 4**: Task-4（state-manager: learnings）+ Task-8（quality-gate: Task-7 完了後に並列可能）
- **Step 5**: Task-5, Task-6（prompt-builder, conventions-builder: 並列可能）
- **Step 6**: Task-9（メインループ統合）
- **Step 7**: Task-10（統合テスト）

## リスク・注意事項

1. **claude -p のモック**: Task-9, Task-10 では claude コマンドを PATH 上のモックスクリプトに差し替える。モックは stdout に LEARNING 行を含むテキストを出力
2. **jq 依存**: 全コンポーネントが jq に依存。Task-1 で jq の存在確認を組み込む
3. **bats 導入方式**: npm devDependency or brew/git submodule。Task-1 で決定
4. **conventions-builder の「類似」判定**: Phase 1 では完全一致で実装。将来的に改善
5. **planning スキルの変更（FR-9）**: plan.md → plan.json 移行は本計画のスコープ外。別計画で対応
