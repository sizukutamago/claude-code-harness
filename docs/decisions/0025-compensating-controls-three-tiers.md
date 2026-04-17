# 0025: 補償制御は MUST / SHOULD / NICE の 3 層セットで段階導入する

- **Status**: Accepted
- **Date**: 2026-04-17
- **Covers**: ralph-autonomous-mode

## 背景

承認ゲート廃止（ADR 0017）の代償として、loop の暴走・事故を防ぐ補償制御を組み込む必要がある。他事例（ralph 本家・guardrails.md・Claude Code Auto Mode）の調査から多数の制御パターンが存在するが、初期実装で全部を入れるのは重い。

## 選択肢

### 選択肢 A: MUST だけ最小セットで始める

- 安全性ギリギリ。運用中に漏れが見つかって事故る可能性

### 選択肢 B: 全部を初期実装に含める

- 安全だが実装コスト大、運用前に時間がかかる

### 選択肢 C: MUST / SHOULD / NICE の 3 層で段階導入（推奨）

- MUST: 初期実装必須、これがないと運用開始できない
- SHOULD: 運用開始前に追加、初期運用で欠けると問題が出る
- NICE: 後追いで追加、運用で必要性が見えてから

## 決定

**選択肢 C: 3 層セット段階導入**

ralph 本家・guardrails.md・Claude Code Auto Mode・Aider・Cline の事例から抽出した補償制御を 3 層に分類する。

## 結果

### MUST（初期実装必須）

| # | 制御 | 実装 | 出典 |
|---|------|------|------|
| 1 | Dual exit gate | loop runner が「全タスク passes」かつ「EXIT_SIGNAL マーカー」の両立を検出するまで継続 | frankbria/ralph-claude-code |
| 2 | Scope enforce | `allowed_paths` / `forbidden_paths` を PreToolUse hook で reject | guardrails.md / 自前 |
| 3 | No-progress circuit | 3 iter 連続でファイル変更ゼロ → 停止 | frankbria |
| 4 | Same-error circuit | 5 iter 連続で同一エラー文字列 → 停止 | frankbria |
| 5 | max_iter | 既定 10、config.json で override | snarktank |
| 6 | plan.md チェックボックス強制 | PostToolUse hook で diff 検査、チェックボックス以外の変更を reject | 自前 |
| 7 | Quality gate pass コミットのみ | gate fail 時は commit しない、fix-forward | snarktank / Aider |
| 8 | Git = feature branch + 人間 merge | loop は feature branch にしか push しない | ADR 0021 |

### SHOULD（運用開始前に追加）

| # | 制御 | 備考 |
|---|------|------|
| 1 | テスト only iter 検知 | 変更ファイルがテストのみの iter 比率 30% 超で停止（frankbria 由来） |
| 2 | チェックポイント tag | N iter 毎に `ralph-checkpoint-<N>` を打つ、rollback 経路確保 |
| 3 | Sign 形式 learnings | ADR 0024 の Phase 2 昇格 |
| 4 | RALPH_HALT kill switch | 特定ファイル存在で次 iter 停止、手動 kill 経路 |

### NICE（後追いで追加）

| # | 制御 | 備考 |
|---|------|------|
| 1 | Context rotation | 80% 使用量で強制リセット（guardrails.md 由来） |
| 2 | Rate limit | tool calls / iter 上限 |
| 3 | Error 類似度判定 | 同一エラー判定を文字列 match から意味類似に強化 |

### 初期実装のフェーズ

- Phase A（MUST のみ）: Autonomous モードの最小動作を成立させる。dogfood 限定で試す
- Phase B（MUST + SHOULD）: 外部プロジェクトへの提供を始める閾値
- Phase C（全部）: 運用が安定してから品質を押し上げる

### 実装場所

- hook スクリプト: `.claude/hooks/scripts/ralph-*.mjs`（新規）
- loop runner: `runner/ralph-autonomous/` 配下（新規、既存 `runner/ralph-runner.sh` v1 とは別モジュール）
- checkpoint tag / circuit breaker: loop runner 内で実装
- `.ralph/state.json` の更新で iter 間状態を受け渡す
